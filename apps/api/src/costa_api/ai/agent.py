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

import asyncio
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

_SYSTEM = """Eres el Copiloto Operativo de Costa Resiliente, Lima Metropolitana. Apoyas al oficial de guardia del COER Lima durante emergencias de inundaciones y huaycos El Niño.

REGLAS:
- SIEMPRE llama al menos una herramienta. Nunca respondas sin datos de las herramientas.
- Nunca inventes cifras. Si herramienta retorna cero filas, dilo explícitamente.
- Personas afectadas → usa get_population_at_risk.
- Tendencia de ríos → usa get_river_levels (campo trend: rising/falling/stable).
- Protocolos INDECI/SINAGERD/EDAN → usa search_protocols.
- Albergues COMPROMETIDOS (inundados o en zona de riesgo) → usa get_infrastructure_impact.
- Albergues DISPONIBLES para evacuación o protocolo INDECI → usa search_protocols.
- Responde en español, 2-4 oraciones concisas. Menciona nivel SINAGERD (EMERGENCIA/ALERTA/AVISO) cuando aplique.
- Si algún río tiene trend=rising, destácalo como prioridad inmediata de evacuación.
- Umbrales ANA Lima: lluvia 72h >= 50mm → EMERGENCIA (escalar a COEN). 72h >= 25mm → ALERTA (activar brigadas). 24h >= 15mm → AVISO.
- Nombra los distritos y quebradas específicos cuando los datos los incluyan.
- Para preguntas sobre EDAN o formularios INDECI, usa search_protocols y cita los pasos específicos.
- Termina con una acción concreta recomendada al operador cuando la severidad sea alta o crítica."""


@dataclass
class AgentResult:
    answer: str
    sources: list[dict] = field(default_factory=list)
    tool_calls: list[dict] = field(default_factory=list)   # trace
    confidence: float = 0.8
    redacted: bool = False
    blocked: bool = False
    block_reason: str = ""
    quick_mode: bool = False  # True when LLM was bypassed for a fast template answer
    mode: str = "full"  # "sitrep" | "quick" | "full"


# ─── Quick-mode patterns ──────────────────────────────────────────────────────
# Maps (keyword-set, tool_name). First match wins.
# These 5 cover the most common duty-officer queries at 3am.
# Bypass LLM entirely: keyword match → DB tool → template answer (~2s).

_QUICK_PATTERNS: list[tuple[list[str], str]] = [
    # "alerta" alone is too broad (catches "mensaje de alerta", "redacta una alerta").
    # Require an operational qualifier word alongside it.
    (["alertas activ", "alerta activ", "cuántas alert", "cuantas alert",
      "emergencia activ", "qué alertas", "que alertas", "alertas ahora",
      "alertas critic", "nivel crítico", "nivel critico",
      "alertas en lima", "alertas de", "situacion actual", "situación actual",
      "resumen de", "resumen operacional", "qué está pasando", "que esta pasando",
      "estado actual", "novedades", "reporte actual"], "get_active_alerts"),
    (["nivel del río", "nivel del rim", "nivel del chill", "nivel del lurin",
      "nivel del rio", "cota del rio", "lectura hidro",
      "caudal", "río rímac", "río rimac", "rio rimac", "río chillon", "río lurín",
      "rimac", "rímac", "chillon", "chillón", "lurin", "lurín",
      "chosica", "carapongo", "ñaña", "estacion hidrol",
      "lectura del río", "cota", "aforo", "stage"], "get_river_levels"),
    (["inundad", "inundaci", "inundación", "flood", "sar", "polígono", "poligono",
      "zona inund", "km² inund", "km2 inund",
      "desborde", "desbordamiento", "anegad", "anegami",
      "extensión inundada", "area inundada", "zona afectada por agua"], "get_flood_polygons"),
    (["lluvia", "precipitaci", "imerg", "acumul", " mm ", "mm/", "/mm", "mm72", "mm24",
      "cuánta lluvia", "cuanta lluvia", "pronóst", "pronost",
      "rain", "precipitación acumul", "lluvia 72h", "lluvia 24h"], "get_rainfall_accumulation"),
    (["poblaci", "personas", "habitantes", "afectad", "riesgo pob",
      "cuántas personas", "cuántos", "cuantos",
      "población en riesgo", "cuántas familias", "cuantas familias",
      "viviendas afectadas", "casas afectadas", "cuántas viviendas"], "get_population_at_risk"),
    (["huayco", "quebrada", "deslizami", "flujo de barro", "lahar",
      "colapso", "rotura", "dique", "zona de riesgo", "riesgo alto",
      "huaycoloro", "pedregal", "quirio", "carapongo"], "get_huayco_risk"),
    (["social", "señal", "vecin", "bluesky", "reddit", "telegram",
      "reporte de campo", "campo", "huayco_observ", "flood_observ",
      "avistamiento", "reportes reciente", "ciudadanos", "comunidad",
      "vías bloqueadas", "vias bloqueadas", "heridos", "muertos", "víctimas",
      "informe de campo", "observacion", "daños reportad"], "get_social_clusters"),
    (["hospital", "escuela", "puente", "infraestructura", "vial",
      "abastecimiento", "servicios básicos", "subestaci", "bomba", "bomberos"], "get_infrastructure_impact"),
    (["protocolo", "indeci", "sinagerd", "procedimiento", "evacu",
      "plan de evacuación", "plan de respuesta", "minsa", "cenepred",
      "qué hacer", "que hacer", "pasos a seguir", "acción inmediata",
      "edan", "formulario edan", "ficha edan", "reporte edan",
      "albergue", "refugio", "centro de evacuaci", "centro evacu",
      "dónde evacuar", "donde evacuar", "punto de reunión"], "search_protocols"),
]


_SITREP_PHRASES = [
    "resumen completo", "informe de situación", "informe de situacion",
    "sitrep", "sit rep", "inicio de guardia", "relevo de guardia",
    "traspaso de guardia", "dame todo", "dame un resumen general",
    "qué hay de nuevo", "que hay de nuevo", "cómo está la emergencia",
    "estado general de", "situacion general", "situación general",
    "panorama completo", "vision general", "visión general",
    "reporte de situación", "reporte de situacion",
    "balance de la guardia", "despacho de guardia", "balance operacional",
    "resumen ejecutivo", "punto de situación", "reporte de turno",
    "cómo vamos", "como vamos", "panorama actual", "estado de situación",
    "como esta lima", "estado del sistema", "novedades de la emergencia",
    "me pones al día", "ponme al dia", "actualización del cuartel",
    "estado general", "que esta pasand", "qué está pasand", "que hay de nuevo", "qué hay de nuevo",
    "cómo estamos", "como estamos", "panorama general",
    "ponme al día", "al día de la situaci",
    "resumen de la situaci", "como van las cosas", "estado operacional",
    "reporte del turno", "tienes para mi guardia", "tienes para la guardia",
]

def _is_sitrep_query(query: str) -> bool:
    """True when the operator wants a comprehensive multi-source situation summary."""
    q = query.lower()
    return any(phrase in q for phrase in _SITREP_PHRASES)


def _detect_quick(query: str) -> str | None:
    """Return tool_name if exactly one quick-mode pattern matches, else None."""
    q = query.lower()
    matches = [tool for keywords, tool in _QUICK_PATTERNS if any(kw in q for kw in keywords)]
    return matches[0] if len(matches) == 1 else None


def _detect_multi_quick(query: str) -> list[str]:
    """Return all matched tool names when 2-3 quick patterns fire.

    Multi-signal queries (e.g. "río + huayco", "lluvia + inundación") are
    executed sequentially without LLM, giving fast (~3-5s) combined answers.
    LLM path is reserved for open-ended, synthesis, or drafting queries
    where no quick pattern matches at all.
    """
    q = query.lower()
    seen: list[str] = []
    for keywords, tool in _QUICK_PATTERNS:
        if any(kw in q for kw in keywords) and tool not in seen:
            seen.append(tool)
    return seen if 2 <= len(seen) <= 3 else []


_KEYWORD_MAP: list[tuple[list[str], str]] = [
    (["poblaci", "personas", "habitantes", "afectad", "riesgo pob", "familias"], "get_population_at_risk"),
    (["inundaci", "desborde", "flood", "sar", "sentinel", "poligono", "anegad"], "get_flood_polygons"),
    (["huayco", "quebrada", "deslizami", "flujo", "lahar", "colapso", "rotura", "dique",
      "huaycoloro", "pedregal", "zona de riesgo"], "get_huayco_risk"),
    (["río", "rio", "nivel", "caudal", "estaci", "chosica", "rimac", "chillon", "cota", "aforo"], "get_river_levels"),
    (["social", "reporte", "bluesky", "reddit", "señal", "vecino", "ciudadano", "avistamiento"], "get_social_clusters"),
    (["hospital", "escuela", "puente", "infraestructura", "albergue", "refugio", "evacu"], "get_infrastructure_impact"),
    (["lluvia", "precipitaci", "imerg", "acumul", "mm", "rain", "pronóst"], "get_rainfall_accumulation"),
    (["alerta", "alert", "activ", "emergencia", "situacion", "novedades"], "get_active_alerts"),
    (["protocolo", "indeci", "minsa", "cenepred", "procedimiento", "qué hacer", "pasos"], "search_protocols"),
]


_TOOL_SCHEMA_BY_NAME: dict[str, dict] = {
    s["function"]["name"]: s for s in TOOL_SCHEMAS
}

# Maps keyword hints to the 1-2 primary tools most likely needed.
# Used to pre-select schemas before sending to LLM — fewer input tokens
# = faster inference on CPU (generation cost scales with context length).
_TOOL_HINT_MAP: list[tuple[list[str], list[str]]] = [
    (["poblaci", "personas", "habitantes", "riesgo pob", "cuántas personas"],
     ["get_population_at_risk", "get_flood_polygons"]),
    (["inundaci", "desborde", "flood", "sar", "sentinel", "polígono", "poligono", "zona inund"],
     ["get_flood_polygons", "get_active_alerts"]),
    (["huayco", "quebrada", "deslizami", "flujo", "lahar"],
     ["get_huayco_risk", "get_river_levels"]),
    (["río", "rio", "nivel", "caudal", "rimac", "chillon", "chillón", "chosica", "carapongo"],
     ["get_river_levels", "get_flood_polygons"]),
    (["social", "reporte", "bluesky", "reddit", "señal", "vecino"],
     ["get_social_clusters", "get_active_alerts"]),
    (["hospital", "escuela", "puente", "infraestructura", "vial"],
     ["get_infrastructure_impact", "get_flood_polygons"]),
    (["lluvia", "precipitaci", "imerg", "acumul", "pronóst", "pronost", "72h"],
     ["get_rainfall_accumulation", "get_river_levels"]),
    (["protocolo", "evacu", "indeci", "minsa", "cenepred", "procedimiento", "sinagerd",
       "albergue", "refugio", "qué hacer", "edan", "acción"],
     ["search_protocols", "get_active_alerts"]),
    (["alertas activ", "alerta activ", "situacion", "situación", "novedades", "nivel sinagerd"],
     ["get_active_alerts", "get_rainfall_accumulation"]),
]


def _select_tools(query: str) -> list[dict]:
    """Return 2-4 tool schemas most relevant to the query.

    Reduces LLM input context (~1000 tokens saved for unrelated tools)
    which cuts CPU inference time roughly proportionally.
    Matched candidates de-duplicate; fallback to all schemas if no match.
    """
    q = query.lower()
    selected: dict[str, dict] = {}
    for keywords, tools in _TOOL_HINT_MAP:
        if any(kw in q for kw in keywords):
            for t in tools:
                if t in _TOOL_SCHEMA_BY_NAME:
                    selected[t] = _TOOL_SCHEMA_BY_NAME[t]
    # Always include get_active_alerts for situational-awareness context
    selected.setdefault("get_active_alerts", _TOOL_SCHEMA_BY_NAME["get_active_alerts"])
    if len(selected) >= len(TOOL_SCHEMAS) - 1:
        return TOOL_SCHEMAS
    result = list(selected.values())
    logger.debug("_select_tools: %d schemas selected for query", len(result))
    return result


async def _keyword_dispatch(query: str, db, rag_fn) -> dict:
    """Fast keyword-based tool dispatch — fallback when LLM is unavailable.
    Falls back to get_active_alerts (more operationally relevant than flood polygons).
    """
    q = query.lower()
    for keywords, tool_name in _KEYWORD_MAP:
        if any(kw in q for kw in keywords):
            args = {"query": query} if tool_name == "search_protocols" else {}
            return await dispatch(tool_name, args, db, rag_fn=rag_fn)
    return await dispatch("get_active_alerts", {}, db, rag_fn=rag_fn)


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

    # 1b-sitrep: start-of-shift comprehensive snapshot — 5 tools sequentially.
    # Tools run sequentially (not gather) to avoid concurrent-session race on
    # the shared AsyncSession — parallel dispatch was causing some tools to
    # return empty results when they should have returned data.
    if _is_sitrep_query(query):
        try:
            sitrep_tools = ["get_active_alerts", "get_rainfall_accumulation",
                            "get_river_levels", "get_flood_polygons", "get_huayco_risk"]
            sitrep_results = []
            for t in sitrep_tools:
                try:
                    sitrep_results.append(await dispatch(t, {}, db, rag_fn=rag_fn))
                except Exception as exc:
                    logger.warning("sitrep tool %s failed: %s", t, exc)
                    sitrep_results.append(exc)
            all_rows: list[dict] = []
            per_tool_rows: list[tuple[str, list[dict]]] = []
            tc_list = []
            for tool_name, res in zip(sitrep_tools, sitrep_results):
                if isinstance(res, Exception):
                    logger.warning("sitrep tool %s failed: %s", tool_name, res)
                    continue
                rows = res.get("rows", [])
                all_rows.extend(rows)
                per_tool_rows.append((tool_name, rows))
                tc_list.append({"tool": tool_name, "count": len(rows), "quick_mode": True})
            if all_rows:
                combined = _build_sitrep_answer(per_tool_rows)
                if combined:
                    clean_answer, triggered = sanitise(combined, all_rows)
                    logger.info("sitrep_mode hit: tools=%s rows=%d op=%s", sitrep_tools, len(all_rows), operator_id)
                    return AgentResult(
                        answer=clean_answer,
                        sources=json.loads(json.dumps(all_rows[:20], default=str)),
                        tool_calls=tc_list,
                        confidence=0.9,
                        redacted=bool(triggered),
                        quick_mode=True,
                        mode="sitrep",
                    )
            elif per_tool_rows:
                # All tools returned but all have zero rows — system is calm
                logger.info("sitrep_mode: all 5 tools returned 0 rows — no active emergency")
                return AgentResult(
                    answer="**SITREP — Lima Metropolitana**: Sin alertas activas, sin inundaciones SAR detectadas, sin riesgo crítico de huayco, niveles hidrológicos normales. Sistema en estado NORMAL.",
                    sources=[],
                    tool_calls=tc_list,
                    confidence=0.85,
                    quick_mode=True,
                    mode="sitrep",
                )
        except Exception as exc:
            logger.warning("sitrep_mode failed: %s — falling through to full agent", exc)

    # 1c. Quick-mode: bypass LLM for single common query type (~2s vs 15-30s)
    quick_tool = _detect_quick(query)
    if quick_tool:
        try:
            # search_protocols requires the query string in args (rag_fn needs it to embed)
            quick_args = {"query": query} if quick_tool == "search_protocols" else {}
            result = await dispatch(quick_tool, quick_args, db, rag_fn=rag_fn)
            rows = result.get("rows", [])
            answer = _build_answer([], rows, query)
            clean_answer, triggered = sanitise(answer, rows)
            logger.info("quick_mode hit: tool=%s rows=%d op=%s", quick_tool, len(rows), operator_id)
            return AgentResult(
                answer=clean_answer,
                sources=json.loads(json.dumps(rows[:20], default=str)),
                tool_calls=[{"tool": quick_tool, "args": quick_args, "count": len(rows), "quick_mode": True}],
                confidence=0.9 if rows else 0.4,
                redacted=bool(triggered),
                quick_mode=True,
                mode="quick",
            )
        except Exception as exc:
            logger.warning("quick_mode dispatch failed (%s): %s — falling through to full agent", quick_tool, exc)

    # 1d. Multi-quick-mode: 2-3 signals matched → parallel tool calls, no LLM (~3s)
    multi_tools = _detect_multi_quick(query)
    if multi_tools:
        try:
            # Run tools sequentially to avoid concurrent-session race on shared AsyncSession
            raw_results = []
            for t in multi_tools:
                try:
                    raw_results.append(await dispatch(
                        t, {"query": query} if t == "search_protocols" else {}, db, rag_fn=rag_fn
                    ))
                except Exception as exc:
                    logger.warning("multi_quick tool %s failed: %s", t, exc)
                    raw_results.append(exc)
            all_rows: list[dict] = []
            per_tool_rows: list[tuple[str, list[dict]]] = []
            tc_list = []
            for tool_name, res in zip(multi_tools, raw_results):
                if isinstance(res, Exception):
                    logger.warning("multi_quick tool %s failed: %s", tool_name, res)
                    continue
                rows = res.get("rows", [])
                all_rows.extend(rows)
                per_tool_rows.append((tool_name, rows))
                tc_list.append({"tool": tool_name, "count": len(rows), "quick_mode": True})
            if all_rows:
                # Generate per-tool summaries and join — avoids _build_answer
                # using only the first row type when schemas are heterogeneous.
                parts = [_build_answer([], rows, query) for _, rows in per_tool_rows if rows]
                answer = " | ".join(p for p in parts if p and "No se encontraron" not in p) or _build_answer([], all_rows, query)
                clean_answer, triggered = sanitise(answer, all_rows)
                logger.info("multi_quick hit: tools=%s rows=%d op=%s", multi_tools, len(all_rows), operator_id)
                return AgentResult(
                    answer=clean_answer,
                    sources=json.loads(json.dumps(all_rows[:20], default=str)),
                    tool_calls=tc_list,
                    confidence=0.85 if all_rows else 0.4,
                    redacted=bool(triggered),
                    quick_mode=True,
                    mode="quick",
                )
            else:
                logger.warning("multi_quick: all tools returned empty rows for tools=%s — falling through to full agent", multi_tools)
        except Exception as exc:
            logger.warning("multi_quick failed: %s — falling through to full agent", exc)

    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": query},
    ]

    all_tool_results: list[dict] = []
    tool_call_trace: list[dict] = []
    max_iters = settings.llm_max_tool_iters
    selected_schemas = _select_tools(query)

    # 2. Agentic loop
    llm_failed = False
    for iteration in range(max_iters):
        try:
            response = await gateway.chat(
                messages=messages,
                tools=selected_schemas,
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

        # 3. Execute all requested tools in parallel
        parsed_calls: list[tuple[str, dict]] = []
        for call in tool_calls:
            fn = call.get("function", {})
            name = fn.get("name", "")
            args = fn.get("arguments", {})
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError as _json_err:
                    logger.warning("Tool %s emitted malformed JSON args: %s — using empty args", name, _json_err)
                    args = {}
            parsed_calls.append((name, args))

        # Run tools sequentially to avoid concurrent-session race on shared AsyncSession.
        raw_results = []
        for name, args in parsed_calls:
            try:
                raw_results.append(await dispatch(name, args, db, rag_fn=rag_fn))
            except Exception as exc:
                raw_results.append(exc)

        tool_result_messages: list[dict] = []
        for (name, args), result in zip(parsed_calls, raw_results):
            if isinstance(result, Exception):
                logger.error("Tool %s raised: %s", name, result)
                result = {"tool": name, "rows": [], "count": 0, "error": str(result)}
            tool_call_trace.append({"tool": name, "args": args, "count": result.get("count", 0)})
            if result.get("rows"):
                all_tool_results.extend(result["rows"])
            tool_result_messages.append({
                "role": "tool",
                "content": json.dumps(result, default=str, ensure_ascii=False),
            })

        # Append tool results (assistant message was already appended above)
        messages.extend(tool_result_messages)

    # 3b. LLM fallback: keyword-dispatch when model timed out or called no tools.
    # If tools were called but all returned empty data, we keep the trace as-is
    # (legitimate "no data" state — callers see it as no results, not an error).
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
        # Append visible marker so operators know content was filtered — a silently
        # truncated answer looks complete and could be acted on as if it were authoritative.
        clean_answer = clean_answer + " [⚠ contenido filtrado por guardrail de seguridad]"

    # Confidence: based on data availability
    confidence = 0.85 if all_tool_results else 0.3

    return AgentResult(
        answer=clean_answer,
        sources=json.loads(json.dumps(all_tool_results[:20], default=str)),
        tool_calls=tool_call_trace,
        confidence=confidence,
        redacted=redacted,
    )


# SENAMHI alert thresholds (meters) per station name fragment — module-level for shared use
_STATION_THRESHOLDS: dict[str, float] = {
    "chosica": 2.5, "carapongo": 2.0, "chaclacayo": 1.5,
    "carabayllo": 2.5, "huachipa": 1.8, "manchay": 1.2, "obrajillo": 1.8,
}


def _build_answer(messages: list[dict], rows: list[dict], original_query: str) -> str:
    """Extract final answer from last assistant message, or summarise rows directly."""
    for msg in reversed(messages):
        if msg.get("role") == "assistant":
            content = msg.get("content", "").strip()
            if content and not msg.get("tool_calls"):
                return content

    if not rows:
        return "No se encontraron datos en las fuentes consultadas para el período actual. Verifique el estado de los sensores en el panel Fuentes de datos o amplíe la ventana temporal."

    # Generate a minimal Spanish summary from rows without calling the LLM
    n = len(rows)
    first = rows[0]

    if "area_km2" in first:
        total = sum(r.get("area_km2") or 0 for r in rows)
        # Largest polygon by area — most operationally significant
        largest = max(rows, key=lambda r: r.get("area_km2") or 0)
        largest_area = largest.get("area_km2", 0)
        largest_district = largest.get("district_name") or largest.get("district")
        district_note = f" Mayor en {largest_district} ({largest_area:.1f} km²)" if largest_district else ""
        return f"Se detectaron {n} polígono{'s' if n != 1 else ''} de inundación SAR — total {total:.1f} km².{district_note}"
    if "risk_level" in first:
        top = rows[0]
        top_name = top.get("name", "?")
        top_prob = top.get("probability")
        top_level = top.get("risk_level", "")
        top_trigger = top.get("trigger_rain_24h_mm")
        level_es = {"very_high": "MUY ALTO", "high": "ALTO", "medium": "MEDIO"}.get(top_level, top_level.upper())
        prob_str = f" (prob. {float(top_prob):.2f})" if top_prob is not None else ""
        trigger_str = f" · umbral activación: {float(top_trigger):.0f} mm/24h" if top_trigger is not None else ""
        # Count very_high (imminent activation) vs high
        very_high = [r for r in rows if r.get("risk_level") == "very_high"]
        if very_high:
            vh_names = ", ".join(r.get("name", "?") for r in very_high[:2])
            vh_note = f" · {len(very_high)} quebrada{'s' if len(very_high) != 1 else ''} en umbral CRÍTICO: {vh_names}"
        else:
            vh_note = ""
        return (
            f"Se identificaron {n} quebrada{'s' if n != 1 else ''} con riesgo elevado. "
            f"La más crítica: {top_name} — {level_es}{prob_str}{trigger_str}{vh_note}."
        )
    if "level_m" in first:
        r = rows[0]
        trend = r.get("trend", "unknown")
        trend_es = {"rising": "↑ subiendo", "falling": "↓ bajando", "stable": "estable", "unknown": "—"}.get(trend, "—")
        change = r.get("level_change_1h_m")
        try:
            change_str = f" ({float(change):+.3f} m en 1h)" if change is not None else ""
        except (TypeError, ValueError):
            change_str = ""
        # Highlight rising stations most critical for duty officer
        rising = [row for row in rows if row.get("trend") == "rising"]
        def _threshold_note(row: dict) -> str:
            name_lower = (row.get("name") or "").lower()
            for key, threshold in _STATION_THRESHOLDS.items():
                if key in name_lower:
                    level = row.get("level_m")
                    if level is not None:
                        lv = float(level)
                        if lv >= threshold:
                            return f" · umbral: {threshold:.1f} m (⚠ SOBRE umbral ALERTA SENAMHI)"
                        elif lv >= threshold * 0.9:
                            return f" · umbral: {threshold:.1f} m (⚠ acercándose al umbral)"
                        else:
                            return f" · umbral: {threshold:.1f} m (bajo umbral)"
            return ""

        if rising:
            # Show top rising station with full detail
            top = rising[0]
            top_change = top.get("level_change_1h_m")
            try:
                top_change_str = f" ({float(top_change):+.3f} m/h)" if top_change is not None else ""
            except (TypeError, ValueError):
                top_change_str = ""
            top_flow = top.get("flow_m3s")
            top_flow_str = f" · {top_flow} m³/s" if top_flow is not None else ""
            threshold_note = _threshold_note(top)
            names = ", ".join(row.get("name", "?") for row in rising[:3])
            return (
                f"⚠ {len(rising)} estación(es) en ascenso — acción inmediata: {names}. "
                f"{top.get('name','?')}: {top.get('level_m','—')} m{top_change_str}{top_flow_str}{threshold_note}."
            )
        return f"Última lectura: {r.get('name','?')} — nivel {r.get('level_m','—')} m ({trend_es}{change_str}), caudal {r.get('flow_m3s','—')} m³/s{_threshold_note(r)}."
    if "triage_label" in first:
        total = sum(r.get("count") or 0 for r in rows)
        # Highlight urgent label breakdown (huayco > needs_help > flood > infra > road)
        _URGENT_ORDER = ["huayco_observation", "needs_help", "flood_observation", "infrastructure_damage", "road_blocked"]
        _LABEL_ES = {
            "huayco_observation": "avistamientos huayco",
            "needs_help": "solicitudes de ayuda",
            "flood_observation": "avistamientos inundación",
            "infrastructure_damage": "daños infraestructura",
            "road_blocked": "vías bloqueadas",
        }
        urgent_parts = []
        huayco_cnt = 0
        help_cnt = 0
        for lbl in _URGENT_ORDER:
            cnt = next((r.get("count", 0) for r in rows if r.get("triage_label") == lbl), 0)
            if cnt:
                urgent_parts.append(f"{cnt} {_LABEL_ES.get(lbl, lbl)}")
                if lbl == "huayco_observation": huayco_cnt = cnt
                elif lbl == "needs_help": help_cnt = cnt
        breakdown = f" ({', '.join(urgent_parts)})" if urgent_parts else ""
        # Add ⚠ when critical thresholds for social cluster alerts are reached
        # (alert generator fires at huayco>=3, needs_help>=5)
        urgency = ""
        if huayco_cnt >= 3:
            urgency = " ⚠ UMBRAL HUAYCO SUPERADO — revisar alertas automáticas."
        elif help_cnt >= 5:
            urgency = " ⚠ Múltiples solicitudes de ayuda — activar respuesta de campo."
        return f"Se registraron {total} señales sociales en el período consultado{breakdown}.{urgency}"
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
        # Compute SINAGERD level
        sinagerd = "EMERGENCIA" if crit > 0 else ("ALERTA" if high > 1 or total > 4 else "AVISO" if total > 0 else "NORMAL")
        base = f"Hay {total} alerta{'s' if total != 1 else ''} activa{'s' if total != 1 else ''} — nivel SINAGERD {sinagerd}{capped}.{suffix}"
        # Mention the top critical alert by title for immediate operator context
        top_crit = next((r for r in rows if r.get("severity") == "critical"), None)
        if top_crit and top_crit.get("title"):
            district_note = f" ({top_crit.get('district_name')})" if top_crit.get("district_name") else ""
            # For rainfall alerts, include the accumulation values from source_refs
            refs = top_crit.get("source_refs") or {}
            rain_note = ""
            if top_crit.get("alert_type") == "rainfall" and isinstance(refs, dict):
                mm72 = refs.get("acc_72h_mm")
                if mm72 is not None:
                    rain_note = f" — {float(mm72):.0f} mm/72h"
            base += f" ⚠ Más crítica: {top_crit['title']}{district_note}{rain_note}."
        return base
    if "acc_72h_mm" in first:
        mx = max((r.get("acc_72h_mm") or 0) for r in rows)
        mx_ws = next((r.get("watershed") for r in rows if (r.get("acc_72h_mm") or 0) == mx), "cuenca")
        mx_row = next((r for r in rows if (r.get("acc_72h_mm") or 0) == mx), first)
        acc_24h = mx_row.get("acc_24h_mm")
        acc_1h = mx_row.get("acc_1h_mm")
        if mx >= 50.0:
            status = f"⚠ EMERGENCIA — supera umbral CRÍTICO ANA (>{50:.0f} mm/72h)"
        elif mx >= 25.0:
            status = f"⚠ ALERTA — supera umbral ALTO ANA (>{25:.0f} mm/72h)"
        elif (acc_24h or 0) >= 15:
            status = f"⚠ AVISO — lluvia 24h supera umbral ANA ({float(acc_24h or 0):.0f} mm)"
        else:
            status = "Por debajo del umbral de alerta SENAMHI (25 mm/72h)"
        # Build detail string — skip windows with 0mm (not operationally useful)
        detail_parts = [f"72h: {mx:.1f} mm"]
        if acc_24h is not None and acc_24h > 0: detail_parts.append(f"24h: {acc_24h:.1f} mm")
        if acc_1h is not None and acc_1h > 0: detail_parts.append(f"1h: {acc_1h:.1f} mm")
        detail = " · ".join(detail_parts)
        return f"Cuenca {mx_ws} — {detail}. {status}."
    if "estimated_population_at_risk" in first:
        total = sum(int(r.get("estimated_population_at_risk") or 0) for r in rows)
        # Show top 3 districts for context
        top_districts = [f"{r.get('district', '?')} (~{int(r.get('estimated_population_at_risk') or 0):,})" for r in rows[:3]]
        district_list = ", ".join(top_districts)
        # Include total flood scenes and max model confidence for context
        total_scenes = sum(int(r.get("flood_scenes") or 0) for r in rows)
        scene_note = f" · {total_scenes} polígono{'s' if total_scenes != 1 else ''} SAR" if total_scenes > 0 else ""
        max_conf = max((r.get("max_confidence") or 0.0 for r in rows), default=None)
        conf_note = f" · confianza del modelo: {float(max_conf):.0%}" if max_conf else ""
        return (
            f"Estimado {total:,} personas en zonas inundadas ({n} distrito{'s' if n != 1 else ''}{scene_note}{conf_note}): {district_list}."
        )

    if "flood_confidence" in first and "type" in first:
        # Infrastructure rows (get_infrastructure_impact)
        TYPE_ES: dict[str, str] = {
            "hospital": "hospital(es)", "school": "colegio(s)",
            "bridge": "puente(s)", "substation": "subestación(es)",
            "fire_station": "bombero(s)", "shelter": "albergue(s)",
        }
        by_type: dict[str, int] = {}
        for r in rows:
            t = r.get("type") or "?"
            by_type[t] = by_type.get(t, 0) + 1
        parts = [f"{cnt} {TYPE_ES.get(t, t)}" for t, cnt in sorted(by_type.items(), key=lambda x: -x[1])]
        breakdown = ", ".join(parts[:4])
        # Show names of critical infrastructure (hospitals first)
        hosp_names = [r.get("name") for r in rows if r.get("type") == "hospital" and r.get("name")][:2]
        name_note = f" Hospitales afectados: {', '.join(hosp_names)}." if hosp_names else ""
        return (
            f"⚠ {n} infraestructura(s) crítica(s) dentro de zonas inundadas: {breakdown}.{name_note} "
            f"Verificar accesibilidad para respuesta de emergencia."
        )

    if "chunk" in first:
        # Protocol/RAG rows — synthesise top excerpts (up to 3 most relevant chunks)
        # Deduplicate by title so multiple chunks from same doc don't crowd out others.
        seen_titles: set[str] = set()
        parts: list[str] = []
        title_list: list[str] = []
        for r in rows[:5]:
            title = (r.get("title") or "protocolo").strip()
            chunk = (r.get("chunk") or "").strip()
            if not chunk:
                continue
            if title not in seen_titles:
                seen_titles.add(title)
                title_list.append(title)
            if len(parts) < 3:
                parts.append(chunk[:250] + ("…" if len(chunk) > 250 else ""))
        combined = " ".join(parts)
        titles_str = " / ".join(title_list[:3])
        return f"Protocolos relevantes: {titles_str}. {combined}"

    return f"Se recuperaron {n} registros. Revise los datos adjuntos."


def _build_sitrep_answer(per_tool_rows: list[tuple[str, list[dict]]]) -> str:
    """Synthesise a cohesive SITREP narrative from 5 sequential tool results.

    Format:  ALERTAS · LLUVIA · RÍOS · INUNDACIÓN · HUAYCO → ordered bullets → acción.
    More readable than a pipe-joined string of independent _build_answer() calls.
    """
    sections: list[str] = []
    action: str = ""

    tool_rows = {name: rows for name, rows in per_tool_rows}

    # 1. Active alerts
    alert_rows = tool_rows.get("get_active_alerts", [])
    if alert_rows:
        total = alert_rows[0].get("_total_active", len(alert_rows))
        crit = sum(1 for r in alert_rows if r.get("severity") == "critical")
        high = sum(1 for r in alert_rows if r.get("severity") == "high")
        level = "EMERGENCIA" if crit > 0 else ("ALERTA" if high > 1 or total > 4 else "AVISO")
        sev_note = []
        if crit: sev_note.append(f"{crit} crítica{'s' if crit != 1 else ''}")
        if high: sev_note.append(f"{high} alta{'s' if high != 1 else ''}")
        sev_str = f" ({', '.join(sev_note)})" if sev_note else ""
        top_crit = next((r for r in alert_rows if r.get("severity") == "critical"), None)
        if top_crit and top_crit.get("title"):
            refs = top_crit.get("source_refs") or {}
            mm72 = refs.get("acc_72h_mm") if isinstance(refs, dict) else None
            rain_note = f" ({float(mm72):.0f} mm/72h)" if mm72 is not None else ""
            crit_note = f" · más crítica: {top_crit['title']}{rain_note}"
        else:
            crit_note = ""
        sections.append(f"**Alertas:** {total} activa{'s' if total != 1 else ''}{sev_str} — nivel SINAGERD {level}{crit_note}")
        if crit > 0:
            action = "Activar protocolo EDAN y escalar a COEN para alertas críticas."

    # 2. Rainfall
    rain_rows = tool_rows.get("get_rainfall_accumulation", [])
    if rain_rows:
        mx = max((r.get("acc_72h_mm") or 0) for r in rain_rows)
        mx_row = next((r for r in rain_rows if (r.get("acc_72h_mm") or 0) == mx), rain_rows[0])
        ws = mx_row.get("watershed", "cuenca")
        acc_24h = mx_row.get("acc_24h_mm")
        detail_24h = f" · 24h: {acc_24h:.0f} mm" if acc_24h is not None else ""
        if mx >= 50.0:
            sections.append(f"**Lluvia:** {ws} — 72h: {mx:.0f} mm{detail_24h} ⚠ EMERGENCIA (>50 mm ANA)")
            if not action:
                action = "Escalar a COEN. Activar evacuación preventiva quebradas cuenca " + ws + "."
            elif "EDAN" in action:
                # Augment existing critical-alert action with specific evacuation directive
                action = action.rstrip(".") + f". Activar evacuación preventiva quebradas cuenca {ws}."
        elif mx >= 25.0:
            sections.append(f"**Lluvia:** {ws} — 72h: {mx:.0f} mm{detail_24h} — ALERTA (>25 mm ANA)")
            if not action:
                action = "Activar brigadas de campo en quebradas cuenca " + ws + "."
            elif action and "brigadas" not in action:
                # Augment existing action with ALERTA rain directive
                action = action.rstrip(".") + f". Activar brigadas de campo en quebradas cuenca {ws}."
        elif acc_24h is not None and acc_24h >= 15:
            sections.append(f"**Lluvia:** {ws} — 24h: {acc_24h:.0f} mm — AVISO (>15 mm/24h ANA)")
        elif mx > 0:
            sections.append(f"**Lluvia:** {ws} — 72h: {mx:.0f} mm — bajo umbral")

    # 3. River levels
    river_rows = tool_rows.get("get_river_levels", [])
    if river_rows:
        rising = [r for r in river_rows if r.get("trend") == "rising"]
        if rising:
            names = ", ".join(r.get("name", "?") for r in rising[:3])
            # Check SENAMHI threshold for top rising station
            top_r = rising[0]
            top_name_lower = (top_r.get("name") or "").lower()
            top_threshold_note = ""
            for key, threshold in _STATION_THRESHOLDS.items():
                if key in top_name_lower:
                    lv = top_r.get("level_m")
                    if lv is not None:
                        lv_f = float(lv)
                        if lv_f >= threshold:
                            top_threshold_note = f" ⚠ {top_r.get('name')}: {lv_f:.2f}m > umbral {threshold:.1f}m"
                        elif lv_f >= threshold * 0.9:
                            # Near-threshold (within 10%): flag as approaching
                            top_threshold_note = f" ⚠ {top_r.get('name')}: {lv_f:.2f}m acercándose al umbral {threshold:.1f}m"
                    break
            sections.append(f"**Ríos:** {len(rising)} estación(es) en ascenso — {names}{top_threshold_note}")
            if not action:
                action = f"Prioridad inmediata: monitorear evacuación preventiva en {names}."
        else:
            top = river_rows[0]
            _trend_es = {"rising": "↑ ascenso", "falling": "↓ descenso", "stable": "estable"}.get(top.get("trend", ""), "—")
            sections.append(f"**Ríos:** {top.get('name','?')} {top.get('level_m','—')} m — {_trend_es}")

    # 4. Flood polygons
    flood_rows = tool_rows.get("get_flood_polygons", [])
    if flood_rows:
        total_km2 = sum(r.get("area_km2") or 0 for r in flood_rows)
        # Show top district if available
        largest = max(flood_rows, key=lambda r: r.get("area_km2") or 0)
        dn = largest.get("district_name")
        district_note = f" · mayor en {dn}" if dn else ""
        sections.append(f"**Inundación SAR:** {len(flood_rows)} polígono{'s' if len(flood_rows) != 1 else ''} · {total_km2:.1f} km² activos{district_note}")

    # 5. Huayco risk (top quebrada)
    huayco_rows = tool_rows.get("get_huayco_risk", [])
    if huayco_rows:
        top_h = huayco_rows[0]
        top_name = top_h.get("name", "?")
        top_level = top_h.get("risk_level", "")
        top_prob = top_h.get("probability")
        top_trigger = top_h.get("trigger_rain_24h_mm")
        level_es = {"very_high": "MUY ALTO", "high": "ALTO", "medium": "MEDIO"}.get(top_level, "")
        prob_str = f" prob. {float(top_prob):.0%}" if top_prob is not None else ""
        trigger_str = f" · umbral {float(top_trigger):.0f}mm/24h" if top_trigger is not None else ""
        if level_es:
            # Show additional very_high quebradas if any
            very_high_rows = [r for r in huayco_rows if r.get("risk_level") == "very_high"]
            if len(very_high_rows) > 1:
                other_vh = [r.get("name", "?") for r in very_high_rows[1:3]]
                vh_note = f" · también: {', '.join(other_vh)}"
            else:
                vh_note = ""
            sections.append(f"**Huayco:** {top_name} — {level_es}{prob_str}{trigger_str}{vh_note}")
            if top_level == "very_high" and not action:
                action = f"Monitorear evacuación preventiva quebrada {top_name}."

    if not sections:
        return "No se encontraron datos en ninguna fuente. Sistema posiblemente sin datos recientes."

    body = "\n".join(f"• {s}" for s in sections)
    # Always end with an action — default to monitoring if no specific trigger
    if not action:
        action = "Mantener monitoreo activo. Verificar scrapers y revisar fuentes en panel Datos."
    return f"**SITREP — Lima Metropolitana**\n\n{body}\n\nAcción recomendada: {action}"
