"""NASA IMERG Early Run V07B ingest + watershed accumulation rollups.

Flow:
  fetch_imerg_granules  →  clip_to_lima  →  compute_watershed_accumulations
                                         →  upsert_accumulations (TimescaleDB)

Data access:
  - Primary: NASA GES DISC OPeNDAP with EarthData auth
  - URL pattern:
    https://gpm.nasa.gov/data/imerg/late/<YYYY>/<MM>/<DD>/
    3B-HHR-L.MS.MRG.3IMERG.<YYYYMMDD>-S<HHMMSS>-E<HHMMSS>.<MMMM>.V07B.HDF5

IMERG granule = 30-minute, global, 0.1° resolution.
Accumulations computed: 1h, 3h, 6h, 12h, 24h, 72h per Lima watershed polygon.
"""
import io
import logging
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import NamedTuple

import httpx
import numpy as np
import asyncpg
from prefect import flow, task
from prefect.tasks import task_input_hash
from shapely.geometry import shape

log = logging.getLogger(__name__)

# NASA GES DISC
EARTHDATA_USERNAME = os.getenv("EARTHDATA_USERNAME", "")
EARTHDATA_PASSWORD = os.getenv("EARTHDATA_PASSWORD", "")
IMERG_BASE_URL = "https://gpm.nasa.gov/data/imerg/late"

# Resolution
IMERG_RES = 0.1  # degrees
LIMA_BBOX = (-77.2, -12.5, -76.7, -11.7)  # west, south, east, north

# DB
DB_DSN = (
    f"postgresql://{os.getenv('POSTGRES_USER','costa')}:"
    f"{os.getenv('POSTGRES_PASSWORD','change_me_in_production')}"
    f"@{os.getenv('POSTGRES_HOST','localhost')}:5432/"
    f"{os.getenv('POSTGRES_DB','costa_resiliente')}"
)

ACCUMULATION_HOURS = [1, 3, 6, 12, 24, 72]


class GranuleResult(NamedTuple):
    time: datetime
    data: np.ndarray       # 2D float32 precipitation mm/hr
    lat_min: float
    lat_max: float
    lon_min: float
    lon_max: float


# ─── Task: fetch granule from NASA GES DISC ────────────────────────────────────
@task(
    retries=5,
    retry_delay_seconds=300,
    cache_key_fn=task_input_hash,
    cache_expiration=timedelta(hours=6),
    log_prints=True,
)
def fetch_imerg_granule(granule_time: datetime) -> GranuleResult | None:
    """
    Fetch a single IMERG half-hourly HDF5 granule via NASA GES DISC.
    Returns clipped precipitation array for Lima AOI, or None on failure.
    """
    try:
        import h5py
    except ImportError:
        log.error("h5py not installed — add h5py to pyproject.toml dependencies")
        return None

    if not EARTHDATA_USERNAME or not EARTHDATA_PASSWORD:
        log.warning("EARTHDATA credentials not set — cannot fetch IMERG")
        return None

    # Build URL: half-hourly granule starting at granule_time
    t = granule_time
    minute = (t.minute // 30) * 30
    start_hms = f"{t.hour:02d}{minute:02d}00"
    end_minute = minute + 29
    end_sec = 59
    end_hms = f"{t.hour:02d}{end_minute:02d}{end_sec:02d}"
    mmmm = str(t.hour * 60 + minute).zfill(4)
    date_str = t.strftime("%Y%m%d")

    filename = (
        f"3B-HHR-L.MS.MRG.3IMERG.{date_str}"
        f"-S{start_hms}-E{end_hms}.{mmmm}.V07B.HDF5"
    )
    url = f"{IMERG_BASE_URL}/{t.year}/{t.month:02d}/{t.day:02d}/{filename}"

    log.info("Fetching IMERG granule: %s", filename)
    try:
        with httpx.Client(
            auth=(EARTHDATA_USERNAME, EARTHDATA_PASSWORD),
            follow_redirects=True,
            timeout=120,
        ) as client:
            resp = client.get(url)
            resp.raise_for_status()
            raw = resp.content
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            log.info("Granule %s not yet available (404)", filename)
        else:
            log.warning("HTTP error fetching %s: %s", filename, exc)
        return None

    # Parse HDF5 in memory
    try:
        with h5py.File(io.BytesIO(raw), "r") as hf:
            precip = hf["/Grid/precipitationCal"][0].T  # shape: (lon, lat) → T → (lat, lon)
            # IMERG grid: lat -89.95 to 89.95 step 0.1, lon -179.95 to 179.95 step 0.1
            lats = np.arange(-89.95, 90.0, 0.1)
            lons = np.arange(-179.95, 180.0, 0.1)

            # Clip to Lima AOI
            lat_mask = (lats >= LIMA_BBOX[1]) & (lats <= LIMA_BBOX[3])
            lon_mask = (lons >= LIMA_BBOX[0]) & (lons <= LIMA_BBOX[2])

            clipped = precip[np.ix_(lat_mask, lon_mask)]
            clipped = np.where(clipped < 0, 0.0, clipped)  # -9999 → 0

            return GranuleResult(
                time=granule_time,
                data=clipped,
                lat_min=float(lats[lat_mask].min()),
                lat_max=float(lats[lat_mask].max()),
                lon_min=float(lons[lon_mask].min()),
                lon_max=float(lons[lon_mask].max()),
            )
    except Exception as exc:
        log.warning("Failed to parse IMERG HDF5 for %s: %s", filename, exc)
        return None


# ─── Task: compute zonal mean per watershed ────────────────────────────────────
@task(log_prints=True)
def compute_watershed_accumulations(
    granule_stack: list[GranuleResult],
    watersheds: list[dict],
    reference_time: datetime,
) -> list[dict]:
    """
    For each watershed, compute area-weighted mean rainfall accumulations
    over [1h, 3h, 6h, 12h, 24h, 72h] windows ending at reference_time.

    granule_stack: list of valid GranuleResult (half-hourly, sorted ascending)
    watersheds: list of {id, geom_wkt} dicts from PostGIS
    Returns list of accumulation record dicts for upsert.
    """
    if not granule_stack or not watersheds:
        return []

    try:
        from rasterio.transform import from_bounds
        from rasterio.features import rasterize
        from shapely import wkt as shapely_wkt
    except ImportError:
        log.error("rasterio/shapely not available for zonal stats")
        return []

    # Determine grid shape from first granule
    ref = granule_stack[-1]
    rows, cols = ref.data.shape
    transform = from_bounds(
        ref.lon_min - IMERG_RES / 2, ref.lat_min - IMERG_RES / 2,
        ref.lon_max + IMERG_RES / 2, ref.lat_max + IMERG_RES / 2,
        cols, rows,
    )

    # Build raster stack (n_granules × rows × cols), mm/hr → mm per 30min
    stack = np.array([g.data for g in granule_stack]) * 0.5  # half-hourly mm

    results = []
    for ws in watersheds:
        geom = shapely_wkt.loads(ws["geom_wkt"])
        mask = rasterize(
            [(geom, 1)],
            out_shape=(rows, cols),
            transform=transform,
            fill=0,
            dtype=np.uint8,
        ).astype(bool)

        if not mask.any():
            log.warning("Watershed %d has no IMERG pixels — skipping", ws["id"])
            continue

        # Accumulations: sum last N granules
        granules_per_hour = 2
        acc = {}
        for h in ACCUMULATION_HOURS:
            n = h * granules_per_hour
            subset = stack[-n:] if len(stack) >= n else stack
            acc[h] = float(np.nansum(subset[:, mask]))  # mm over watershed

        results.append({
            "time": reference_time,
            "watershed_id": ws["id"],
            "acc_1h_mm":  acc.get(1),
            "acc_3h_mm":  acc.get(3),
            "acc_6h_mm":  acc.get(6),
            "acc_12h_mm": acc.get(12),
            "acc_24h_mm": acc.get(24),
            "acc_72h_mm": acc.get(72),
        })

    log.info("Computed accumulations for %d watersheds", len(results))
    return results


# ─── Task: upsert into TimescaleDB ────────────────────────────────────────────
@task(retries=3, retry_delay_seconds=15, log_prints=True)
def upsert_accumulations(records: list[dict]) -> int:
    """Insert accumulation records into hydro.imerg_accumulations hypertable."""
    if not records:
        return 0

    import asyncio

    async def _upsert():
        conn = await asyncpg.connect(dsn=DB_DSN)
        try:
            await conn.executemany(
                """
                INSERT INTO hydro.imerg_accumulations
                    (time, watershed_id, acc_1h_mm, acc_3h_mm, acc_6h_mm,
                     acc_12h_mm, acc_24h_mm, acc_72h_mm)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (time, watershed_id) DO UPDATE
                  SET acc_1h_mm  = EXCLUDED.acc_1h_mm,
                      acc_3h_mm  = EXCLUDED.acc_3h_mm,
                      acc_6h_mm  = EXCLUDED.acc_6h_mm,
                      acc_12h_mm = EXCLUDED.acc_12h_mm,
                      acc_24h_mm = EXCLUDED.acc_24h_mm,
                      acc_72h_mm = EXCLUDED.acc_72h_mm
                """,
                [
                    (
                        r["time"], r["watershed_id"],
                        r["acc_1h_mm"], r["acc_3h_mm"], r["acc_6h_mm"],
                        r["acc_12h_mm"], r["acc_24h_mm"], r["acc_72h_mm"],
                    )
                    for r in records
                ],
            )
        finally:
            await conn.close()

    asyncio.run(_upsert())
    log.info("Upserted %d IMERG accumulation records", len(records))
    return len(records)


# ─── Task: load watersheds from DB ────────────────────────────────────────────
@task(log_prints=True)
def load_watersheds_from_db() -> list[dict]:
    """Fetch watershed IDs + WKT geometries from PostGIS for zonal stats."""
    import asyncio

    async def _fetch():
        conn = await asyncpg.connect(dsn=DB_DSN)
        try:
            rows = await conn.fetch(
                "SELECT id, ST_AsText(geom) AS geom_wkt FROM geo.watersheds"
            )
            return [{"id": r["id"], "geom_wkt": r["geom_wkt"]} for r in rows]
        finally:
            await conn.close()

    watersheds = asyncio.run(_fetch())
    log.info("Loaded %d watersheds from DB", len(watersheds))
    return watersheds


# ─── Flow ──────────────────────────────────────────────────────────────────────
@flow(name="ingest-imerg", log_prints=True)
def ingest_imerg_flow(lookback_hours: int = 25) -> dict:
    """
    Fetch IMERG granules for lookback window and compute watershed accumulations.
    lookback_hours=25 ensures 72h accumulations always have enough history
    when combined with previously stored data. Flow is idempotent (ON CONFLICT).
    """
    end_dt = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(hours=lookback_hours)

    # Generate half-hourly timestamps
    timestamps = []
    current = start_dt.replace(
        minute=(start_dt.minute // 30) * 30, second=0, microsecond=0
    )
    while current <= end_dt:
        timestamps.append(current)
        current += timedelta(minutes=30)

    log.info("Fetching %d IMERG granules from %s to %s", len(timestamps), start_dt, end_dt)

    granules = [fetch_imerg_granule(t) for t in timestamps]
    valid = [g for g in granules if g is not None]
    log.info("%d/%d granules fetched successfully", len(valid), len(timestamps))

    if not valid:
        log.warning("No IMERG granules fetched — check EarthData credentials")
        return {"granules_fetched": 0, "records_upserted": 0}

    valid_sorted = sorted(valid, key=lambda g: g.time)
    watersheds = load_watersheds_from_db()

    if not watersheds:
        log.warning("No watersheds in DB — run scripts/load_lima_geodata.py first")
        return {"granules_fetched": len(valid), "records_upserted": 0}

    records = compute_watershed_accumulations(valid_sorted, watersheds, end_dt)
    upserted = upsert_accumulations(records)

    return {"granules_fetched": len(valid), "records_upserted": upserted}
