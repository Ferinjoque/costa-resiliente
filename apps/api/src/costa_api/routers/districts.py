"""District and geographic reference endpoints."""
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/districts", tags=["geo"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _iso(dt: Any) -> str | None:
    if dt is None:
        return None
    return dt.isoformat() if hasattr(dt, "isoformat") else str(dt)


@router.get("/provinces")
async def list_provinces(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Return unique provinces with district counts. Default scope is Lima Metropolitana."""
    result = await db.execute(
        text("""
            SELECT province, region, COUNT(*) AS district_count
            FROM geo.districts
            GROUP BY province, region
            ORDER BY district_count DESC
        """)
    )
    rows = result.mappings().all()
    return {
        "provinces": [
            {"province": r["province"], "region": r["region"], "district_count": int(r["district_count"])}
            for r in rows
        ],
        "default_province": "Lima",
    }


@router.get("")
async def list_districts(
    province: Optional[str] = Query(None, description="Filter by province name. 'Lima' = Lima Metropolitana (43 distritos). Omit for all 159."),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Return Lima districts as GeoJSON FeatureCollection.
    Default (no param): all 159. province=Lima → 43 Lima Metropolitana only.
    Properties: ubigeo, name, province, region, area_km2, population.
    """
    where_clause = "WHERE province = :province" if province else ""
    params = {"province": province} if province else {}
    result = await db.execute(
        text(f"""
            SELECT
                ubigeo,
                name,
                province,
                region,
                area_km2,
                population,
                ST_AsGeoJSON(geom)::json AS geometry
            FROM geo.districts
            {where_clause}
            ORDER BY name
        """),
        params,
    )
    rows = result.mappings().all()

    features = [
        {
            "type": "Feature",
            "properties": {
                "ubigeo":     row["ubigeo"],
                "name":       row["name"],
                "province":   row["province"],
                "region":     row["region"],
                "area_km2":   row["area_km2"],
                "population": row["population"],
            },
            "geometry": row["geometry"],
        }
        for row in rows
    ]
    now = _now_iso()
    return {
        "type": "FeatureCollection",
        "count": len(features),
        "retrieved_at": now,
        "data_updated_at": now,
        "features": features,
    }


@router.get("/risk-summary")
async def district_risk_summary(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """
    Lightweight risk summary for all districts — used to color-fill the map.
    Returns GeoJSON FeatureCollection with risk_level + key metrics per district.
    Fast path: uses FK-indexed tables only (no heavy spatial joins).
    """
    result = await db.execute(
        text("""
            SELECT
                d.ubigeo,
                d.name,
                d.population,
                ST_AsGeoJSON(d.geom)::json AS geometry,
                -- Active alerts: severity-weighted
                COALESCE((
                    SELECT COUNT(*) FROM ops.alerts a
                    WHERE a.district_id = d.id AND a.status = 'active'
                ), 0) AS active_alerts,
                COALESCE((
                    SELECT MAX(CASE a.severity
                        WHEN 'critical' THEN 4 WHEN 'high' THEN 3
                        WHEN 'medium' THEN 2 ELSE 1 END)
                    FROM ops.alerts a
                    WHERE a.district_id = d.id AND a.status = 'active'
                ), 0) AS max_severity_score,
                -- Social signals last 3h
                COALESCE((
                    SELECT COUNT(*) FROM social.signals s
                    WHERE s.district_id = d.id
                      AND s.ingested_at >= NOW() - INTERVAL '3 hours'
                      AND s.triage_label NOT IN ('irrelevant','false_alarm')
                ), 0) AS social_3h,
                -- Urgent social last 3h
                COALESCE((
                    SELECT COUNT(*) FROM social.signals s
                    WHERE s.district_id = d.id
                      AND s.ingested_at >= NOW() - INTERVAL '3 hours'
                      AND s.triage_label IN ('needs_help','infrastructure_damage','road_blocked')
                ), 0) AS urgent_social_3h
            FROM geo.districts d
            ORDER BY d.name
        """)
    )
    rows = result.mappings().all()

    def risk_level(row: Any) -> str:
        sev = int(row["max_severity_score"])
        alerts = int(row["active_alerts"])
        urgent = int(row["urgent_social_3h"])
        if sev >= 4 or (sev >= 3 and alerts >= 2) or urgent >= 3:
            return "alto"
        if sev >= 2 or alerts >= 1 or urgent >= 1:
            return "moderado"
        return "bajo"

    features = []
    for row in rows:
        rl = risk_level(row)
        features.append({
            "type": "Feature",
            "properties": {
                "ubigeo": row["ubigeo"],
                "name": row["name"],
                "population": row["population"],
                "risk_level": rl,
                "active_alerts": int(row["active_alerts"]),
                "social_3h": int(row["social_3h"]),
                "urgent_social_3h": int(row["urgent_social_3h"]),
            },
            "geometry": row["geometry"],
        })

    return {
        "type": "FeatureCollection",
        "retrieved_at": _now_iso(),
        "features": features,
    }


@router.get("/{ubigeo}")
async def get_district(ubigeo: str, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Return a single district by INEI UBIGEO code."""
    result = await db.execute(
        text("""
            SELECT
                ubigeo, name, province, region, area_km2, population,
                ST_AsGeoJSON(geom)::json AS geometry
            FROM geo.districts
            WHERE ubigeo = :ubigeo
        """),
        {"ubigeo": ubigeo},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail=f"District {ubigeo} not found")

    return {
        "type": "Feature",
        "properties": {
            "ubigeo":     row["ubigeo"],
            "name":       row["name"],
            "province":   row["province"],
            "region":     row["region"],
            "area_km2":   row["area_km2"],
            "population": row["population"],
        },
        "geometry": row["geometry"],
    }


@router.get("/{ubigeo}/dashboard")
async def district_dashboard(ubigeo: str, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """
    Rich dashboard data for a single district: alerts trend, IMERG 30d, social breakdown.
    """
    district_row = await db.execute(
        text("SELECT id, name, population, area_km2 FROM geo.districts WHERE ubigeo = :u"),
        {"u": ubigeo},
    )
    district = district_row.mappings().first()
    if not district:
        raise HTTPException(status_code=404, detail=f"District {ubigeo} not found")

    district_id = district["id"]

    # Active alerts
    alerts_result = await db.execute(
        text("""
            SELECT id, type, severity, status, title, created_at
            FROM ops.alerts
            WHERE district_id = :did AND status IN ('active','acknowledged','escalated')
            ORDER BY created_at DESC LIMIT 10
        """),
        {"did": district_id},
    )
    alerts = [dict(r._mapping) for r in alerts_result]
    for a in alerts:
        a["created_at"] = _iso(a["created_at"])

    # Alerts 7-day trend (count per day by severity)
    trend_result = await db.execute(
        text("""
            SELECT
                DATE_TRUNC('day', created_at)::date AS day,
                severity,
                COUNT(*) AS cnt
            FROM ops.alerts
            WHERE district_id = :did
              AND created_at >= NOW() - INTERVAL '7 days'
            GROUP BY 1, 2
            ORDER BY 1
        """),
        {"did": district_id},
    )
    alerts_trend = [
        {"day": str(r["day"]), "severity": r["severity"], "count": int(r["cnt"])}
        for r in trend_result.mappings()
    ]

    # Social breakdown last 24h
    social_result = await db.execute(
        text("""
            SELECT triage_label, COUNT(*) AS cnt
            FROM social.signals
            WHERE district_id = :did
              AND ingested_at >= NOW() - INTERVAL '24 hours'
              AND triage_label NOT IN ('irrelevant','false_alarm')
            GROUP BY triage_label
            ORDER BY cnt DESC
        """),
        {"did": district_id},
    )
    social_breakdown = [
        {"label": r["triage_label"], "count": int(r["cnt"])}
        for r in social_result.mappings()
    ]

    # IMERG 30-day daily max acc_24h via watersheds intersecting district
    imerg_result = await db.execute(
        text("""
            SELECT
                DATE_TRUNC('day', ia.time)::date AS day,
                MAX(ia.acc_24h_mm) AS max_24h_mm,
                MAX(ia.acc_72h_mm) AS max_72h_mm
            FROM hydro.imerg_accumulations ia
            JOIN geo.watersheds w ON w.id = ia.watershed_id
            JOIN geo.districts d ON ST_Intersects(ST_MakeValid(w.geom), ST_MakeValid(d.geom))
            WHERE d.id = :did
              AND ia.time >= NOW() - INTERVAL '30 days'
            GROUP BY 1
            ORDER BY 1
        """),
        {"did": district_id},
    )
    imerg_trend = [
        {
            "day": str(r["day"]),
            "acc_24h_mm": float(r["max_24h_mm"]) if r["max_24h_mm"] else 0.0,
            "acc_72h_mm": float(r["max_72h_mm"]) if r["max_72h_mm"] else 0.0,
        }
        for r in imerg_result.mappings()
    ]

    # Hydro station latest readings
    station_result = await db.execute(
        text("""
            SELECT
                s.code, s.name, s.source, s.river,
                obs.time AS latest_time,
                obs.level_m, obs.flow_m3s, obs.rain_mm
            FROM hydro.stations s
            LEFT JOIN LATERAL (
                SELECT * FROM hydro.station_observations o
                WHERE o.station_id = s.id ORDER BY o.time DESC LIMIT 1
            ) obs ON TRUE
            WHERE ST_DWithin(s.geom::geography,
                (SELECT ST_Centroid(ST_MakeValid(geom))::geography FROM geo.districts WHERE id = :did),
                30000)
            ORDER BY s.name
            LIMIT 5
        """),
        {"did": district_id},
    )
    stations = [
        {
            "code": r["code"], "name": r["name"],
            "source": r["source"], "river": r["river"],
            "latest_time": _iso(r["latest_time"]),
            "level_m": r["level_m"], "flow_m3s": r["flow_m3s"], "rain_mm": r["rain_mm"],
        }
        for r in station_result.mappings()
    ]

    # SINPAD historical event count (table may not exist if load_sinpad.py not run)
    try:
        sinpad_result = await db.execute(
            text("""
                SELECT COUNT(*) AS cnt
                FROM historical.sinpad_events
                WHERE distrito ILIKE '%' || :name || '%'
            """),
            {"name": district["name"]},
        )
        historical_count = int((sinpad_result.scalar() or 0))
    except Exception as exc:
        logger.debug("SINPAD table not available (run load_sinpad.py to enable): %s", exc)
        historical_count = 0

    return {
        "retrieved_at": _now_iso(),
        "district": {
            "ubigeo": ubigeo,
            "name": district["name"],
            "population": district["population"],
            "area_km2": district["area_km2"],
        },
        "active_alerts": alerts,
        "alerts_trend_7d": alerts_trend,
        "social_24h": social_breakdown,
        "imerg_trend_30d": imerg_trend,
        "stations": stations,
        "sinpad_historical_events": historical_count,
    }


@router.get("/{ubigeo}/watersheds")
async def get_district_watersheds(
    ubigeo: str, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """Return watersheds that intersect a given district."""
    result = await db.execute(
        text("""
            SELECT DISTINCT ON (w.id)
                w.id, w.name, w.river, w.area_km2,
                ST_AsGeoJSON(w.geom)::json AS geometry
            FROM geo.watersheds w
            JOIN geo.districts d ON ST_Intersects(ST_MakeValid(d.geom), ST_MakeValid(w.geom))
            WHERE d.ubigeo = :ubigeo
            ORDER BY w.id
        """),
        {"ubigeo": ubigeo},
    )
    rows = result.mappings().all()
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": r["id"], "name": r["name"],
                    "river": r["river"], "area_km2": r["area_km2"],
                },
                "geometry": r["geometry"],
            }
            for r in rows
        ],
    }
