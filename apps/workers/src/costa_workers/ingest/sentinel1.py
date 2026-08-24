"""Sentinel-1 GRD ingest from Microsoft Planetary Computer STAC API.

Flow:
  search_sentinel1_scenes  →  download_scene_to_minio  →  register_in_stac
  (per scene)                  (GRD assets to MinIO)       (pgstac catalog)

Schedule: daily at 06:00 UTC, lookback 3 days (catches any missed scenes).
"""
import logging
import os
from datetime import datetime, timezone, timedelta
from io import BytesIO
from pathlib import Path

import httpx
import pystac
import pystac_client
from prefect import flow, task
from prefect.tasks import task_input_hash

log = logging.getLogger(__name__)

PLANETARY_COMPUTER_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
LIMA_BBOX = [-77.2, -12.5, -76.7, -11.7]  # west, south, east, north (STAC order)
COLLECTION = "sentinel-1-grd"

# MinIO / S3 config from environment
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "change_me_in_production")
MINIO_USE_SSL = os.getenv("MINIO_USE_SSL", "false").lower() == "true"
MINIO_BUCKET = os.getenv("MINIO_BUCKET_RASTERS", "rasters")

STAC_API_URL = os.getenv("STAC_API_URL", "http://localhost:8080")


# ─── Task: search Planetary Computer ──────────────────────────────────────────
@task(
    retries=3,
    retry_delay_seconds=120,
    cache_key_fn=task_input_hash,
    cache_expiration=timedelta(hours=2),
    log_prints=True,
)
def search_sentinel1_scenes(
    start_datetime: datetime,
    end_datetime: datetime,
    bbox: list[float] = LIMA_BBOX,
) -> list[dict]:
    """
    Search Planetary Computer STAC for S-1 GRD scenes over Lima AOI.
    Returns list of serialized STAC item dicts.
    """
    catalog = pystac_client.Client.open(
        PLANETARY_COMPUTER_STAC,
        modifier=_pc_modifier,
    )
    search = catalog.search(
        collections=[COLLECTION],
        bbox=bbox,
        datetime=(start_datetime, end_datetime),
        sortby="-datetime",
        max_items=50,
    )
    items = list(search.item_collection())
    log.info(
        "PC STAC search: %d scenes found for %s → %s",
        len(items), start_datetime.date(), end_datetime.date(),
    )
    return [item.to_dict() for item in items]


def _pc_modifier(params: dict) -> dict:
    """Sign Planetary Computer asset URLs using the PC subscription key if available."""
    key = os.getenv("PC_SDK_SUBSCRIPTION_KEY", "")
    if key:
        params.setdefault("headers", {})["Ocp-Apim-Subscription-Key"] = key
    return params


# ─── Task: download scene assets to MinIO ─────────────────────────────────────
@task(
    retries=2,
    retry_delay_seconds=180,
    log_prints=True,
)
def download_scene_to_minio(scene_dict: dict) -> str:
    """
    Download Sentinel-1 VV and VH GRD asset COGs to MinIO.
    Returns the MinIO prefix path (s3://rasters/sentinel1/<scene_id>/).
    """
    import boto3
    from botocore.exceptions import ClientError

    scene_id = scene_dict["id"]
    prefix = f"sentinel1/{scene_id}/"

    s3 = boto3.client(
        "s3",
        endpoint_url=f"http{'s' if MINIO_USE_SSL else ''}://{MINIO_ENDPOINT}",
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
    )

    # Check if already downloaded (idempotent)
    try:
        s3.head_object(Bucket=MINIO_BUCKET, Key=f"{prefix}metadata.json")
        log.info("Scene %s already in MinIO: skipping download", scene_id)
        return f"s3://{MINIO_BUCKET}/{prefix}"
    except ClientError:
        pass

    # Download key assets: VV, VH polarisation GeoTIFFs
    assets_to_download = ["vv", "vh", "thumbnail"]
    item = pystac.Item.from_dict(scene_dict)

    for asset_key in assets_to_download:
        if asset_key not in item.assets:
            continue
        asset = item.assets[asset_key]
        href = asset.href

        log.info("Downloading %s/%s from %s", scene_id, asset_key, href[:60])
        try:
            with httpx.Client(follow_redirects=True, timeout=300) as client:
                response = client.get(href)
                response.raise_for_status()
                data = response.content

            ext = Path(href).suffix or ".tif"
            obj_key = f"{prefix}{asset_key}{ext}"
            s3.put_object(Bucket=MINIO_BUCKET, Key=obj_key, Body=data)
            log.info("Stored %s (%d KB)", obj_key, len(data) // 1024)
        except Exception as exc:
            log.warning("Failed to download asset %s/%s: %s", scene_id, asset_key, exc)

    # Store STAC item JSON as metadata
    import json
    s3.put_object(
        Bucket=MINIO_BUCKET,
        Key=f"{prefix}metadata.json",
        Body=json.dumps(scene_dict).encode(),
        ContentType="application/json",
    )

    minio_path = f"s3://{MINIO_BUCKET}/{prefix}"
    log.info("Scene %s stored at %s", scene_id, minio_path)
    return minio_path


# ─── Task: register in pgstac ─────────────────────────────────────────────────
@task(
    retries=3,
    retry_delay_seconds=30,
    log_prints=True,
)
def register_in_stac(scene_dict: dict, minio_path: str) -> str:
    """
    POST the STAC item to the local stac-fastapi (pgstac backend).
    Updates asset HREFs to point to MinIO paths first.
    Returns the registered STAC item ID.
    """
    import json

    scene_id = scene_dict["id"]

    # Rewrite asset HREFs to MinIO self-hosted paths
    updated = dict(scene_dict)
    prefix = minio_path.replace(f"s3://{MINIO_BUCKET}/", "")
    for key, asset in updated.get("assets", {}).items():
        ext = Path(asset.get("href", ".tif")).suffix or ".tif"
        asset["href"] = (
            f"http{'s' if MINIO_USE_SSL else ''}://{MINIO_ENDPOINT}"
            f"/{MINIO_BUCKET}/{prefix}{key}{ext}"
        )

    collection_id = "sentinel-1-grd-lima"
    url = f"{STAC_API_URL}/collections/{collection_id}/items"

    with httpx.Client(timeout=30) as client:
        # Try update first, then create
        resp = client.put(f"{url}/{scene_id}", json=updated)
        if resp.status_code == 404:
            resp = client.post(url, json=updated)
        if resp.status_code not in (200, 201):
            log.warning(
                "STAC registration returned %d for %s: %s",
                resp.status_code, scene_id, resp.text[:200],
            )
        else:
            log.info("Scene %s registered in pgstac", scene_id)

    return scene_id


# ─── Flow ──────────────────────────────────────────────────────────────────────
@flow(name="ingest-sentinel1", log_prints=True)
def ingest_sentinel1_flow(
    lookback_days: int = 3,
    bbox: list[float] = LIMA_BBOX,
) -> dict:
    """
    Main Sentinel-1 ingest flow.
    Searches PC STAC, downloads GRD assets to MinIO, registers in pgstac.
    """
    end_dt = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(days=lookback_days)

    scenes = search_sentinel1_scenes(start_dt, end_dt, bbox)

    if not scenes:
        log.info("No new Sentinel-1 scenes found for lookback=%d days", lookback_days)
        return {"scenes_processed": 0}

    results = []
    for scene in scenes:
        try:
            minio_path = download_scene_to_minio(scene)
        except Exception as exc:
            log.warning("Sentinel-1: download failed for %s, skipping: %s", scene.get("id", "unknown"), exc)
            continue
        if not minio_path:
            log.warning("Sentinel-1: download returned None for %s, skipping registration", scene.get("id", "unknown"))
            continue
        try:
            scene_id = register_in_stac(scene, minio_path)
            results.append(scene_id)
        except Exception as exc:
            log.warning("Sentinel-1: STAC registration failed for %s: %s", scene.get("id", "unknown"), exc)

    log.info("Sentinel-1 ingest complete: %d scenes", len(results))
    return {"scenes_processed": len(results), "scene_ids": results}
