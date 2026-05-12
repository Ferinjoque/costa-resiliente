"""Map layer data endpoints — IMERG, SAR flood, huayco, infrastructure, stations."""
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.db import get_db

router = APIRouter(prefix="/layers", tags=["layers"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/imerg/latest")
async def imerg_latest(
    watershed_id: int | None = Query(None, description="Filter by watershed ID"),
    hours: int = Query(24, ge=1, le=168, description="Accumulation window hours"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Latest IMERG rainfall accumulations per watershed.
    Returns a GeoJSON FeatureCollection — one Feature per watershed,
    with accumulation values attached as properties.
    """
    params: dict = {"hours": hours}
    where_clause = ""
    if watershed_id is not None:
        where_clause = "AND ia.watershed_id = :watershed_id"
        params["watershed_id"] = watershed_id

    result = await db.execute(
        text(f"""
            SELECT
                w.id,
                w.name,
                w.river,
                ia.time AS latest_time,
                ia.acc_1h_mm,
                ia.acc_3h_mm,
                ia.acc_6h_mm,
                ia.acc_12h_mm,
                ia.acc_24h_mm,
                ia.acc_72h_mm,
                ST_AsGeoJSON(w.geom)::json AS geometry
            FROM geo.watersheds w
            LEFT JOIN LATERAL (
                SELECT *
                FROM hydro.imerg_accumulations ia
                WHERE ia.watershed_id = w.id
                  AND ia.time >= NOW() - INTERVAL '1 hour' * :hours
                ORDER BY ia.time DESC
                LIMIT 1
            ) ia ON TRUE
            WHERE 1=1 {where_clause}
            ORDER BY w.name
        """),
        params,
    )
    rows = result.mappings().all()
    return {
        "type": "FeatureCollection",
        "source": "NASA IMERG Early Run v07 (GPM)",
        "retrieved_at": _now_iso(),
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": r["id"],
                    "name": r["name"],
                    "river": r["river"],
                    "latest_time": r["latest_time"].isoformat() if r["latest_time"] else None,
                    "acc_1h_mm": r["acc_1h_mm"],
                    "acc_3h_mm": r["acc_3h_mm"],
                    "acc_6h_mm": r["acc_6h_mm"],
                    "acc_12h_mm": r["acc_12h_mm"],
                    "acc_24h_mm": r["acc_24h_mm"],
                    "acc_72h_mm": r["acc_72h_mm"],
                },
                "geometry": r["geometry"],
            }
            for r in rows
        ],
    }


@router.get("/flood/latest")
async def flood_latest(
    limit: int = Query(10, le=50),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Latest SAR flood polygons from ml.flood_polygons."""
    result = await db.execute(
        text("""
            SELECT
                id, scene_id, acquired_at, model_version, confidence, area_km2,
                ST_AsGeoJSON(geom)::json AS geometry
            FROM ml.flood_polygons
            ORDER BY acquired_at DESC
            LIMIT :limit
        """),
        {"limit": limit},
    )
    rows = result.mappings().all()
    return {
        "type": "FeatureCollection",
        "source": "ESA Sentinel-1 SAR (flood-seg-v0.1)",
        "retrieved_at": _now_iso(),
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": r["id"],
                    "scene_id": r["scene_id"],
                    "acquired_at": r["acquired_at"].isoformat() if r["acquired_at"] else None,
                    "model_version": r["model_version"],
                    "confidence": r["confidence"],
                    "area_km2": r["area_km2"],
                },
                "geometry": r["geometry"],
            }
            for r in rows
        ],
    }


@router.get("/huayco/susceptibility")
async def huayco_susceptibility(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Latest huayco probability per quebrada."""
    result = await db.execute(
        text("""
            SELECT DISTINCT ON (hs.quebrada_id)
                q.id,
                q.name,
                q.priority,
                hs.probability,
                hs.risk_level,
                hs.computed_at,
                hs.trigger_rain_24h_mm,
                ST_AsGeoJSON(q.geom)::json AS geometry
            FROM geo.quebradas q
            LEFT JOIN ml.huayco_susceptibility hs ON hs.quebrada_id = q.id
            ORDER BY hs.quebrada_id, hs.computed_at DESC
        """)
    )
    rows = result.mappings().all()
    return {
        "type": "FeatureCollection",
        "source": "XGBoost huayco model v0.1 + IMERG trigger",
        "retrieved_at": _now_iso(),
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": r["id"],
                    "name": r["name"],
                    "priority": r["priority"],
                    "probability": r["probability"],
                    "risk_level": r["risk_level"],
                    "computed_at": r["computed_at"].isoformat() if r["computed_at"] else None,
                    "trigger_rain_24h_mm": r["trigger_rain_24h_mm"],
                },
                "geometry": r["geometry"],
            }
            for r in rows
        ],
    }


@router.get("/infrastructure")
async def infrastructure(
    type: list[str] | None = Query(None, description="Filter by type(s)"),
    district_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Critical infrastructure points filtered by type and/or district."""
    params: dict = {}
    conditions = []

    if type:
        conditions.append("i.type = ANY(:types)")
        params["types"] = type
    if district_id is not None:
        conditions.append("i.district_id = :district_id")
        params["district_id"] = district_id

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    result = await db.execute(
        text(f"""
            SELECT
                i.id, i.osm_id, i.type, i.name,
                i.district_id, i.properties,
                ST_AsGeoJSON(i.geom)::json AS geometry
            FROM geo.infrastructure i
            {where}
            ORDER BY i.type, i.name
            LIMIT 2000
        """),
        params,
    )
    rows = result.mappings().all()
    return {
        "type": "FeatureCollection",
        "source": "OpenStreetMap (Overpass API)",
        "retrieved_at": _now_iso(),
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": r["id"],
                    "osm_id": r["osm_id"],
                    "type": r["type"],
                    "name": r["name"],
                    "district_id": r["district_id"],
                    **(r["properties"] or {}),
                },
                "geometry": r["geometry"],
            }
            for r in rows
        ],
    }


@router.get("/stations")
async def stations(
    source: str | None = Query(None, description="Filter: ana or senamhi"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Hydro station locations with latest reading."""
    params: dict = {}
    where = ""
    if source:
        where = "WHERE s.source = :source"
        params["source"] = source

    result = await db.execute(
        text(f"""
            SELECT
                s.id, s.code, s.name, s.source, s.river, s.elevation_m, s.active,
                obs.time AS latest_time,
                obs.level_m, obs.flow_m3s, obs.rain_mm,
                ST_AsGeoJSON(s.geom)::json AS geometry
            FROM hydro.stations s
            LEFT JOIN LATERAL (
                SELECT * FROM hydro.station_observations o
                WHERE o.station_id = s.id
                ORDER BY o.time DESC
                LIMIT 1
            ) obs ON TRUE
            {where}
            ORDER BY s.name
        """),
        params,
    )
    rows = result.mappings().all()
    return {
        "type": "FeatureCollection",
        "source": "ANA / SENAMHI river monitoring network",
        "retrieved_at": _now_iso(),
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": r["id"],
                    "code": r["code"],
                    "name": r["name"],
                    "source": r["source"],
                    "river": r["river"],
                    "elevation_m": r["elevation_m"],
                    "active": r["active"],
                    "latest_time": r["latest_time"].isoformat() if r["latest_time"] else None,
                    "level_m": r["level_m"],
                    "flow_m3s": r["flow_m3s"],
                    "rain_mm": r["rain_mm"],
                },
                "geometry": r["geometry"],
            }
            for r in rows
        ],
    }


@router.get("/watersheds")
async def watersheds(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """All Lima watersheds as GeoJSON."""
    result = await db.execute(
        text("""
            SELECT id, name, river, area_km2,
                   outlet_lat, outlet_lon,
                   ST_AsGeoJSON(geom)::json AS geometry
            FROM geo.watersheds
            ORDER BY name
        """)
    )
    rows = result.mappings().all()
    return {
        "type": "FeatureCollection",
        "source": "ANA cuencas hidrograficas Lima",
        "retrieved_at": _now_iso(),
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": r["id"], "name": r["name"], "river": r["river"],
                    "area_km2": r["area_km2"],
                    "outlet_lat": r["outlet_lat"], "outlet_lon": r["outlet_lon"],
                },
                "geometry": r["geometry"],
            }
            for r in rows
        ],
    }


@router.get("/quebradas")
async def quebradas(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """All Lima priority quebradas with thresholds."""
    result = await db.execute(
        text("""
            SELECT q.id, q.name, q.priority, q.threshold_24h_mm,
                   w.name AS watershed_name,
                   ST_AsGeoJSON(q.geom)::json AS geometry
            FROM geo.quebradas q
            LEFT JOIN geo.watersheds w ON w.id = q.watershed_id
            ORDER BY q.priority
        """)
    )
    rows = result.mappings().all()
    return {
        "type": "FeatureCollection",
        "source": "INGEMMET + ANA quebradas prioritarias Lima",
        "retrieved_at": _now_iso(),
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": r["id"], "name": r["name"],
                    "priority": r["priority"],
                    "threshold_24h_mm": r["threshold_24h_mm"],
                    "watershed_name": r["watershed_name"],
                },
                "geometry": r["geometry"],
            }
            for r in rows
        ],
    }
