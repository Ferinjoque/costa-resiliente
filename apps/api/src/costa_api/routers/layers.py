"""Map layer data endpoints — IMERG, SAR flood, huayco, infrastructure."""
from fastapi import APIRouter, Query
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/layers", tags=["layers"])


@router.get("/imerg/latest")
async def imerg_latest(
    watershed_id: int | None = Query(None),
    hours: int = Query(24, ge=1, le=168),
):
    """Latest IMERG rainfall accumulations, optionally filtered by watershed."""
    # TODO Sprint 1: query hydro.imerg_accumulations
    return {"type": "FeatureCollection", "features": []}


@router.get("/flood/latest")
async def flood_latest():
    """Latest SAR flood polygons from ml.flood_polygons."""
    # TODO Sprint 3: query ml.flood_polygons
    return {"type": "FeatureCollection", "features": []}


@router.get("/huayco/susceptibility")
async def huayco_susceptibility():
    """Current huayco probability per quebrada."""
    # TODO Sprint 4: query ml.huayco_susceptibility
    return {"type": "FeatureCollection", "features": []}


@router.get("/infrastructure")
async def infrastructure(
    type: list[str] | None = Query(None),
    district_id: int | None = None,
):
    """Critical infrastructure points, filtered by type and/or district."""
    # TODO Sprint 1: query geo.infrastructure
    return {"type": "FeatureCollection", "features": []}


@router.get("/stations")
async def stations(source: str | None = Query(None)):
    """Hydro station locations with latest reading."""
    # TODO Sprint 4: query hydro.stations + latest observation
    return {"type": "FeatureCollection", "features": []}
