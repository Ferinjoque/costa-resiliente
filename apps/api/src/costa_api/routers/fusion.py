"""Multi-hazard fusion endpoint — joins flood × huayco × social × population per district."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.db import get_db

router = APIRouter(prefix="/fusion", tags=["fusion"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _risk_prose_es(
    population: int | None,
    flood_area_km2: float,
    flood_polygon_count: int,
    huayco_risk: str | None,
    huayco_prob: float | None,
    social_urgent: int,
    social_total: int,
    district_name: str,
) -> str:
    parts: list[str] = []

    if flood_polygon_count > 0 and flood_area_km2 > 0:
        pop_str = f"; ~{population:,} personas en zona afectada" if population else ""
        parts.append(
            f"{flood_polygon_count} polígono(s) de inundación SAR activos "
            f"({flood_area_km2:.1f} km² detectados{pop_str})"
        )
    else:
        parts.append("Sin inundaciones SAR activas detectadas")

    if huayco_risk and huayco_prob is not None:
        RISK_ES = {"low": "bajo", "medium": "moderado", "high": "alto", "very_high": "muy alto"}
        parts.append(
            f"Riesgo de huayco {RISK_ES.get(huayco_risk, huayco_risk)} "
            f"(probabilidad {huayco_prob * 100:.0f}%)"
        )

    if social_total > 0:
        parts.append(
            f"{social_urgent} señal(es) urgente(s) de {social_total} reportes ciudadanos (últimas 3 h)"
        )

    return f"{district_name}: " + " · ".join(parts) + "."


def _risk_prose_en(
    population: int | None,
    flood_area_km2: float,
    flood_polygon_count: int,
    huayco_risk: str | None,
    huayco_prob: float | None,
    social_urgent: int,
    social_total: int,
    district_name: str,
) -> str:
    parts: list[str] = []

    if flood_polygon_count > 0 and flood_area_km2 > 0:
        pop_str = f"; ~{population:,} people in affected zone" if population else ""
        parts.append(
            f"{flood_polygon_count} active SAR flood polygon(s) "
            f"({flood_area_km2:.1f} km² detected{pop_str})"
        )
    else:
        parts.append("No active SAR flood extents detected")

    if huayco_risk and huayco_prob is not None:
        RISK_EN = {"low": "low", "medium": "moderate", "high": "high", "very_high": "very high"}
        parts.append(
            f"{RISK_EN.get(huayco_risk, huayco_risk)} mudslide risk "
            f"(probability {huayco_prob * 100:.0f}%)"
        )

    if social_total > 0:
        parts.append(
            f"{social_urgent} urgent signal(s) from {social_total} citizen reports (last 3 h)"
        )

    return f"{district_name}: " + " · ".join(parts) + "."


def _overall_risk(
    flood_area_km2: float,
    huayco_risk: str | None,
    social_urgent: int,
) -> str:
    """Simple three-level overall risk label for the callout badge."""
    if (
        flood_area_km2 > 1.0
        or huayco_risk in ("high", "very_high")
        or social_urgent >= 5
    ):
        return "alto"
    if (
        flood_area_km2 > 0
        or huayco_risk == "medium"
        or social_urgent >= 2
    ):
        return "moderado"
    return "bajo"


@router.get("/{ubigeo}")
async def district_fusion(
    ubigeo: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Multi-hazard fusion summary for a single district (by ubigeo).

    Joins:
    - ml.flood_polygons: active SAR-derived flood extents intersecting district
    - ml.huayco_susceptibility: highest-risk quebrada within district watershed
    - social.signals: urgent citizen reports in last 3 hours
    - geo.districts.population: INEI 2017 census
    """
    if not ubigeo.isascii() or not ubigeo.isdigit() or len(ubigeo) != 6:
        raise HTTPException(400, "ubigeo must be a 6-digit INEI code")

    # Cap expensive spatial join queries at 10s each so one slow district
    # doesn't block the DB under load.
    await db.execute(text("SET LOCAL statement_timeout = '10000'"))

    # ── District metadata ─────────────────────────────────────────────────────
    dist_row = await db.execute(
        text("SELECT id, name, population FROM geo.districts WHERE ubigeo = :ubigeo"),
        {"ubigeo": ubigeo},
    )
    dist = dist_row.mappings().first()
    if not dist:
        raise HTTPException(404, f"District {ubigeo} not found")

    district_id: int = dist["id"]
    district_name: str = dist["name"]
    population: int | None = dist["population"]

    # ── Flood intersection ────────────────────────────────────────────────────
    flood_row = await db.execute(
        text("""
            SELECT
                COUNT(fp.id)::int AS polygon_count,
                COALESCE(
                    SUM(
                        ST_Area(
                            ST_Intersection(
                                ST_MakeValid(d.geom), ST_MakeValid(fp.geom)
                            )::geography
                        ) / 1e6
                    ), 0
                )::float AS overlap_km2,
                MAX(fp.acquired_at) AS latest_flood_at
            FROM geo.districts d
            JOIN ml.flood_polygons fp
              ON ST_Intersects(ST_MakeValid(d.geom), ST_MakeValid(fp.geom))
            WHERE d.id = :district_id
              AND fp.acquired_at > NOW() - INTERVAL '7 days'
        """),
        {"district_id": district_id},
    )
    flood = flood_row.mappings().first()
    flood_count = int(flood["polygon_count"]) if flood and flood["polygon_count"] else 0
    flood_area = float(flood["overlap_km2"]) if flood and flood["overlap_km2"] else 0.0
    latest_flood_at = flood["latest_flood_at"].isoformat() if flood and flood.get("latest_flood_at") else None

    # ── Huayco risk (highest-probability quebrada in district's watersheds) ───
    huayco_row = await db.execute(
        text("""
            SELECT
                hs.risk_level,
                hs.probability,
                q.name AS quebrada_name,
                hs.computed_at
            FROM ml.huayco_susceptibility hs
            JOIN geo.quebradas q ON q.id = hs.quebrada_id
            JOIN geo.watersheds w ON w.id = q.watershed_id
            WHERE ST_Intersects(ST_MakeValid(w.geom), (
                SELECT ST_MakeValid(geom) FROM geo.districts WHERE id = :district_id
            ))
            ORDER BY hs.probability DESC NULLS LAST
            LIMIT 1
        """),
        {"district_id": district_id},
    )
    huayco = huayco_row.mappings().first()
    huayco_risk: str | None = huayco["risk_level"] if huayco else None
    huayco_prob: float | None = float(huayco["probability"]) if huayco and huayco["probability"] is not None else None
    quebrada_name: str | None = huayco["quebrada_name"] if huayco else None
    huayco_at = huayco["computed_at"].isoformat() if huayco and huayco["computed_at"] else None

    # ── Rainfall (latest IMERG for district's intersecting watersheds) ──────────
    rainfall_row = await db.execute(
        text("""
            SELECT
                w.name AS watershed,
                ia.acc_72h_mm,
                ia.acc_24h_mm,
                ia.time AS imerg_time
            FROM hydro.imerg_accumulations ia
            JOIN geo.watersheds w ON w.id = ia.watershed_id
            WHERE ia.time = (
                SELECT MAX(time) FROM hydro.imerg_accumulations
            )
              AND ST_Intersects(ST_MakeValid(w.geom), (
                SELECT ST_MakeValid(geom) FROM geo.districts WHERE id = :district_id
              ))
            ORDER BY ia.acc_72h_mm DESC NULLS LAST
            LIMIT 1
        """),
        {"district_id": district_id},
    )
    rainfall_r = rainfall_row.mappings().first()
    rainfall_ws = rainfall_r["watershed"] if rainfall_r else None
    rainfall_72h = float(rainfall_r["acc_72h_mm"]) if rainfall_r and rainfall_r["acc_72h_mm"] is not None else None
    rainfall_24h = float(rainfall_r["acc_24h_mm"]) if rainfall_r and rainfall_r["acc_24h_mm"] is not None else None
    rainfall_level = None
    if rainfall_72h is not None:
        rainfall_level = "emergencia" if rainfall_72h >= 50 else ("alerta" if rainfall_72h >= 25 else "normal")
    elif rainfall_24h is not None and rainfall_24h >= 15:
        rainfall_level = "aviso"

    # ── Social signals (last 3 hours) ─────────────────────────────────────────
    social_row = await db.execute(
        text("""
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (
                    WHERE triage_label IN ('needs_help', 'infrastructure_damage', 'road_blocked', 'huayco_observation', 'flood_observation')
                )::int AS urgent
            FROM social.signals
            WHERE district_id = :district_id
              AND ingested_at > NOW() - INTERVAL '3 hours'
        """),
        {"district_id": district_id},
    )
    social = social_row.mappings().first()
    social_total = int(social["total"]) if social and social["total"] else 0
    social_urgent = int(social["urgent"]) if social and social["urgent"] else 0

    # ── Compose ──────────────────────────────────────────────────────────────
    risk_level = _overall_risk(flood_area, huayco_risk, social_urgent)
    # Elevate risk_level if rainfall is above ANA threshold
    if rainfall_level == "emergencia" and risk_level != "alto":
        risk_level = "alto"
    elif rainfall_level == "alerta" and risk_level == "bajo":
        risk_level = "moderado"
    prose_es = _risk_prose_es(
        population, flood_area, flood_count,
        huayco_risk, huayco_prob,
        social_urgent, social_total,
        district_name,
    )
    prose_en = _risk_prose_en(
        population, flood_area, flood_count,
        huayco_risk, huayco_prob,
        social_urgent, social_total,
        district_name,
    )

    return {
        "retrieved_at": _now_iso(),
        "district": {
            "ubigeo": ubigeo,
            "name": district_name,
            "population": population,
        },
        "risk_level": risk_level,
        "prose_es": prose_es,
        "prose_en": prose_en,
        "flood": {
            "active_polygon_count": flood_count,
            "overlap_km2": round(flood_area, 3),
            "latest_scene_at": latest_flood_at,
        },
        "huayco": {
            "highest_risk_level": huayco_risk,
            "highest_probability": round(huayco_prob, 3) if huayco_prob is not None else None,
            "quebrada_name": quebrada_name,
            "computed_at": huayco_at,
        },
        "social": {
            "total_signals_3h": social_total,
            "urgent_signals_3h": social_urgent,
        },
        "rainfall": {
            "watershed": rainfall_ws,
            "acc_72h_mm": round(rainfall_72h, 1) if rainfall_72h is not None else None,
            "acc_24h_mm": round(rainfall_24h, 1) if rainfall_24h is not None else None,
            "level": rainfall_level,  # emergencia / alerta / aviso / normal / null
        },
    }
