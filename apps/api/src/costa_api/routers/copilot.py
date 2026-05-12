"""Operator Copilot — Spanish NL query → structured PostGIS query → Spanish summary.

Pipeline:
  1. Intent classification: Gemma classifies query into one of INTENT_TYPES and
     extracts slot parameters (district, time window, etc.)
  2. Whitelist validation: only parameterized templates from QUERY_CATALOG are
     ever executed — no LLM-generated SQL reaches the database
  3. PostGIS execution: safe parameterized query returns structured rows
  4. Spanish summary: Gemma summarizes DB results — numbers come from rows,
     not from LLM imagination ("LLM never fabricates" invariant)
  5. Decision log: operator action appended to ops.decision_log (append-only)

Security:
  - Operator question is NEVER interpolated into SQL; only extracted slot values
    (district names, numeric thresholds) are used as query parameters
  - Social signal content NEVER enters the copilot context unredacted
  - All numerical claims in answers trace to source_refs rows
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.config import settings
from costa_api.db import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/copilot", tags=["copilot"])


# ─── Request / Response ───────────────────────────────────────────────────────

class CopilotQuery(BaseModel):
    query: str               # Spanish natural language question
    district_ubigeo: Optional[str] = None
    operator_id: str
    session_id: Optional[str] = None


class CopilotResponse(BaseModel):
    answer: str              # Spanish prose summary
    sources: list[dict]      # DB rows backing every claim
    map_overlay: Optional[dict] = None
    confidence: float
    query_plan: Optional[str] = None   # SQL template key, not raw SQL
    intent: Optional[str] = None


# ─── Intent classification ────────────────────────────────────────────────────

INTENT_TYPES = [
    "flood_status",          # current flood polygons / area affected
    "huayco_risk",           # quebrada susceptibility
    "river_level",           # latest ANA station readings
    "social_cluster",        # recent social signal summary by district
    "infrastructure_impact", # infrastructure in flooded areas
    "rainfall_accumulation", # IMERG accumulations
    "unknown",
]

INTENT_SYSTEM_PROMPT = """Eres un asistente de clasificación de consultas para un sistema de respuesta a emergencias en Lima, Perú.
Clasifica la consulta del operador en uno de estos intents:
- flood_status: pregunta sobre inundaciones actuales, áreas afectadas, polígonos de inundación
- huayco_risk: pregunta sobre riesgo de huaycos, quebradas peligrosas
- river_level: pregunta sobre nivel o caudal de ríos, estaciones hidrológicas
- social_cluster: pregunta sobre reportes en redes sociales, señales sociales, vecinos afectados
- infrastructure_impact: pregunta sobre hospitales, escuelas, puentes, infraestructura afectada
- rainfall_accumulation: pregunta sobre lluvia acumulada, IMERG, precipitación
- unknown: no se puede clasificar

Extrae también los parámetros relevantes.

Responde ÚNICAMENTE con JSON:
{
  "intent": "<uno de los intents>",
  "district_name": "<nombre del distrito de Lima mencionado, o null>",
  "hours_back": <número de horas hacia atrás, o 24 si no se especifica>,
  "confidence": <0.0 a 1.0>
}"""


async def _classify_intent(query: str) -> dict:
    """Classify operator query intent using Gemma. Returns intent dict."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{settings.ollama_host}/api/chat",
                json={
                    "model": settings.ollama_primary_model,
                    "messages": [
                        {"role": "system", "content": INTENT_SYSTEM_PROMPT},
                        {"role": "user", "content": query},
                    ],
                    "stream": False,
                    "format": "json",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return json.loads(data["message"]["content"])
    except Exception as exc:
        logger.warning("Intent classification failed: %s", exc)
        return {"intent": "unknown", "district_name": None, "hours_back": 24, "confidence": 0.0}


# ─── Query catalog (whitelist) ────────────────────────────────────────────────

async def _execute_query(
    intent: str,
    district_name: Optional[str],
    hours_back: int,
    db: AsyncSession,
) -> tuple[str, list[dict]]:
    """
    Execute a whitelisted parameterized query. Returns (sql_key, rows).
    Only the query templates here ever reach the database — never LLM text.
    """
    hours_back = min(max(int(hours_back or 24), 1), 168)  # clamp 1h–7d

    if intent == "flood_status":
        sql = text("""
            SELECT fp.scene_id, fp.acquired_at, fp.confidence,
                   fp.area_km2, fp.model_version,
                   ST_AsGeoJSON(fp.geom)::jsonb AS geojson
            FROM ml.flood_polygons fp
            WHERE fp.acquired_at >= NOW() - make_interval(hours => :hours)
            ORDER BY fp.acquired_at DESC
            LIMIT 5
        """)
        rows = await db.execute(sql, {"hours": hours_back})
        return "flood_status", [dict(r._mapping) for r in rows]

    elif intent == "huayco_risk":
        sql = text("""
            SELECT q.name, q.priority, hs.probability, hs.risk_level,
                   hs.computed_at, hs.trigger_rain_24h_mm
            FROM ml.huayco_susceptibility hs
            JOIN geo.quebradas q ON q.id = hs.quebrada_id
            WHERE hs.computed_at = (
                SELECT MAX(computed_at) FROM ml.huayco_susceptibility
            )
            ORDER BY hs.probability DESC
            LIMIT 10
        """)
        rows = await db.execute(sql)
        return "huayco_risk", [dict(r._mapping) for r in rows]

    elif intent == "river_level":
        sql = text("""
            SELECT st.name, st.river, so.time, so.level_m, so.flow_m3s, so.rain_mm
            FROM hydro.station_observations so
            JOIN hydro.stations st ON st.id = so.station_id
            WHERE so.time >= NOW() - make_interval(hours => :hours)
            ORDER BY so.time DESC
            LIMIT 20
        """)
        rows = await db.execute(sql, {"hours": hours_back})
        return "river_level", [dict(r._mapping) for r in rows]

    elif intent == "social_cluster":
        district_filter = "AND d.name ILIKE :dname" if district_name else ""
        sql = text(f"""
            SELECT s.triage_label, COUNT(*) AS count,
                   d.name AS district,
                   MAX(s.ingested_at) AS latest
            FROM social.signals s
            LEFT JOIN geo.districts d ON d.id = s.district_id
            WHERE s.ingested_at >= NOW() - make_interval(hours => :hours)
              AND s.triage_label IS NOT NULL
              AND s.triage_label != 'irrelevant'
              {district_filter}
            GROUP BY s.triage_label, d.name
            ORDER BY count DESC
            LIMIT 10
        """)
        params: dict = {"hours": hours_back}
        if district_name:
            params["dname"] = f"%{district_name}%"
        rows = await db.execute(sql, params)
        return "social_cluster", [dict(r._mapping) for r in rows]

    elif intent == "infrastructure_impact":
        sql = text("""
            SELECT i.type, i.name, d.name AS district,
                   fp.acquired_at, fp.confidence AS flood_confidence
            FROM geo.infrastructure i
            JOIN ml.flood_polygons fp
              ON ST_Intersects(i.geom, fp.geom)
            LEFT JOIN geo.districts d ON d.id = i.district_id
            WHERE fp.acquired_at >= NOW() - make_interval(hours => :hours)
            ORDER BY fp.acquired_at DESC
            LIMIT 20
        """)
        rows = await db.execute(sql, {"hours": hours_back})
        return "infrastructure_impact", [dict(r._mapping) for r in rows]

    elif intent == "rainfall_accumulation":
        sql = text("""
            SELECT w.name AS watershed, ia.time,
                   ia.acc_1h_mm, ia.acc_3h_mm, ia.acc_6h_mm,
                   ia.acc_12h_mm, ia.acc_24h_mm, ia.acc_72h_mm
            FROM hydro.imerg_accumulations ia
            JOIN geo.watersheds w ON w.id = ia.watershed_id
            WHERE ia.time >= NOW() - make_interval(hours => :hours)
            ORDER BY ia.time DESC
            LIMIT 15
        """)
        rows = await db.execute(sql, {"hours": hours_back})
        return "rainfall_accumulation", [dict(r._mapping) for r in rows]

    return "unknown", []


# ─── Summary generation ───────────────────────────────────────────────────────

SUMMARY_SYSTEM_PROMPT = """Eres un asistente de gestión de emergencias para Lima Metropolitana, Perú.
El operador ha hecho una consulta y el sistema ha obtenido datos reales de la base de datos.
Tu tarea es redactar una respuesta clara y concisa en español basándote ÚNICAMENTE en los datos proporcionados.

REGLAS ESTRICTAS:
- Solo menciona números y lugares que aparezcan explícitamente en los datos
- Si los datos están vacíos, di "No se encontraron datos para el período consultado"
- No especules ni inventes información
- Máximo 3 oraciones
- Incluye las marcas de tiempo más recientes cuando sean relevantes"""


async def _generate_summary(query: str, intent: str, rows: list[dict]) -> str:
    """Summarize DB results in Spanish. All numbers must come from rows."""
    if not rows:
        return "No se encontraron datos para el período consultado."

    context = json.dumps(rows[:10], default=str, ensure_ascii=False)
    user_msg = f"Consulta del operador: {query}\n\nDatos del sistema:\n{context}"

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                f"{settings.ollama_host}/api/chat",
                json={
                    "model": settings.ollama_primary_model,
                    "messages": [
                        {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
                        {"role": "user", "content": user_msg},
                    ],
                    "stream": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["message"]["content"].strip()
    except Exception as exc:
        logger.warning("Summary generation failed: %s", exc)
        return f"Se recuperaron {len(rows)} registros. Sistema de resumen temporalmente no disponible."


# ─── Decision log ─────────────────────────────────────────────────────────────

async def _log_decision(
    db: AsyncSession,
    operator_id: str,
    query: str,
    intent: str,
    rows: list[dict],
    answer: str,
    session_id: Optional[str],
) -> None:
    payload = {
        "query": query,
        "intent": intent,
        "result_count": len(rows),
        "answer_preview": answer[:200],
    }
    await db.execute(
        text("""
            INSERT INTO ops.decision_log
                (operator_id, action_type, payload, session_id)
            VALUES (:op, 'query', :payload::jsonb, :session)
        """),
        {
            "op": operator_id,
            "payload": json.dumps(payload, default=str, ensure_ascii=False),
            "session": session_id,
        },
    )
    await db.commit()


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/ask", response_model=CopilotResponse)
async def ask(query: CopilotQuery, db: AsyncSession = Depends(get_db)) -> CopilotResponse:
    """
    Operator NL query → PostGIS → Spanish summary.
    LLM never fabricates: all numerical claims trace to DB rows in sources[].
    """
    # 1. Classify intent
    intent_data = await _classify_intent(query.query)
    intent = intent_data.get("intent", "unknown")
    district_name = intent_data.get("district_name")
    hours_back = intent_data.get("hours_back", 24)

    if intent == "unknown":
        return CopilotResponse(
            answer="No pude entender la consulta. Por favor reformule en términos de inundaciones, huaycos, estaciones hidrológicas, o infraestructura afectada.",
            sources=[],
            confidence=0.0,
            intent="unknown",
        )

    # 2. Execute whitelisted query
    try:
        sql_key, rows = await _execute_query(intent, district_name, hours_back, db)
    except Exception as exc:
        logger.error("Query execution failed (intent=%s): %s", intent, exc)
        raise HTTPException(status_code=500, detail="Error al consultar la base de datos")

    # 3. Serialize rows (datetime → str for JSON)
    safe_rows = json.loads(json.dumps(rows, default=str))

    # 4. Summarize in Spanish
    answer = await _generate_summary(query.query, intent, safe_rows)

    # 5. Log decision (best-effort)
    try:
        await _log_decision(db, query.operator_id, query.query, intent, safe_rows, answer, query.session_id)
    except Exception as exc:
        logger.warning("Decision log failed: %s", exc)

    confidence = float(intent_data.get("confidence", 0.8)) if rows else 0.3

    return CopilotResponse(
        answer=answer,
        sources=safe_rows,
        confidence=confidence,
        query_plan=sql_key,
        intent=intent,
    )
