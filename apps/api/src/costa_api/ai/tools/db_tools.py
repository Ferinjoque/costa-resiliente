"""DB query tools for the agentic copilot.

Every function here executes ONLY parameterised whitelisted queries via the
read-only AI engine.  The LLM never generates raw SQL — it only calls these
functions by name with extracted parameters.

Each tool is described in TOOL_SCHEMAS (OpenAI function-calling format), which
Ollama sends to the model so it can emit structured tool_call JSON.
"""

from __future__ import annotations

import inspect
import json
import logging
from typing import Any

from sqlalchemy import ARRAY, String, bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.ai.cache import get_cached, set_cached

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
                        "description": "Horas hacia atrás desde ahora. Mínimo 1, máximo 240.",
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
                "Obtiene lecturas recientes de estaciones hidrométricas ANA/SENAMHI (nivel, caudal, lluvia). "
                "Úsalo cuando pregunten sobre ríos, caudales, niveles de agua en estaciones, "
                "tendencia (subiendo/bajando), o si el río está en alerta. "
                "Respuesta incluye nivel en metros, caudal en m³/s, tendencia y comparación con umbrales SENAMHI."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "hours_back": {
                        "type": "integer",
                        "description": "Horas hacia atrás desde ahora. Mínimo 1, máximo 168.",
                        "default": 24,
                    },
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
                "Obtiene resumen de señales sociales (Bluesky, Reddit, Telegram) clasificadas por IA. "
                "Prioridad: needs_help (solicitudes ayuda) > huayco_observation > flood_observation > road_blocked. "
                "Retorna conteo por tipo de señal + top_district (distrito con más señales urgentes por categoría). "
                "Úsalo cuando pregunten sobre reportes ciudadanos, víctimas, vías bloqueadas, "
                "avistamientos de huayco o inundación, señales de campo, o qué distritos reportan más urgencias."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "hours_back": {
                        "type": "integer",
                        "description": "Horas hacia atrás desde ahora. Mínimo 1, máximo 168.",
                        "default": 24,
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
            "name": "get_infrastructure_impact",
            "description": (
                "Obtiene infraestructura crítica (hospitales, escuelas, puentes) "
                "DENTRO de zonas inundadas activas (SAR Sentinel-1). "
                "Úsalo cuando pregunten qué infraestructura está afectada o comprometida por inundaciones. "
                "Para albergues DISPONIBLES para evacuación, usa search_protocols."
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
    {
        "type": "function",
        "function": {
            "name": "get_population_at_risk",
            "description": (
                "Calcula la población en riesgo cruzando polígonos de inundación SAR con el censo INEI 2017. "
                "Úsalo cuando pregunten cuántas personas están afectadas, en riesgo, o en zonas inundadas."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "hours_back": {
                        "type": "integer",
                        "description": "Horas hacia atrás para polígonos de inundación. Máximo 240.",
                        "default": 240,
                    },
                },
                "required": [],
            },
        },
    },
]


# ─── Tool implementations ─────────────────────────────────────────────────────

async def get_flood_polygons(db: AsyncSession, hours_back: int = 168, district_name: str | None = None) -> list[dict]:
    hours_back = min(max(int(hours_back), 1), 240)
    # Count total before LIMIT so _build_answer can warn about truncation
    count_sql = text("""
        SELECT COUNT(*) FROM ml.flood_polygons
        WHERE acquired_at >= NOW() - make_interval(hours => :hours)
          AND NOT ST_IsEmpty(geom)
    """)
    total = (await db.execute(count_sql, {"hours": hours_back})).scalar() or 0
    sql = text("""
        SELECT fp.scene_id, fp.acquired_at, fp.confidence,
               fp.area_km2, fp.model_version,
               d.name AS district_name
        FROM ml.flood_polygons fp
        LEFT JOIN LATERAL (
            SELECT d2.name
            FROM geo.districts d2
            WHERE ST_Intersects(ST_MakeValid(d2.geom), ST_MakeValid(fp.geom))
            ORDER BY ST_Area(ST_Intersection(ST_MakeValid(d2.geom), ST_MakeValid(fp.geom))) DESC
            LIMIT 1
        ) d ON TRUE
        WHERE fp.acquired_at >= NOW() - make_interval(hours => :hours)
          AND NOT ST_IsEmpty(fp.geom)
        ORDER BY fp.area_km2 DESC NULLS LAST
        LIMIT 10
    """)
    result = await db.execute(sql, {"hours": hours_back})
    rows = [dict(r._mapping) for r in result]
    if rows and total > len(rows):
        # Inject total count in first row so _build_answer can warn about truncation
        rows[0]["_total_flood_count"] = total
    return rows


async def get_huayco_risk(db: AsyncSession, min_risk: str = "high") -> list[dict]:
    _RISK_ORDER = {"low": 0, "medium": 1, "high": 2, "very_high": 3}
    min_val = _RISK_ORDER.get(min_risk, 2)
    valid = [k for k, v in _RISK_ORDER.items() if v >= min_val]
    # bindparam with ARRAY(String) tells SQLAlchemy+asyncpg the exact PG type so
    # ANY(:levels) resolves correctly without relying on driver-side type inference.
    sql = text("""
        SELECT q.name, q.priority, hs.probability, hs.risk_level,
               hs.computed_at, hs.trigger_rain_24h_mm
        FROM (
            SELECT DISTINCT ON (quebrada_id)
                   quebrada_id, probability, risk_level, computed_at, trigger_rain_24h_mm
            FROM ml.huayco_susceptibility
            ORDER BY quebrada_id, computed_at DESC
        ) hs
        JOIN geo.quebradas q ON q.id = hs.quebrada_id
        WHERE hs.risk_level = ANY(:levels)
        ORDER BY hs.probability DESC
        LIMIT 10
    """).bindparams(bindparam("levels", type_=ARRAY(String)))
    result = await db.execute(sql, {"levels": valid})
    return [dict(r._mapping) for r in result]


async def get_river_levels(db: AsyncSession, hours_back: int = 24, river: str | None = None) -> list[dict]:
    """Latest reading per station + 1h trend (rising/falling/stable/unknown)."""
    hours_back = min(max(int(hours_back), 1), 168)
    river_clause = "AND st.river ILIKE :river" if river else ""
    sql = text(
        """
        WITH latest AS (
            SELECT DISTINCT ON (so.station_id)
                   so.station_id, so.time, so.level_m, so.flow_m3s, so.rain_mm
            FROM hydro.station_observations so
            WHERE so.time >= NOW() - make_interval(hours => :hours)
            ORDER BY so.station_id, so.time DESC
        ),
        prev_1h AS (
            -- Find the observation closest to 1h before each station's latest reading.
            -- Anchoring to latest.time avoids "wrong row" when cadence is irregular.
            SELECT DISTINCT ON (so.station_id)
                   so.station_id, so.level_m AS level_m_1h_ago
            FROM hydro.station_observations so
            JOIN latest l ON l.station_id = so.station_id
            WHERE so.time BETWEEN l.time - INTERVAL '90 min'
                              AND l.time - INTERVAL '30 min'
            ORDER BY so.station_id, ABS(EXTRACT(EPOCH FROM (so.time - (l.time - INTERVAL '1 hour'))))
        )
        SELECT st.name, st.river, l.time,
               l.level_m, l.flow_m3s, l.rain_mm,
               p.level_m_1h_ago,
               CASE
                   WHEN p.level_m_1h_ago IS NULL OR l.level_m IS NULL THEN 'unknown'
                   WHEN l.level_m - p.level_m_1h_ago >  0.05 THEN 'rising'
                   WHEN l.level_m - p.level_m_1h_ago < -0.05 THEN 'falling'
                   ELSE 'stable'
               END AS trend,
               ROUND((l.level_m - COALESCE(p.level_m_1h_ago, l.level_m))::numeric, 3)
                   AS level_change_1h_m
        FROM latest l
        JOIN hydro.stations st ON st.id = l.station_id
        LEFT JOIN prev_1h p ON p.station_id = l.station_id
        WHERE TRUE """
        + river_clause
        + """
        ORDER BY l.time DESC
        LIMIT 20
        """
    )
    params: dict = {"hours": hours_back}
    if river:
        params["river"] = f"%{river}%"
    result = await db.execute(sql, params)
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
        # Include top district name per label to help operators see WHERE signals are clustering.
        # A CTE ranks districts by signal count per label and picks the top one.
        sql = text("""
            SELECT s.triage_label, COUNT(*) AS count, MAX(s.ingested_at) AS latest,
                   (
                     SELECT d2.name
                     FROM social.signals s2
                     LEFT JOIN geo.districts d2 ON d2.id = s2.district_id
                     WHERE s2.triage_label = s.triage_label
                       AND s2.ingested_at >= NOW() - make_interval(hours => :hours)
                       AND d2.name IS NOT NULL
                     GROUP BY d2.name
                     ORDER BY COUNT(*) DESC
                     LIMIT 1
                   ) AS top_district
            FROM social.signals s
            WHERE s.ingested_at >= NOW() - make_interval(hours => :hours)
              AND s.triage_label IS NOT NULL
              AND s.triage_label != 'irrelevant'
            GROUP BY s.triage_label
            ORDER BY count DESC LIMIT 10
        """)
        result = await db.execute(sql, {"hours": hours_back})
    return [dict(r._mapping) for r in result]


async def get_infrastructure_impact(db: AsyncSession, hours_back: int = 240) -> list[dict]:
    hours_back = min(max(int(hours_back), 1), 240)
    # Sort by criticality: hospitals first (life safety), then other critical infra.
    # Previously ordered by acquired_at DESC — a minor bridge appeared before hospitals.
    sql = text("""
        SELECT i.type, i.name, d.name AS district,
               fp.acquired_at, fp.confidence AS flood_confidence
        FROM geo.infrastructure i
        JOIN ml.flood_polygons fp ON ST_Intersects(ST_MakeValid(i.geom), ST_MakeValid(fp.geom))
        LEFT JOIN geo.districts d ON d.id = i.district_id
        WHERE fp.acquired_at >= NOW() - make_interval(hours => :hours)
          AND NOT ST_IsEmpty(fp.geom)
        ORDER BY
            CASE i.type
                WHEN 'hospital'      THEN 0
                WHEN 'fire_station'  THEN 1
                WHEN 'shelter'       THEN 2
                WHEN 'substation'    THEN 3
                WHEN 'school'        THEN 4
                WHEN 'bridge'        THEN 5
                ELSE 6
            END,
            fp.acquired_at DESC
        LIMIT 50
    """)
    result = await db.execute(sql, {"hours": hours_back})
    return [dict(r._mapping) for r in result]


async def get_rainfall_accumulation(db: AsyncSession, hours_back: int = 72) -> list[dict]:
    hours_back = min(max(int(hours_back), 1), 168)
    sql = text("""
        SELECT w.name AS watershed, ia.time,
               ia.acc_1h_mm, ia.acc_3h_mm, ia.acc_6h_mm,
               ia.acc_12h_mm, ia.acc_24h_mm, ia.acc_72h_mm, ia.acc_168h_mm
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
    _SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    if severity:
        # Minimum-severity filter: include all alerts at or above the given level
        # e.g. severity="high" returns both "critical" and "high" alerts
        min_rank = _SEVERITY_RANK.get(severity, 3)
        allowed = [s for s, r in _SEVERITY_RANK.items() if r <= min_rank]
        count_sql = text(
            "SELECT COUNT(*) FROM ops.alerts WHERE status = 'active' AND severity = ANY(:sev)"
        )
        total = (await db.execute(count_sql, {"sev": allowed})).scalar() or 0
        sql = text("""
            SELECT a.id, a.type AS alert_type, a.severity, a.status,
                   a.title, a.description AS summary,
                   d.ubigeo AS district_ubigeo, d.name AS district_name,
                   a.created_at, a.source_refs,
                   EXTRACT(EPOCH FROM (NOW() - a.created_at))::int AS age_seconds
            FROM ops.alerts a
            LEFT JOIN geo.districts d ON d.id = a.district_id
            WHERE a.status = 'active'
              AND a.severity = ANY(:sev)
            ORDER BY
                CASE a.severity
                    WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                    WHEN 'medium' THEN 2 ELSE 3
                END,
                a.created_at DESC LIMIT 20
        """)
        result = await db.execute(sql, {"sev": allowed})
    else:
        count_sql = text("SELECT COUNT(*) FROM ops.alerts WHERE status = 'active'")
        total = (await db.execute(count_sql)).scalar() or 0
        sql = text("""
            SELECT a.id, a.type AS alert_type, a.severity, a.status,
                   a.title, a.description AS summary,
                   d.ubigeo AS district_ubigeo, d.name AS district_name,
                   a.created_at, a.source_refs,
                   EXTRACT(EPOCH FROM (NOW() - a.created_at))::int AS age_seconds
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


async def get_population_at_risk(db: AsyncSession, hours_back: int = 240) -> list[dict]:
    """Intersect flood polygons with district census to estimate population at risk."""
    hours_back = min(max(int(hours_back), 1), 240)
    sql = text("""
        SELECT d.ubigeo, d.name AS district,
               d.population AS district_population,
               COUNT(DISTINCT fp.scene_id) AS flood_scenes,
               MAX(fp.confidence) AS max_confidence,
               ROUND(
                   (d.population *
                    LEAST(
                        ST_Area(ST_Intersection(ST_Union(ST_MakeValid(fp.geom)), ST_MakeValid(d.geom))::geography) /
                        NULLIF(ST_Area(ST_MakeValid(d.geom)::geography), 0),
                        1.0
                    )
                   )::numeric, 0
               ) AS estimated_population_at_risk
        FROM geo.districts d
        JOIN ml.flood_polygons fp
          ON ST_Intersects(ST_MakeValid(d.geom), ST_MakeValid(fp.geom))
        WHERE fp.acquired_at >= NOW() - make_interval(hours => :hours)
          AND NOT ST_IsEmpty(fp.geom)
          AND d.population IS NOT NULL
        GROUP BY d.ubigeo, d.name, d.population, d.geom
        ORDER BY estimated_population_at_risk DESC NULLS LAST
        LIMIT 15
    """)
    result = await db.execute(sql, {"hours": hours_back})
    return [dict(r._mapping) for r in result]


# ─── Dispatcher ───────────────────────────────────────────────────────────────

_TOOL_MAP = {
    "get_flood_polygons": get_flood_polygons,
    "get_huayco_risk": get_huayco_risk,
    "get_river_levels": get_river_levels,
    "get_social_clusters": get_social_clusters,
    "get_infrastructure_impact": get_infrastructure_impact,
    "get_rainfall_accumulation": get_rainfall_accumulation,
    "get_active_alerts": get_active_alerts,
    "get_population_at_risk": get_population_at_risk,
}


async def dispatch(tool_name: str, args: dict, db: AsyncSession, rag_fn=None) -> dict:
    """
    Execute a named tool with Redis caching.
    Returns {"tool": name, "rows": [...], "count": n}.
    `rag_fn` is injected for the search_protocols tool to avoid circular import.
    """
    if tool_name == "search_protocols":
        # RAG results are cacheable too
        cached = await get_cached(tool_name, args)
        if cached is not None:
            return cached
        if rag_fn is None:
            return {"tool": tool_name, "rows": [], "count": 0, "error": "RAG not available"}
        rows = await rag_fn(args.get("query", ""), top_k=args.get("top_k", 3))
        result = {"tool": tool_name, "rows": rows, "count": len(rows)}
        await set_cached(tool_name, args, result)
        return result

    fn = _TOOL_MAP.get(tool_name)
    if fn is None:
        logger.warning("Unknown tool requested: %s", tool_name)
        return {"tool": tool_name, "rows": [], "count": 0, "error": "tool_not_found"}

    # Check cache before hitting DB
    cached = await get_cached(tool_name, args)
    if cached is not None:
        logger.debug("Cache HIT for %s", tool_name)
        return cached

    try:
        # Note: SET LOCAL statement_timeout is intentionally omitted here because
        # parallel tool dispatch via asyncio.gather shares the same AsyncSession.
        # Concurrent SET LOCAL calls race on the same connection and can corrupt
        # each other's timeout settings or return wrong results. The outer
        # asyncio.wait_for(run(...), timeout=agent_timeout) caps overall duration.
        valid_params = set(inspect.signature(fn).parameters) - {"db"}
        filtered = {k: v for k, v in args.items() if k in valid_params}
        rows = await fn(db, **filtered)
        result = {"tool": tool_name, "rows": rows, "count": len(rows)}
        await set_cached(tool_name, args, result)
        return result
    except Exception as exc:
        logger.error("Tool %s failed: %s", tool_name, exc)
        return {"tool": tool_name, "rows": [], "count": 0, "error": str(exc)}
