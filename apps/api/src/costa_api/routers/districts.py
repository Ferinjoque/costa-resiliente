"""District and geographic reference endpoints."""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.db import get_db

router = APIRouter(prefix="/districts", tags=["geo"])


@router.get("")
async def list_districts(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """
    Return all 43 Lima Metropolitana districts as GeoJSON FeatureCollection.
    Properties: ubigeo, name, province, region, area_km2, population.
    """
    result = await db.execute(
        text("""
            SELECT
                ubigeo,
                name,
                province,
                region,
                area_km2,
                population,
                ST_AsGeoJSON(geom)::json AS geometry
            FROM geo.districts
            ORDER BY name
        """)
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
    return {"type": "FeatureCollection", "features": features}


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


@router.get("/{ubigeo}/watersheds")
async def get_district_watersheds(
    ubigeo: str, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """Return watersheds that intersect a given district."""
    result = await db.execute(
        text("""
            SELECT DISTINCT
                w.id, w.name, w.river, w.area_km2,
                ST_AsGeoJSON(w.geom)::json AS geometry
            FROM geo.watersheds w
            JOIN geo.districts d ON ST_Intersects(d.geom, w.geom)
            WHERE d.ubigeo = :ubigeo
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
