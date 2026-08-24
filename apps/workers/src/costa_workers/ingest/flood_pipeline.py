"""Flood segmentation Prefect flow.

Connects Sentinel-1 ingest → SAR flood segmentation → PostGIS storage.

Flow:
  list_unprocessed_scenes  →  [per scene] load_scene_from_minio
                           →  run_flood_inference
                           →  store_flood_polygons

Schedule: every 6 hours (scenes arrive ~every 6 days; retries avoid gaps).
Re-processing guard: scene is marked processed in stac items properties;
skips if flood polygon row already exists for that scene_id.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone, timedelta
from io import BytesIO

import numpy as np
from prefect import flow, task
from prefect.tasks import task_input_hash

from costa_workers.ml.flood_segmentation import (
    FloodSegmentationModel,
    sar_to_flood_polygons,
    WEIGHTS_PATH,
)

logger = logging.getLogger(__name__)

# ─── Config ────────────────────────────────────────────────────────────────────

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "change_me_in_production")
MINIO_USE_SSL = os.getenv("MINIO_USE_SSL", "false").lower() == "true"
MINIO_BUCKET = os.getenv("MINIO_BUCKET_RASTERS", "rasters")

DB_DSN = os.getenv("DATABASE_URL", "postgresql://costa:costa@localhost:5432/costa_resiliente")

FLOOD_CONFIDENCE_THRESHOLD = float(os.getenv("FLOOD_CONFIDENCE_THRESHOLD", "0.5"))
FLOOD_MIN_PIXELS = int(os.getenv("FLOOD_MIN_PIXELS", "9"))

# Max scenes per run: avoid OOM on first run after backfill
MAX_SCENES_PER_RUN = int(os.getenv("FLOOD_MAX_SCENES_PER_RUN", "5"))

# ─── Tasks ─────────────────────────────────────────────────────────────────────


@task(retries=2, retry_delay_seconds=60, log_prints=True)
async def list_unprocessed_scenes() -> list[str]:
    """
    Return scene_ids (STAC item IDs) present in MinIO that have no entry yet
    in ml.flood_polygons.  Limits to MAX_SCENES_PER_RUN.
    """
    import asyncpg

    async with asyncpg.create_pool(DB_DSN, min_size=1, max_size=3) as pool:
        # pgstac stores items in the 'pgstac' schema; we join with our flood table
        rows = await pool.fetch(
            """
            SELECT DISTINCT ia.id AS scene_id
            FROM (
                SELECT content->>'id' AS id
                FROM pgstac.items
                WHERE collection = 'sentinel-1-grd'
                ORDER BY content->>'datetime' DESC
                LIMIT 100
            ) ia
            LEFT JOIN ml.flood_polygons fp ON fp.scene_id = ia.id
            WHERE fp.scene_id IS NULL
            LIMIT $1
            """,
            MAX_SCENES_PER_RUN,
        )
    scene_ids = [r["scene_id"] for r in rows]
    logger.info("Unprocessed scenes: %d", len(scene_ids))
    return scene_ids


@task(
    retries=3,
    retry_delay_seconds=120,
    cache_key_fn=task_input_hash,
    cache_expiration=timedelta(hours=12),
    log_prints=True,
)
def load_scene_from_minio(scene_id: str) -> dict:
    """
    Load VV and VH GeoTIFF arrays from MinIO for a given scene_id.

    Returns dict with keys:
      vv_array, vh_array, transform, crs_wkt, acquired_at
    """
    import boto3
    import botocore
    import rasterio
    from rasterio.io import MemoryFile

    s3 = boto3.client(
        "s3",
        endpoint_url=f"{'https' if MINIO_USE_SSL else 'http'}://{MINIO_ENDPOINT}",
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
    )

    def _find_band_key(band: str) -> str:
        """Locate band object in MinIO using list_objects to tolerate .tif/.tiff and case."""
        for prefix in (f"sentinel1/{scene_id}/{band}", f"sentinel-1/{scene_id}/{band}"):
            resp = s3.list_objects_v2(Bucket=MINIO_BUCKET, Prefix=prefix.lower())
            if resp.get("Contents"):
                return resp["Contents"][0]["Key"]
            resp = s3.list_objects_v2(Bucket=MINIO_BUCKET, Prefix=prefix.upper())
            if resp.get("Contents"):
                return resp["Contents"][0]["Key"]
        raise FileNotFoundError(
            f"No MinIO object found for scene {scene_id} band {band} "
            f"(tried sentinel1/ and sentinel-1/ prefixes, both cases)"
        )

    def _read_band(key: str) -> tuple[np.ndarray, object, str]:
        buf = BytesIO()
        s3.download_fileobj(MINIO_BUCKET, key, buf)
        buf.seek(0)
        with MemoryFile(buf) as memfile:
            with memfile.open() as ds:
                arr = ds.read(1).astype(np.float32)
                transform = ds.transform
                crs_wkt = ds.crs.wkt
        return arr, transform, crs_wkt

    vv_key = _find_band_key("vv")
    vh_key = _find_band_key("vh")

    logger.info("Loading VV: s3://%s/%s", MINIO_BUCKET, vv_key)
    vv_array, transform, crs_wkt = _read_band(vv_key)

    logger.info("Loading VH: s3://%s/%s", MINIO_BUCKET, vh_key)
    vh_array, _, _ = _read_band(vh_key)

    # Acquire datetime from scene_id suffix (format: S1A_IW_GRDH_1SDV_20250115T...)
    acquired_at: datetime | None = None
    try:
        date_part = scene_id.split("_")[4]  # e.g. 20250115T120000
        acquired_at = datetime.strptime(date_part, "%Y%m%dT%H%M%S").replace(
            tzinfo=timezone.utc
        )
    except Exception:
        acquired_at = datetime.now(timezone.utc)

    return {
        "scene_id": scene_id,
        "vv_array": vv_array,
        "vh_array": vh_array,
        "transform": transform,
        "crs_wkt": crs_wkt,
        "acquired_at": acquired_at,
    }


@task(log_prints=True)
def run_flood_inference(scene_data: dict) -> list[dict]:
    """
    Run Sen1Floods11 inference on scene arrays. Returns polygon dicts.
    """
    model = FloodSegmentationModel(
        weights_path=WEIGHTS_PATH,
        device=os.getenv("FLOOD_DEVICE", "cpu"),
        threshold=FLOOD_CONFIDENCE_THRESHOLD,
        min_pixels=FLOOD_MIN_PIXELS,
    )
    model.load()

    polygons = sar_to_flood_polygons(
        scene_id=scene_data["scene_id"],
        vv_linear=scene_data["vv_array"],
        vh_linear=scene_data["vh_array"],
        transform=scene_data["transform"],
        crs_wkt=scene_data["crs_wkt"],
        model=model,
        threshold=FLOOD_CONFIDENCE_THRESHOLD,
        min_pixels=FLOOD_MIN_PIXELS,
    )
    return polygons


@task(retries=2, retry_delay_seconds=30, log_prints=True)
async def store_flood_polygons(scene_id: str, polygons: list[dict], acquired_at: datetime) -> int:
    """
    Upsert flood polygons into ml.flood_polygons.
    Returns count of inserted rows.
    """
    import asyncpg
    import json

    async with asyncpg.create_pool(DB_DSN, min_size=1, max_size=3) as pool:
        if not polygons:
            # No flood pixels detected: insert a dry-scene sentinel with an empty
            # geometry so list_unprocessed_scenes() skips this scene on future runs.
            # MULTIPOLYGON EMPTY is a valid PostGIS geometry that satisfies the NOT NULL
            # constraint while signalling zero flood extent to downstream queries.
            await pool.execute(
                """
                INSERT INTO ml.flood_polygons
                    (scene_id, acquired_at, model_version, confidence, area_km2, geom)
                VALUES ($1, $2, $3, 0.0, 0.0,
                    ST_GeomFromText('MULTIPOLYGON EMPTY', 4326))
                ON CONFLICT (scene_id) DO NOTHING
                """,
                scene_id,
                acquired_at,
                "sen1floods11-unet-v1",
            )
            logger.info("Scene %s: no flood detected, dry-scene sentinel inserted", scene_id)
            return 0

        # Schema has GEOMETRY(MULTIPOLYGON) + UNIQUE(scene_id): one row per scene.
        # Build a MULTIPOLYGON GeoJSON in Python and pass as a single parameter so
        # all detected polygons are captured; looping with ON CONFLICT DO NOTHING
        # would silently discard all but the first.
        valid_polys = [p for p in polygons if p.get("geometry") and p["geometry"].get("coordinates")]
        if not valid_polys:
            logger.warning("All polygons lacked geometry for scene %s: skipping", scene_id)
            return 0

        multi_geom = {
            "type": "MultiPolygon",
            "coordinates": [p["geometry"]["coordinates"] for p in valid_polys],
        }
        total_area_km2 = sum(p.get("area_m2", 0.0) for p in valid_polys) / 1_000_000
        mean_confidence = sum(p.get("confidence", 0.0) for p in valid_polys) / len(valid_polys)

        await pool.execute(
            """
            INSERT INTO ml.flood_polygons
                (scene_id, acquired_at, model_version, confidence, area_km2, geom)
            VALUES ($1, $2, $3, $4, $5,
                ST_SetSRID(ST_GeomFromGeoJSON($6), 4326))
            ON CONFLICT (scene_id) DO NOTHING
            """,
            scene_id,
            acquired_at,
            "sen1floods11-unet-v1",
            mean_confidence,
            total_area_km2,
            json.dumps(multi_geom),
        )
        inserted = len(valid_polys)

    logger.info("Stored %d polygon(s) as 1 MULTIPOLYGON row for scene %s", inserted, scene_id)
    return inserted


# ─── Flow ──────────────────────────────────────────────────────────────────────


@flow(name="flood-segmentation", log_prints=True)
async def flood_segmentation_flow() -> dict:
    """
    End-to-end flood segmentation flow:
      list unprocessed S-1 scenes → load VV/VH from MinIO
      → run Sen1Floods11 inference → store polygons in PostGIS.

    Designed to run every 6h; at most MAX_SCENES_PER_RUN per execution
    to bound memory use.
    """
    scene_ids = await list_unprocessed_scenes()
    if not scene_ids:
        logger.info("No unprocessed scenes: nothing to do")
        return {"processed": 0, "total_polygons": 0}

    total_polygons = 0
    processed = 0

    for scene_id in scene_ids:
        try:
            scene_data = load_scene_from_minio(scene_id)
            polygons = run_flood_inference(scene_data)
            count = await store_flood_polygons(
                scene_id=scene_id,
                polygons=polygons,
                acquired_at=scene_data["acquired_at"],
            )
            total_polygons += count
            processed += 1
        except Exception as exc:
            logger.error("Scene %s failed: %s, continuing", scene_id, exc)
            continue

    logger.info(
        "Flood segmentation done: %d/%d scenes, %d polygon rows",
        processed, len(scene_ids), total_polygons,
    )
    return {"processed": processed, "total_polygons": total_polygons}
