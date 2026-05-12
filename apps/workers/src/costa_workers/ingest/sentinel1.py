"""Sentinel-1 GRD ingest from Microsoft Planetary Computer STAC API.

Sprint 1 implementation target:
- Search PC STAC for sentinel-1-grd over Lima AOI
- Download GRD scenes to MinIO
- Register items in pgstac catalog
- Trigger RTC processing via sarsen or ASF HyP3
"""
import logging
from datetime import datetime, timezone

import pystac_client
from prefect import flow, task
from prefect.tasks import task_input_hash
from datetime import timedelta

logger = logging.getLogger(__name__)

PLANETARY_COMPUTER_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
LIMA_BBOX = [-77.2, -12.5, -76.7, -11.7]  # west, south, east, north


@task(
    retries=3,
    retry_delay_seconds=60,
    cache_key_fn=task_input_hash,
    cache_expiration=timedelta(hours=1),
)
def search_sentinel1_scenes(
    start_datetime: datetime,
    end_datetime: datetime,
    bbox: list[float] = LIMA_BBOX,
) -> list[dict]:
    """Search Planetary Computer STAC for Sentinel-1 GRD scenes over Lima AOI."""
    catalog = pystac_client.Client.open(PLANETARY_COMPUTER_STAC)
    search = catalog.search(
        collections=["sentinel-1-grd"],
        bbox=bbox,
        datetime=(start_datetime, end_datetime),
        query={"platform": {"eq": "SENTINEL-1A"}},  # prefer S1A for consistency
    )
    items = list(search.item_collection())
    logger.info("Found %d Sentinel-1 scenes for %s–%s", len(items), start_datetime, end_datetime)
    return [item.to_dict() for item in items]


@task(retries=2, retry_delay_seconds=120)
def download_scene_to_minio(scene_dict: dict, minio_bucket: str) -> str:
    """Download Sentinel-1 scene assets to MinIO. Returns MinIO object path."""
    # TODO Sprint 1: implement with aiobotocore + httpx streaming
    scene_id = scene_dict["id"]
    logger.info("TODO: download scene %s to MinIO bucket %s", scene_id, minio_bucket)
    return f"s3://{minio_bucket}/sentinel1/{scene_id}/"


@task
def register_in_stac(scene_dict: dict, minio_path: str) -> str:
    """Register scene in pgstac catalog. Returns STAC item ID."""
    # TODO Sprint 1: POST to stac-fastapi /collections/sentinel-1-grd-lima/items
    scene_id = scene_dict["id"]
    logger.info("TODO: register %s in pgstac", scene_id)
    return scene_id


@flow(name="ingest-sentinel1", log_prints=True)
def ingest_sentinel1_flow(
    lookback_days: int = 7,
    minio_bucket: str = "rasters",
):
    """Main Sentinel-1 ingest flow. Searches, downloads, and registers scenes."""
    end_dt = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(days=lookback_days)

    scenes = search_sentinel1_scenes(start_dt, end_dt)

    for scene in scenes:
        minio_path = download_scene_to_minio(scene, minio_bucket)
        register_in_stac(scene, minio_path)

    logger.info("Sentinel-1 ingest complete: %d scenes processed", len(scenes))
    return {"scenes_processed": len(scenes)}
