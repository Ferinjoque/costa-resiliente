"""Map layer data endpoints: IMERG, SAR flood, huayco, infrastructure, stations."""
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import ARRAY, String, bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.db import get_db

router = APIRouter(prefix="/layers", tags=["layers"])

_SIGNAL_LABELS = {
    "needs_help", "road_blocked", "infrastructure_damage",
    "huayco_observation", "flood_observation", "weather_observation",
    "false_alarm", "irrelevant",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _iso(dt: Any) -> str | None:
    if dt is None:
        return None
    return dt.isoformat() if hasattr(dt, "isoformat") else str(dt)


def _parse_replay_time(at: Optional[str]) -> datetime:
    """Parse ISO date string for replay; return UTC now if absent.
    Date-only strings (YYYY-MM-DD) are treated as end-of-day so all data
    ingested on that date is included in the replay view.
    """
    if not at:
        return datetime.now(timezone.utc)
    try:
        # Detect date-only input (YYYY-MM-DD or YYYY-MM-DDZ) by length before parsing
        # to avoid treating explicit midnight (T00:00:00) as a bare-date input.
        is_date_only = len(at.split("T")[0]) == len(at) or at.endswith("Z") and "T" not in at
        dt = datetime.fromisoformat(at.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        # Promote bare date (no time component) to 23:59:59 so the full day is visible
        if is_date_only:
            dt = dt.replace(hour=23, minute=59, second=59)
        return dt
    except ValueError:
        return datetime.now(timezone.utc)


@router.get("/imerg/latest")
async def imerg_latest(
    watershed_id: int | None = Query(None, description="Filter by watershed ID"),
    hours: int = Query(24, ge=1, le=168, description="Accumulation window hours"),
    at: Optional[str] = Query(None, description="Replay reference date ISO (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Latest IMERG rainfall accumulations per watershed.
    Returns a GeoJSON FeatureCollection: one Feature per watershed,
    with accumulation values attached as properties.
    Supports replay mode via ?at=YYYY-MM-DD.
    """
    ref_time = _parse_replay_time(at)
    params: dict = {"hours": hours, "ref_time": ref_time}
    where_clause = ""
    if watershed_id is not None:
        where_clause = "AND ia.watershed_id = :watershed_id"
        params["watershed_id"] = watershed_id

    # Actual data freshness: time of the most recent IMERG record in DB
    await db.execute(text("SET LOCAL statement_timeout = '15000'"))
    freshness_row = await db.execute(
        text("SELECT MAX(time) FROM hydro.imerg_accumulations")
    )
    data_updated_at = _iso(freshness_row.scalar())

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
                ia.acc_168h_mm,
                ST_AsGeoJSON(w.geom)::json AS geometry
            FROM geo.watersheds w
            LEFT JOIN LATERAL (
                SELECT *
                FROM hydro.imerg_accumulations ia
                WHERE ia.watershed_id = w.id
                  AND ia.time <= :ref_time
                  AND ia.time >= :ref_time - INTERVAL '1 hour' * :hours
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
        "source": "NASA IMERG Late Run V07B (GPM)",
        "source_url": "https://gpm.nasa.gov/data/imerg",
        "retrieved_at": _now_iso(),
        "data_updated_at": data_updated_at,
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": r["id"],
                    "name": r["name"],
                    "river": r["river"],
                    "latest_time": _iso(r["latest_time"]),
                    "acc_1h_mm": r["acc_1h_mm"],
                    "acc_3h_mm": r["acc_3h_mm"],
                    "acc_6h_mm": r["acc_6h_mm"],
                    "acc_12h_mm": r["acc_12h_mm"],
                    "acc_24h_mm": r["acc_24h_mm"],
                    "acc_72h_mm": r["acc_72h_mm"],
                    "acc_168h_mm": r["acc_168h_mm"],
                },
                "geometry": r["geometry"],
            }
            for r in rows
        ],
    }


@router.get("/flood/latest")
async def flood_latest(
    limit: int = Query(10, ge=1, le=50),
    at: Optional[str] = Query(None, description="Replay reference date ISO (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Latest SAR flood polygons from ml.flood_polygons. Supports replay via ?at=."""
    ref_time = _parse_replay_time(at)
    await db.execute(text("SET LOCAL statement_timeout = '10000'"))
    freshness_row = await db.execute(
        text("SELECT MAX(acquired_at) FROM ml.flood_polygons")
    )
    data_updated_at = _iso(freshness_row.scalar())

    result = await db.execute(
        text("""
            SELECT
                id, scene_id, acquired_at, model_version, confidence, area_km2,
                ST_AsGeoJSON(geom)::json AS geometry
            FROM ml.flood_polygons
            WHERE acquired_at <= :ref_time
              AND NOT ST_IsEmpty(geom)
            ORDER BY acquired_at DESC
            LIMIT :limit
        """),
        {"limit": limit, "ref_time": ref_time},
    )
    rows = result.mappings().all()
    return {
        "type": "FeatureCollection",
        "source": "ESA Sentinel-1 SAR (flood-seg-v0.1)",
        "source_url": "https://planetarycomputer.microsoft.com/dataset/sentinel-1-grd",
        "retrieved_at": _now_iso(),
        "data_updated_at": data_updated_at,
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": r["id"],
                    "scene_id": r["scene_id"],
                    "acquired_at": _iso(r["acquired_at"]),
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
    await db.execute(text("SET LOCAL statement_timeout = '10000'"))
    freshness_row = await db.execute(
        text("SELECT MAX(computed_at) FROM ml.huayco_susceptibility")
    )
    data_updated_at = _iso(freshness_row.scalar())

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
                ST_AsGeoJSON(ST_PointOnSurface(q.geom))::json AS geometry
            FROM geo.quebradas q
            LEFT JOIN ml.huayco_susceptibility hs ON hs.quebrada_id = q.id
            WHERE q.geom IS NOT NULL
            ORDER BY hs.quebrada_id, hs.computed_at DESC
        """)
    )
    rows = result.mappings().all()
    return {
        "type": "FeatureCollection",
        "source": "XGBoost huayco model v0.1 + IMERG trigger",
        "source_url": "https://www.ingemmet.gob.pe/mapas-de-peligros",
        "retrieved_at": _now_iso(),
        "data_updated_at": data_updated_at,
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": r["id"],
                    "name": r["name"],
                    "priority": r["priority"],
                    "probability": r["probability"],
                    "risk_level": r["risk_level"],
                    "computed_at": _iso(r["computed_at"]),
                    "trigger_rain_24h_mm": r["trigger_rain_24h_mm"],
                },
                "geometry": r["geometry"],
            }
            for r in rows
        ],
    }


@router.get("/hazard")
async def hazard_zones(
    hazard_type: str | None = Query(None, description="Filter: flood, landslide, huayco"),
    level: str | None = Query(None, description="Filter: muy_alto, alto, medio, bajo"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """CENEPRED SIGRID official hazard zone polygons."""
    await db.execute(text("SET LOCAL statement_timeout = '15000'"))
    freshness_row = await db.execute(
        text("SELECT MAX(loaded_at) FROM geo.hazard_zones")
    )
    data_updated_at = _iso(freshness_row.scalar())

    params: dict = {}
    conditions = []
    if hazard_type:
        conditions.append("hazard_type = :hazard_type")
        params["hazard_type"] = hazard_type
    if level:
        conditions.append("level = :level")
        params["level"] = level

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    result = await db.execute(
        text(f"""
            SELECT id, name, hazard_type, level, source_layer, loaded_at,
                   ST_AsGeoJSON(geom)::json AS geometry
            FROM geo.hazard_zones
            {where}
            ORDER BY hazard_type, level, id
            LIMIT 5000
        """),
        params,
    )
    rows = result.mappings().all()
    # Dynamic source attribution based on what data is loaded
    source_row = await db.execute(
        text("SELECT ARRAY_AGG(DISTINCT source_layer) FROM geo.hazard_zones")
    )
    loaded_sources = source_row.scalar() or []
    if loaded_sources and loaded_sources != [None]:
        if any("sinpad" in (s or "") for s in loaded_sources):
            src_name = "INDECI SINPAD 2003-2020 (densidad histórica de eventos)"
            src_url = "https://sinpad2.indeci.gob.pe"
        else:
            src_name = "CENEPRED SIGRID: Cartografía de Peligros"
            src_url = "https://sigrid.cenepred.gob.pe"
    else:
        src_name = "CENEPRED SIGRID"
        src_url = "https://sigrid.cenepred.gob.pe"

    return {
        "type": "FeatureCollection",
        "source": src_name,
        "source_url": src_url,
        "retrieved_at": _now_iso(),
        "data_updated_at": data_updated_at,
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": r["id"],
                    "name": r["name"],
                    "hazard_type": r["hazard_type"],
                    "level": r["level"],
                    "source_layer": r["source_layer"],
                    "loaded_at": _iso(r["loaded_at"]),
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

    await db.execute(text("SET LOCAL statement_timeout = '10000'"))
    sql = text(f"""
            SELECT
                i.id, i.osm_id, i.type, i.name,
                i.district_id, d.name AS district_name,
                i.properties,
                ST_AsGeoJSON(i.geom)::json AS geometry
            FROM geo.infrastructure i
            LEFT JOIN geo.districts d ON d.id = i.district_id
            {where}
            ORDER BY i.type, i.name
            LIMIT 2000
        """)
    if type:
        sql = sql.bindparams(bindparam("types", type_=ARRAY(String)))
    result = await db.execute(sql, params)
    rows = result.mappings().all()
    return {
        "type": "FeatureCollection",
        # OSM covers hospitals/schools/bridges/substations/fire stations; INDECI
        # relief warehouses and PNP comisarías come from the CENEPRED COEN FEN
        # 2023 service (per-feature provenance is in properties.source).
        "source": "OpenStreetMap (Overpass API) + CENEPRED COEN FEN 2023",
        "source_url": "https://overpass-api.de",
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
                    "district_name": r["district_name"],
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
    await db.execute(text("SET LOCAL statement_timeout = '10000'"))
    freshness_row = await db.execute(
        text("SELECT MAX(time) FROM hydro.station_observations")
    )
    data_updated_at = _iso(freshness_row.scalar())

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
        "source_url": "https://www.ana.gob.pe/monitoreo-hidrologico",
        "retrieved_at": _now_iso(),
        "data_updated_at": data_updated_at,
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
                    "latest_time": _iso(r["latest_time"]),
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
    await db.execute(text("SET LOCAL statement_timeout = '10000'"))
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
        "source_url": "https://www.ana.gob.pe",
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
    await db.execute(text("SET LOCAL statement_timeout = '10000'"))
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
        "source_url": "https://www.ingemmet.gob.pe",
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


@router.get("/flood/exposure")
async def flood_exposure(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Population at risk: spatial join of recent flood polygons × districts.
    Only includes flood polygons acquired within the last 7 days to avoid
    accumulating stale/historical flood extents into the population estimate."""
    await db.execute(text("SET LOCAL statement_timeout = '30000'"))
    result = await db.execute(
        text("""
            SELECT
                d.id AS district_id,
                d.name AS district_name,
                d.population,
                COUNT(DISTINCT f.id) AS flood_polygon_count,
                COALESCE(
                    ROUND(
                        SUM(
                            ST_Area(
                                ST_Intersection(
                                    ST_MakeValid(f.geom), ST_MakeValid(d.geom)
                                )::geography
                            ) / 1000000
                        )::numeric, 2
                    ), 0
                ) AS overlap_km2,
                MAX(f.acquired_at) AS latest_scene_at
            FROM geo.districts d
            JOIN ml.flood_polygons f
              ON ST_Intersects(ST_MakeValid(f.geom), ST_MakeValid(d.geom))
             AND f.acquired_at >= NOW() - INTERVAL '7 days'
            GROUP BY d.id, d.name, d.population
            ORDER BY overlap_km2 DESC
        """)
    )
    rows = result.mappings().all()
    total_pop = sum((r["population"] or 0) for r in rows)
    return {
        "retrieved_at": _now_iso(),
        "source": "ml.flood_polygons × geo.districts (INEI 2017)",
        "total_affected_population": total_pop,
        "districts": [
            {
                "district_id": r["district_id"],
                "district_name": r["district_name"],
                "population": r["population"],
                "flood_polygon_count": r["flood_polygon_count"],
                "overlap_km2": float(r["overlap_km2"]),
                "latest_scene_at": _iso(r["latest_scene_at"]),
            }
            for r in rows
        ],
    }


@router.get("/social")
async def social_signals(
    hours: int = Query(48, ge=1, le=168, description="Lookback window hours"),
    label: str | None = Query(None, description="Filter by triage_label"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Social signal pins: GeoJSON FeatureCollection for map layer."""
    if label is not None and label not in _SIGNAL_LABELS:
        raise HTTPException(400, f"Invalid label. Must be one of: {sorted(_SIGNAL_LABELS)}")
    params: dict = {"hours": hours}
    conditions = [
        "s.triage_label NOT IN ('irrelevant', 'false_alarm')",
        "s.ingested_at >= NOW() - INTERVAL '1 hour' * :hours",
        "(s.geom IS NOT NULL OR s.district_id IS NOT NULL)",
    ]
    if label:
        conditions.append("s.triage_label = :label")
        params["label"] = label

    where = " AND ".join(conditions)
    await db.execute(text("SET LOCAL statement_timeout = '10000'"))
    result = await db.execute(
        text(f"""
            SELECT
                s.id, s.source, s.source_id, s.triage_label, s.triage_confidence,
                s.published_at, s.ingested_at, s.district_id, d.name AS district_name,
                s.content_redacted AS text,
                COALESCE(
                    ST_AsGeoJSON(s.geom)::json,
                    ST_AsGeoJSON(ST_Centroid(ST_MakeValid(d.geom)))::json
                ) AS geometry
            FROM social.signals s
            LEFT JOIN geo.districts d ON d.id = s.district_id
            WHERE {where}
            ORDER BY s.ingested_at DESC
            LIMIT 500
        """),
        params,
    )
    rows = result.mappings().all()

    freshness_row = await db.execute(
        text("SELECT MAX(ingested_at) FROM social.signals")
    )
    data_updated_at = _iso(freshness_row.scalar())

    return {
        "type": "FeatureCollection",
        "source": "Bluesky + RSS + Reddit + Telegram (señales sociales)",
        "source_url": "https://bsky.app",
        "retrieved_at": _now_iso(),
        "data_updated_at": data_updated_at,
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": r["id"],
                    "source": r["source"],
                    "source_id": r["source_id"],
                    "triage_label": r["triage_label"],
                    "triage_confidence": r["triage_confidence"],
                    "published_at": _iso(r["published_at"]) if r["published_at"] else None,
                    "ingested_at": _iso(r["ingested_at"]),
                    "district_id": r["district_id"],
                    "district_name": r["district_name"],
                    "text": r["text"],
                },
                "geometry": r["geometry"],
            }
            for r in rows
            if r["geometry"] is not None
        ],
    }


@router.get("/shelters")
async def shelters(
    active_only: bool = Query(True, description="Return only active shelters"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """INDECI-designated Lima Metropolitana evacuation shelters (static layer).

    Returns GeoJSON FeatureCollection: one point per shelter with capacity,
    type, and district info. Used by operators to identify the nearest safe
    evacuation destination after population-at-risk alerts.
    """
    where = "WHERE s.active = TRUE" if active_only else ""
    await db.execute(text("SET LOCAL statement_timeout = '10000'"))
    result = await db.execute(
        text(f"""
            SELECT
                s.id, s.name, s.ubigeo, s.shelter_type, s.capacity,
                s.lat, s.lng, s.address, s.indeci_code, s.active, s.notes,
                d.name AS district_name,
                ST_AsGeoJSON(s.geom)::json AS geometry
            FROM geo.shelters s
            LEFT JOIN geo.districts d ON d.ubigeo = s.ubigeo
            {where}
            ORDER BY s.id
        """)
    )
    rows = result.mappings().all()
    return {
        "type": "FeatureCollection",
        "source": "INDECI: Albergues y Refugios Lima Metropolitana (estático)",
        "source_url": "https://www.indeci.gob.pe",
        "retrieved_at": _now_iso(),
        "count": len(rows),
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": r["id"],
                    "name": r["name"],
                    "ubigeo": r["ubigeo"],
                    "shelter_type": r["shelter_type"],
                    "capacity": r["capacity"],
                    "address": r["address"],
                    "indeci_code": r["indeci_code"],
                    "district_name": r["district_name"],
                    "notes": r["notes"],
                },
                "geometry": r["geometry"],
            }
            for r in rows
            if r["geometry"] is not None
        ],
    }
