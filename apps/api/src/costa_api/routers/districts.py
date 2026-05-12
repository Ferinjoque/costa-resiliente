"""District and geographic reference endpoints."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/districts", tags=["geo"])


class DistrictFeature(BaseModel):
    type: str = "Feature"
    properties: dict
    geometry: dict


class DistrictCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[DistrictFeature]


@router.get("", response_model=DistrictCollection)
async def list_districts() -> DistrictCollection:
    """Return all 43 Lima Metropolitana districts as GeoJSON FeatureCollection."""
    # TODO Sprint 1: query from PostGIS geo.districts
    return DistrictCollection(
        type="FeatureCollection",
        features=[],
    )


@router.get("/{ubigeo}", response_model=DistrictFeature)
async def get_district(ubigeo: str) -> DistrictFeature:
    """Return a single district by INEI UBIGEO code."""
    # TODO Sprint 1: query from PostGIS
    raise HTTPException(status_code=404, detail=f"District {ubigeo} not found")
