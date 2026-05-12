"""NASA IMERG Early Run ingest + watershed accumulation rollups.

Sprint 1 implementation target:
- Fetch half-hourly IMERG HDF5 tiles for Lima AOI via NASA GES DISC OPeNDAP
- Compute 1h/3h/6h/12h/24h/72h accumulations per watershed polygon
- Upsert into hydro.imerg_accumulations (TimescaleDB hypertable)
"""
import logging
from datetime import datetime, timezone, timedelta

import numpy as np
from prefect import flow, task
from prefect.tasks import task_input_hash

logger = logging.getLogger(__name__)

# NASA GES DISC OPeNDAP base URL for IMERG Early Run V07
IMERG_OPENDAP_BASE = (
    "https://gpm.nasa.gov/data/imerg/"
    "late/YYYY/MM/DD/3B-HHR-L.MS.MRG.3IMERG.YYYYMMDD-SHHMMSS-EHHMMSS.MMMM.V07B.HDF5"
)
LIMA_BBOX = [-77.2, -12.5, -76.7, -11.7]


@task(
    retries=5,
    retry_delay_seconds=300,  # NASA GES DISC can be slow
    cache_key_fn=task_input_hash,
    cache_expiration=timedelta(hours=4),
)
def fetch_imerg_granule(granule_time: datetime) -> bytes | None:
    """Fetch a single IMERG half-hourly HDF5 granule. Returns raw bytes."""
    # TODO Sprint 1: implement NASA EarthData auth + OPeNDAP fetch
    logger.info("TODO: fetch IMERG granule for %s", granule_time.isoformat())
    return None


@task
def clip_to_lima(granule_bytes: bytes) -> np.ndarray | None:
    """Clip IMERG raster to Lima AOI bounding box."""
    # TODO Sprint 1: rioxarray spatial clip
    return None


@task
def compute_watershed_accumulations(
    granules: list[np.ndarray],
    watershed_polygons: list[dict],
    accumulation_hours: list[int] = [1, 3, 6, 12, 24, 72],
) -> list[dict]:
    """Zonal mean rainfall per watershed for each accumulation window."""
    # TODO Sprint 1: rasterio zonal stats
    return []


@task
def upsert_accumulations(records: list[dict]) -> int:
    """Upsert accumulation records into hydro.imerg_accumulations."""
    # TODO Sprint 1: asyncpg upsert
    logger.info("TODO: upsert %d accumulation records", len(records))
    return len(records)


@flow(name="ingest-imerg", log_prints=True)
def ingest_imerg_flow(lookback_hours: int = 25):
    """Fetch IMERG granules and compute watershed accumulations."""
    end_dt = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(hours=lookback_hours)

    # Generate half-hourly timestamps
    timestamps = []
    current = start_dt.replace(minute=(start_dt.minute // 30) * 30, second=0, microsecond=0)
    while current <= end_dt:
        timestamps.append(current)
        current += timedelta(minutes=30)

    granules = [fetch_imerg_granule(t) for t in timestamps]
    valid_granules = [g for g in granules if g is not None]

    # TODO Sprint 1: load watershed geometries from PostGIS
    watersheds = []
    records = compute_watershed_accumulations(valid_granules, watersheds)
    upserted = upsert_accumulations(records)

    logger.info("IMERG ingest complete: %d granules, %d records", len(valid_granules), upserted)
    return {"granules_fetched": len(valid_granules), "records_upserted": upserted}
