"""DB query tools for the agentic copilot.

Every function here executes ONLY parameterised whitelisted queries via the
read-only AI engine.  The LLM never generates raw SQL — it only calls these
functions by name with extracted parameters.

Each tool is described in TOOL_SCHEMAS (OpenAI function-calling format), which
Ollama sends to the model so it can emit structured tool_call JSON.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ─── Tool schemas (Ollama/OpenAI function-calling format) ─────────────────────

TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "get_flood_polygons",
            "description": (
                "Obtiene polígonos de inundación activos detectados por imágenes SAR Sentinel-1. "
                "Úsalo cuando pregunten sobre zonas inundadas, áreas afectadas por agua o inundaciones."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "hours_back": {
                        "type": "integer",
                        "description": "Horas hacia atrás desde ahora. Mínimo 1, máximo 168.",
                        "default": 168,
                    },
                    "district_name": {
                        "type": "string",
                        "description": "Nombre del distrito de Lima, opcional.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_huayco_risk",
            "description": (
                "Obtiene las quebradas con mayor riesgo de huayco según el modelo ML. "
                "Úsalo cuando pregunten sobre deslizamientos, flujos de lodo, quebradas peligrosas."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "min_risk": {
                        "type": "string",
                        "enum": ["low", "medium", "high", "very_high"],
                        "description": "Nivel de riesgo mínimo a retornar.",
                        "default": "high",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_river_levels",
            "description": (
                "Obtiene lecturas recientes de estaciones hidrométricas (nivel, caudal, lluvia). "
                "Úsalo cuando pregunten sobre ríos, caudales, niveles de agua en estaciones."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "hours_back": {"type": "integer", "default": 24},
                    "river": {
                        "type": "string",
                        "description": "Nombre del río (Rímac, Chillón, Lurín), opcional.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_social_clusters",
            "description": (
                "Obtiene resumen de señales sociales (Bluesky, Reddit, RSS) clasificadas por triage. "
                "Úsalo cuando pregunten sobre reportes ciudadanos, redes sociales, vecinos afectados."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "hours_back": {"type": "integer", "default": 24},
                    "district_name": {"type": "string"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_infrastructure_impact",
            "description": (
                "Obtiene infraestructura crítica (hospitales, escuelas, puentes) en zonas inundadas. "
                "Úsalo cuando pregunten qué infraestructura está afectada o en riesgo."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "hours_back": {"type": "integer", "default": 24},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_rainfall_accumulation",
            "description": (
                "Obtiene acumulaciones de lluvia IMERG por cuenca hidrográfica. "
                "Úsalo cuando pregunten sobre precipitaciones, lluvia acumulada, umbrales de alerta."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "hours_back": {"type": "integer", "default": 72},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_active_alerts",
            "description": (
                "Obtiene alertas operativas activas del sistema (inundación, huayco, social). "
                "Úsalo cuando pregunten por alertas vigentes, situación actual de emergencias."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "severity": {
                        "type": "string",
                        "enum": ["critical", "high", "medium", "low"],
                        "description": "Nivel de severidad mínimo, opcional.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_protocols",
            "description": (
                "Busca en los protocolos y manuales oficiales (INDECI, MINSA, CENEPRED) "
                "para responder preguntas sobre procedimientos de emergencia, evacuación, SOPs."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Término de búsqueda en español.",
                    },
                    "top_k": {"type": "integer", "default": 3},
                },
                "required": ["query"],
            },
        },
    },
]


# ─── Tool implementations ─────────────────────────────────────────────────────

async def get_flood_polygons(db: AsyncSession, hours_back: int = 168, district_name: str | None = None) -> list[dict]:
    hours_back = min(max(int(hours_back), 1), 168)
    sql = text("""
        SELECT fp.scene_id, fp.acquired_at, fp.confidence,
               fp.area_km2, fp.model_version,
               ST_AsGeoJSON(fp.geom)::jsonb AS geojson
        FROM ml.flood_polygons fp
        WHERE fp.acquired_at >= NOW() - make_interval(hours => :hours)
        ORDER BY fp.acquired_at DESC
        LIMIT 10
    """)
    result = await db.execute(sql, {"hours": hours_back})
    return [dict(r._mapping) for r in result]


async def get_huayco_risk(db: AsyncSession, min_risk: str = "high") -> list[dict]:
    _RISK_ORDER = {"low": 0, "medium": 1, "high": 2, "very_high": 3}
    min_val = _RISK_ORDER.get(min_risk, 2)
    valid = [k for k, v in _RISK_ORDER.items() if v >= min_val]
    placeholders = ", ".join(f"'{r}'" for r in valid)
    sql = text(f"""
        SELECT q.name, q.priority, hs.probability, hs.risk_level,
               hs.computed_at, hs.trigger_rain_24h_mm
        FROM ml.huayco_susceptibility hs
        JOIN geo.quebradas q ON q.id = hs.quebrada_id
        WHERE hs.computed_at = (SELECT MAX(computed_at) FROM ml.huayco_susceptibility)
          AND hs.risk_level IN ({placeholders})
        ORDER BY hs.probability DESC
        LIMIT 10
    """)
    result = await db.execute(sql)
    return [dict(r._mapping) for r in result]


async def get_river_levels(db: AsyncSession, hours_back: int = 24, river: str | None = None) -> list[dict]:
    hours_back = min(max(int(hours_back), 1), 168)
    if river:
        sql = text("""
            SELECT st.name, st.river, so.time, so.level_m, so.flow_m3s, so.rain_mm
            FROM hydro.station_observations so
            JOIN hydro.stations st ON st.id = so.station_id
            WHERE so.time >= NOW() - make_interval(hours => :hours)
              AND st.river ILIKE :river
            ORDER BY so.time DESC
            LIMIT 20
        """)
        result = await db.execute(sql, {"hours": hours_back, "river": f"%{river}%"})
    else:
        sql = text("""
            SELECT st.name, st.river, so.time, so.level_m, so.flow_m3s, so.rain_mm
            FROM hydro.station_observations so
            JOIN hydro.stations st ON st.id = so.station_id
            WHERE so.time >= NOW() - make_interval(hours => :hours)
            ORDER BY so.time DESC
            LIMIT 20
        """)
        result = await db.execute(sql, {"hours": hours_back})
    return [dict(r._mapping) for r in result]


async def get_social_clusters(db: AsyncSession, hours_back: int = 24, district_name: str | None = None) -> list[dict]:
    hours_back = min(max(int(hours_back), 1), 168)
    if district_name:
        sql = text("""
            SELECT s.triage_label, COUNT(*) AS count,
                   d.name AS district, MAX(s.ingested_at) AS latest
            FROM social.signals s
            LEFT JOIN geo.districts d ON d.id = s.district_id
            WHERE s.ingested_at >= NOW() - make_interval(hours => :hours)
              AND s.triage_label IS NOT NULL
              AND s.triage_label != 'irrelevant'
              AND d.name ILIKE :dname
            GROUP BY s.triage_label, d.name
            ORDER BY count DESC LIMIT 10
        """)
        result = await db.execute(sql, {"hours": hours_back, "dname": f"%{district_name}%"})
    else:
        sql = text("""
            SELECT s.triage_label, COUNT(*) AS count, MAX(s.ingested_at) AS latest
            FROM social.signals s
            WHERE s.ingested_at >= NOW() - make_interval(hours => :hours)
              AND s.triage_label IS NOT NULL
              AND s.triage_label != 'irrelevant'
            GROUP BY s.triage_label
            ORDER BY count DESC LIMIT 10
        """)
        result = await db.execute(sql, {"hours": hours_back})
    return [dict(r._mapping) for r in result]


async def get_infrastructure_impact(db: AsyncSession, hours_back: int = 24) -> list[dict]:
    hours_back = min(max(int(hours_back), 1), 168)
    sql = text("""
        SELECT i.type, i.name, d.name AS district,
               fp.acquired_at, fp.confidence AS flood_confidence
        FROM geo.infrastructure i
        JOIN ml.flood_polygons fp ON ST_Intersects(i.geom, fp.geom)
        LEFT JOIN geo.districts d ON d.id = i.district_id
        WHERE fp.acquired_at >= NOW() - make_interval(hours => :hours)
        ORDER BY fp.acquired_at DESC LIMIT 20
    """)
    result = await db.execute(sql, {"hours": hours_back})
    return [dict(r._mapping) for r in result]


async def get_rainfall_accumulation(db: AsyncSession, hours_back: int = 72) -> list[dict]:
    hours_back = min(max(int(hours_back), 1), 168)
    sql = text("""
        SELECT w.name AS watershed, ia.time,
               ia.acc_1h_mm, ia.acc_3h_mm, ia.acc_6h_mm,
               ia.acc_12h_mm, ia.acc_24h_mm, ia.acc_72h_mm
        FROM hydro.imerg_accumulations ia
        JOIN geo.watersheds w ON w.id = ia.watershed_id
        WHERE ia.time >= NOW() - make_interval(hours => :hours)
        ORDER BY ia.time DESC LIMIT 15
    """)
    result = await db.execute(sql, {"hours": hours_back})
    return [dict(r._mapping) for r in result]


async def get_active_alerts(db: AsyncSession, severity: str | None = None) -> list[dict]:
    """Active alerts ordered by severity. Caller-aware: every returned row
    carries `_total` = full unconstrained count so the answer layer can say
    'X activas' (truth) instead of 'len(rows)' (capped at 20)."""
    if severity:
        count_sql = text(
            "SELECT COUNT(*) FROM ops.alerts WHERE status = 'active' AND severity = :sev"
        )
        total = (await db.execute(count_sql, {"sev": severity})).scalar() or 0
        sql = text("""
            SELECT a.id, a.type AS alert_type, a.severity, a.status,
                   a.title, a.description AS summary,
                   d.ubigeo AS district_ubigeo, d.name AS district_name,
                   a.created_at
            FROM ops.alerts a
            LEFT JOIN geo.districts d ON d.id = a.district_id
            WHERE a.status = 'active'
              AND a.severity = :sev
            ORDER BY a.created_at DESC LIMIT 20
        """)
        result = await db.execute(sql, {"sev": severity})
    else:
        count_sql = text("SELECT COUNT(*) FROM ops.alerts WHERE status = 'active'")
        total = (await db.execute(count_sql)).scalar() or 0
        sql = text("""
            SELECT a.id, a.type AS alert_type, a.severity, a.status,
                   a.title, a.description AS summary,
                   d.ubigeo AS district_ubigeo, d.name AS district_name,
                   a.created_at
            FROM ops.alerts a
            LEFT JOIN geo.districts d ON d.id = a.district_id
            WHERE a.status = 'active'
            ORDER BY
                CASE a.severity
                    WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                    WHEN 'medium' THEN 2 ELSE 3
                END,
                a.created_at DESC
            LIMIT 20
        """)
        result = await db.execute(sql)
    rows = [dict(r._mapping) for r in result]
    for r in rows:
        r["_total_active"] = int(total)
    return rows


# ─── Dispatcher ───────────────────────────────────────────────────────────────

_TOOL_MAP = {
    "get_flood_polygons": get_flood_polygons,
    "get_huayco_risk": get_huayco_risk,
    "get_river_levels": get_river_levels,
    "get_social_clusters": get_social_clusters,
    "get_infrastructure_impact": get_infrastructure_impact,
    "get_rainfall_accumulation": get_rainfall_accumulation,
    "get_active_alerts": get_active_alerts,
}


async def dispatch(tool_name: str, args: dict, db: AsyncSession, rag_fn=None) -> dict:
    """
    Execute a named tool. Returns {"tool": name, "rows": [...], "count": n}.
    `rag_fn` is injected for the search_protocols tool to avoid circular import.
    """
    if tool_name == "search_protocols":
        if rag_fn is None:
            return {"tool": tool_name, "rows": [], "count": 0, "error": "RAG not available"}
        rows = await rag_fn(args.get("query", ""), top_k=args.get("top_k", 3))
        return {"tool": tool_name, "rows": rows, "count": len(rows)}

    fn = _TOOL_MAP.get(tool_name)
    if fn is None:
        logger.warning("Unknown tool requested: %s", tool_name)
        return {"tool": tool_name, "rows": [], "count": 0, "error": "tool_not_found"}

    try:
        rows = await fn(db, **{k: v for k, v in args.items() if k in fn.__code__.co_varnames})
        return {"tool": tool_name, "rows": rows, "count": len(rows)}
    except Exception as exc:
        logger.error("Tool %s failed: %s", tool_name, exc)
        return {"tool": tool_name, "rows": [], "count": 0, "error": str(exc)}
