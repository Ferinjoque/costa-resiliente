"""Agentic copilot loop — multi-tool reasoning for disaster queries.

Flow:
  1. Input guardrail (regex)
  2. System + user messages → LLM with tool schemas
  3. If model emits tool_calls → execute tools → append results → repeat (max N)
  4. Final answer generation (structured Spanish prose citing DB rows)
  5. Output guardrail (redact leaks)
  6. Return AgentResult

The LLM never writes SQL.  It only emits structured tool_call JSON.
All data comes from parameterised whitelisted queries in tools/db_tools.py.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.config import settings
from costa_api.ai.gateway import gateway
from costa_api.ai.guardrails.input_filter import check_input, GuardResult
from costa_api.ai.guardrails.output_filter import sanitise
from costa_api.ai.tools.db_tools import TOOL_SCHEMAS, dispatch

logger = logging.getLogger(__name__)

_SYSTEM = """Eres el Copiloto Operativo de Costa Resiliente para Lima, Perú. Sistema de alertas de inundaciones y huaycos.

INSTRUCCIONES:
- SIEMPRE llama al menos una herramienta antes de responder. Usa los valores por defecto si no se especifican parámetros.
- Nunca inventes datos. Responde solo con lo que retornen las herramientas.
- Responde en español, máximo 3 oraciones."""


@dataclass
class AgentResult:
    answer: str
    sources: list[dict] = field(default_factory=list)
    tool_calls: list[dict] = field(default_factory=list)   # trace
    confidence: float = 0.8
    redacted: bool = False
    blocked: bool = False
    block_reason: str = ""


_KEYWORD_MAP: list[tuple[list[str], str]] = [
    (["inundaci", "desborde", "flood", "sar", "sentinel", "poligono"], "get_flood_polygons"),
    (["huayco", "quebrada", "deslizami", "flujo", "lahar"], "get_huayco_risk"),
    (["río", "rio", "nivel", "caudal", "estaci", "chosica", "rimac", "chillon"], "get_river_levels"),
    (["social", "reporte", "bluesky", "reddit", "señal", "vecino"], "get_social_clusters"),
    (["hospital", "escuela", "puente", "infraestructura", "afectad"], "get_infrastructure_impact"),
    (["lluvia", "precipitaci", "imerg", "acumul", "mm", "rain"], "get_rainfall_accumulation"),
    (["alerta", "alert", "activ", "emergencia"], "get_active_alerts"),
    (["protocolo", "evacu", "indeci", "minsa", "cenepred", "procedimiento"], "search_protocols"),
]


async def _keyword_dispatch(query: str, db, rag_fn) -> dict:
    """Fast keyword-based tool dispatch — fallback when LLM is unavailable."""
    q = query.lower()
    for keywords, tool_name in _KEYWORD_MAP:
        if any(kw in q for kw in keywords):
            from costa_api.ai.tools.db_tools import dispatch
            return await dispatch(tool_name, {}, db, rag_fn=rag_fn)
    # Default: try flood status
    from costa_api.ai.tools.db_tools import dispatch
    return await dispatch("get_flood_polygons", {}, db, rag_fn=rag_fn)


async def run(
    query: str,
    operator_id: str,
    db: AsyncSession,
    rag_fn=None,
) -> AgentResult:
    """
    Full agentic loop. Returns AgentResult.
    `rag_fn` optional coroutine: async (query, top_k) -> list[dict]
    """
    # 1. Input guardrail
    guard: GuardResult = check_input(query, operator_id)
    if not guard.ok:
        return AgentResult(
            answer="Consulta no permitida en este sistema de emergencias.",
            blocked=True,
            block_reason=guard.reason,
            confidence=0.0,
        )

    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": query},
    ]

    all_tool_results: list[dict] = []
    tool_call_trace: list[dict] = []
    max_iters = settings.llm_max_tool_iters

    # 2. Agentic loop
    llm_failed = False
    for iteration in range(max_iters):
        try:
            response = await gateway.chat(
                messages=messages,
                tools=TOOL_SCHEMAS,
                temperature=0.1,
            )
        except Exception as exc:
            logger.warning("LLM call failed (iter %d): %s — falling back to keyword dispatch", iteration, exc)
            llm_failed = True
            break

        # Always append assistant message to context
        messages.append(response["message"])

        tool_calls = gateway.extract_tool_calls(response)

        if not tool_calls:
            # Model chose to answer directly (no more tool calls needed)
            break

        # 3. Execute each requested tool
        tool_result_messages: list[dict] = []
        for call in tool_calls:
            fn = call.get("function", {})
            name = fn.get("name", "")
            args = fn.get("arguments", {})
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = {}

            result = await dispatch(name, args, db, rag_fn=rag_fn)
            tool_call_trace.append({"tool": name, "args": args, "count": result.get("count", 0)})

            if result.get("rows"):
                all_tool_results.extend(result["rows"])

            tool_result_messages.append({
                "role": "tool",
                "content": json.dumps(result, default=str, ensure_ascii=False),
            })

        # Append tool results (assistant message was already appended above)
        messages.extend(tool_result_messages)

    # 3b. LLM fallback: keyword-dispatch when model timed out or called no tools
    if llm_failed or (not all_tool_results and not tool_call_trace):
        kw_result = await _keyword_dispatch(query, db, rag_fn)
        if kw_result["rows"]:
            all_tool_results = kw_result["rows"]
            tool_call_trace.append({"tool": kw_result["tool"], "args": {}, "count": len(kw_result["rows"]), "fallback": True})

    # 4. Generate final Spanish answer
    answer = _build_answer(messages, all_tool_results, query)

    # 5. Output guardrail
    clean_answer, triggered = sanitise(answer, all_tool_results)
    redacted = bool(triggered)
    if redacted:
        logger.warning("output_guardrail triggered for op=%s labels=%s", operator_id, triggered)

    # Confidence: based on data availability
    confidence = 0.85 if all_tool_results else 0.3

    return AgentResult(
        answer=clean_answer,
        sources=json.loads(json.dumps(all_tool_results[:20], default=str)),
        tool_calls=tool_call_trace,
        confidence=confidence,
        redacted=redacted,
    )


def _build_answer(messages: list[dict], rows: list[dict], original_query: str) -> str:
    """Extract final answer from last assistant message, or summarise rows directly."""
    for msg in reversed(messages):
        if msg.get("role") == "assistant":
            content = msg.get("content", "").strip()
            if content and not msg.get("tool_calls"):
                return content

    if not rows:
        return "No se encontraron datos para el período consultado."

    # Generate a minimal Spanish summary from rows without calling the LLM
    n = len(rows)
    first = rows[0]

    if "area_km2" in first:
        total = sum(r.get("area_km2") or 0 for r in rows)
        return f"Se detectaron {n} polígono{'s' if n != 1 else ''} de inundación con área total de {total:.1f} km²."
    if "risk_level" in first:
        top = rows[0].get("name", "?")
        return f"Se identificaron {n} quebrada{'s' if n != 1 else ''} con riesgo elevado. La más crítica: {top}."
    if "level_m" in first:
        r = rows[0]
        return f"Última lectura: nivel {r.get('level_m', '—')} m, caudal {r.get('flow_m3s', '—')} m³/s en estación {r.get('name', '?')}."
    if "triage_label" in first:
        total = sum(r.get("count") or 0 for r in rows)
        return f"Se registraron {total} señales sociales en el período consultado."
    if "severity" in first:
        total = first.get("_total_active", n)
        # Break down by severity from sample (truthful even if capped at 20)
        sev_counts: dict[str, int] = {}
        for r in rows:
            sev_counts[r.get("severity", "?")] = sev_counts.get(r.get("severity", "?"), 0) + 1
        crit = sev_counts.get("critical", 0)
        high = sev_counts.get("high", 0)
        breakdown = []
        if crit: breakdown.append(f"{crit} crítica{'s' if crit != 1 else ''}")
        if high: breakdown.append(f"{high} alta{'s' if high != 1 else ''}")
        suffix = f" ({', '.join(breakdown)} entre las {n} más recientes)" if breakdown else ""
        capped = " (mostrando las 20 más recientes)" if total > n else ""
        return f"Hay {total} alerta{'s' if total != 1 else ''} activa{'s' if total != 1 else ''} en el sistema{capped}.{suffix}"
    if "acc_72h_mm" in first:
        mx = max((r.get("acc_72h_mm") or 0) for r in rows)
        return f"Acumulación máxima en 72h: {mx:.1f} mm. {'⚠ Umbral SUPERADO (>42mm)' if mx > 42 else 'Por debajo del umbral de alerta'}."

    return f"Se recuperaron {n} registros. Revise los datos adjuntos."
