"""NASA IMERG Early Run ingest: real, observed rainfall per basin.

Data access:
  NASA GES DISC archive with Earthdata Login. A user token (EARTHDATA_TOKEN,
  sent as a bearer header) is preferred; EARTHDATA_USERNAME / PASSWORD is the
  fallback. Early Run, half-hourly, 0.1 degrees, about 4-5 h behind real time:
    https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3/GPM_3IMERGHHE.07/<YYYY>/<DOY>/
    3B-HHR-E.MS.MRG.3IMERG.<YYYYMMDD>-S<HHMMSS>-E<HHMMSS>.<MMMM>.V07C.HDF5
  File names are taken from the day's directory listing rather than built, so a
  processing-version bump (V07B to V07C happened in 2026) does not break it.

Flow:
  1. List the granules available in the lookback window.
  2. Download only those not yet in hydro.imerg_granule_means (8 MB each),
     clip to the basins and store the basin-mean depth per granule.
  3. Sum the cached depths into 1-72 h accumulations ending at the newest
     granule, into hydro.imerg_observed.

Real observations never go into hydro.imerg_accumulations, which carries the
El Niño demo scenario: in the dry season they would become the "latest" rows
and erase the scenario, or blend with it.

History: until 2026-09-28 this pointed at gpm.nasa.gov (a web page) with a
month/day path, read the pre-V07 variable name, summed pixels instead of
averaging them, and on failure re-inserted the last scenario accumulation with
a fresh timestamp. No granule was ever read. A run that reads nothing now
writes nothing and leaves no heartbeat.
"""
import asyncio
import io
import logging
import os
import re
from datetime import datetime, timedelta, timezone

import asyncpg
import httpx
import numpy as np
from prefect import flow

log = logging.getLogger(__name__)

IMERG_BASE_URL = "https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3/GPM_3IMERGHHE.07"
EARTHDATA_TOKEN = os.getenv("EARTHDATA_TOKEN", "")
EARTHDATA_USERNAME = os.getenv("EARTHDATA_USERNAME", "")
EARTHDATA_PASSWORD = os.getenv("EARTHDATA_PASSWORD", "")

IMERG_RES = 0.1  # degrees
# west, south, east, north: covers the full Rímac, Chillón and Lurín basins
# (HydroBASINS), whose upper reaches run past -76.0.
LIMA_BBOX = (-77.4, -12.7, -75.8, -11.0)

DB_DSN = (
    f"postgresql://{os.getenv('POSTGRES_USER','costa')}:"
    f"{os.getenv('POSTGRES_PASSWORD','change_me_in_production')}"
    f"@{os.getenv('POSTGRES_HOST','localhost')}:5432/"
    f"{os.getenv('POSTGRES_DB','costa_resiliente')}"
)

ACCUMULATION_HOURS = [1, 3, 6, 12, 24, 72, 168]
OBSERVED_WINDOWS_H = [1, 3, 6, 12, 24, 72]

_LAT = np.arange(-89.95, 90.0, 0.1)
_LON = np.arange(-179.95, 180.0, 0.1)
_LAT_MASK = (_LAT >= LIMA_BBOX[1]) & (_LAT <= LIMA_BBOX[3])
_LON_MASK = (_LON >= LIMA_BBOX[0]) & (_LON <= LIMA_BBOX[2])


def granule_url(t: datetime, version: str = "V07C") -> tuple[str, str]:
    """(url, filename) of the half-hourly Early Run granule starting at t (UTC)."""
    minute = (t.minute // 30) * 30
    start = t.replace(minute=minute, second=0, microsecond=0)
    end = start + timedelta(minutes=29, seconds=59)
    mmmm = str(start.hour * 60 + start.minute).zfill(4)
    filename = (
        f"3B-HHR-E.MS.MRG.3IMERG.{start:%Y%m%d}"
        f"-S{start:%H%M%S}-E{end:%H%M%S}.{mmmm}.{version}.HDF5"
    )
    doy = start.timetuple().tm_yday
    return f"{IMERG_BASE_URL}/{start:%Y}/{doy:03d}/{filename}", filename


def _client() -> httpx.Client:
    if EARTHDATA_TOKEN:
        return httpx.Client(headers={"Authorization": f"Bearer {EARTHDATA_TOKEN}"},
                            follow_redirects=True, timeout=120)
    return httpx.Client(auth=(EARTHDATA_USERNAME, EARTHDATA_PASSWORD),
                        follow_redirects=True, timeout=120)


_NAME_RE = re.compile(r"3B-HHR-E\.MS\.MRG\.3IMERG\.(\d{8})-S(\d{6})-E\d{6}\.\d{4}\.V\w+\.HDF5(?!\.)")


def parse_listing(html: str) -> dict[datetime, str]:
    """{granule start (UTC): filename} from a GES DISC day-directory page."""
    out: dict[datetime, str] = {}
    for m in _NAME_RE.finditer(html):
        start = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
        out[start] = m.group(0)
    return out


def available_granules(client: httpx.Client, start: datetime, end: datetime) -> dict[datetime, str]:
    found: dict[datetime, str] = {}
    day = start.date()
    while day <= end.date():
        url = f"{IMERG_BASE_URL}/{day:%Y}/{day.timetuple().tm_yday:03d}/"
        resp = client.get(url)
        if resp.status_code == 401:
            raise PermissionError("Earthdata rejected the credentials (401)")
        if resp.status_code == 200:
            found.update({t: n for t, n in parse_listing(resp.text).items() if start <= t <= end})
        day += timedelta(days=1)
    return found


def basin_masks(watersheds: list[dict]) -> dict[int, np.ndarray]:
    """Boolean mask of each basin on the clipped IMERG grid (lat x lon)."""
    from rasterio.features import rasterize
    from rasterio.transform import from_bounds
    from shapely import wkt as shapely_wkt

    lats, lons = _LAT[_LAT_MASK], _LON[_LON_MASK]
    transform = from_bounds(lons.min() - IMERG_RES / 2, lats.min() - IMERG_RES / 2,
                            lons.max() + IMERG_RES / 2, lats.max() + IMERG_RES / 2,
                            len(lons), len(lats))
    masks = {}
    for ws in watersheds:
        # rasterize fills from the top row (north); the clipped grid runs south to
        # north, so flip it to line up with increasing latitude.
        m = rasterize([(shapely_wkt.loads(ws["geom_wkt"]), 1)], out_shape=(len(lats), len(lons)),
                      transform=transform, fill=0, dtype=np.uint8, all_touched=True).astype(bool)
        masks[ws["id"]] = m[::-1]
    return masks


def basin_depths(rate_lat_lon: np.ndarray, masks: dict[int, np.ndarray]) -> dict[int, float]:
    """Basin-mean rain depth (mm) of one half-hour granule, from its rate in mm/h."""
    depth = np.where(rate_lat_lon < 0, 0.0, rate_lat_lon) * 0.5
    return {wid: float(np.nanmean(depth[m])) for wid, m in masks.items() if m.any()}


def read_granule(client: httpx.Client, t: datetime, name: str) -> np.ndarray | None:
    import h5py

    url = f"{IMERG_BASE_URL}/{t:%Y}/{t.timetuple().tm_yday:03d}/{name}"
    resp = client.get(url)
    if resp.status_code != 200:
        log.warning("IMERG %s: HTTP %s", name, resp.status_code)
        return None
    with h5py.File(io.BytesIO(resp.content), "r") as hf:
        var = "/Grid/precipitation" if "/Grid/precipitation" in hf else "/Grid/precipitationCal"
        grid = hf[var][0].T  # (lon, lat) -> (lat, lon)
    return grid[np.ix_(_LAT_MASK, _LON_MASK)]


async def _db(fn):
    conn = await asyncpg.connect(dsn=DB_DSN)
    try:
        return await fn(conn)
    finally:
        await conn.close()


async def _roll_up(conn: asyncpg.Connection) -> int:
    """Accumulations ending at the newest cached granule, per basin."""
    windows = ",\n".join(
        f"SUM(depth_mm) FILTER (WHERE granule_start > e.last_start - INTERVAL '{h} hours') AS acc_{h}h"
        for h in OBSERVED_WINDOWS_H
    )
    rows = await conn.fetch(f"""
        WITH e AS (SELECT watershed_id, MAX(granule_start) AS last_start
                   FROM hydro.imerg_granule_means GROUP BY watershed_id)
        SELECT g.watershed_id, e.last_start,
               {windows},
               COUNT(*) FILTER (WHERE granule_start > e.last_start - INTERVAL '72 hours') AS n72,
               (SELECT granule FROM hydro.imerg_granule_means x
                 WHERE x.watershed_id = g.watershed_id ORDER BY granule_start DESC LIMIT 1) AS last_granule
        FROM hydro.imerg_granule_means g JOIN e USING (watershed_id)
        WHERE g.granule_start > e.last_start - INTERVAL '72 hours'
        GROUP BY g.watershed_id, e.last_start
    """)
    for r in rows:
        await conn.execute(
            """
            INSERT INTO hydro.imerg_observed
                (time, watershed_id, acc_1h_mm, acc_3h_mm, acc_6h_mm, acc_12h_mm,
                 acc_24h_mm, acc_72h_mm, granules_72h, last_granule)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT (time, watershed_id) DO UPDATE SET
                acc_1h_mm = EXCLUDED.acc_1h_mm, acc_3h_mm = EXCLUDED.acc_3h_mm,
                acc_6h_mm = EXCLUDED.acc_6h_mm, acc_12h_mm = EXCLUDED.acc_12h_mm,
                acc_24h_mm = EXCLUDED.acc_24h_mm, acc_72h_mm = EXCLUDED.acc_72h_mm,
                granules_72h = EXCLUDED.granules_72h, last_granule = EXCLUDED.last_granule,
                computed_at = NOW()
            """,
            r["last_start"] + timedelta(minutes=30), r["watershed_id"],
            r["acc_1h"], r["acc_3h"], r["acc_6h"], r["acc_12h"], r["acc_24h"], r["acc_72h"],
            r["n72"], r["last_granule"],
        )
    return len(rows)


@flow(name="ingest-imerg", log_prints=True)
def ingest_imerg_flow(lookback_hours: int = 72) -> dict:
    """Fetch missing IMERG Early granules for the lookback window and roll up."""
    if not (EARTHDATA_TOKEN or (EARTHDATA_USERNAME and EARTHDATA_PASSWORD)):
        log.warning("No Earthdata credentials: IMERG not ingested")
        return {"granules_fetched": 0}
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=lookback_hours)

    watersheds = asyncio.run(_db(lambda c: c.fetch(
        "SELECT id, ST_AsText(geom) AS geom_wkt FROM geo.watersheds")))
    masks = basin_masks([dict(w) for w in watersheds])
    have = {r["granule_start"] for r in asyncio.run(_db(lambda c: c.fetch(
        "SELECT DISTINCT granule_start FROM hydro.imerg_granule_means WHERE granule_start >= $1", start)))}

    with _client() as client:
        available = available_granules(client, start, end)
        missing = sorted(t for t in available if t not in have)
        log.info("IMERG: %d granules available, %d new", len(available), len(missing))
        fetched = 0
        for t in missing:
            grid = read_granule(client, t, available[t])
            if grid is None:
                continue
            rows = [(t, wid, d, available[t]) for wid, d in basin_depths(grid, masks).items()]
            asyncio.run(_db(lambda c: c.executemany(
                "INSERT INTO hydro.imerg_granule_means (granule_start, watershed_id, depth_mm, granule) "
                "VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", rows)))
            fetched += 1

    if not available:
        return {"granules_fetched": 0, "rolled_up": 0}
    rolled = asyncio.run(_db(_roll_up))
    _write_imerg_heartbeat()
    return {"granules_fetched": fetched, "granules_available": len(available), "rolled_up": rolled}


def _write_imerg_heartbeat() -> None:
    """IMERG last-run timestamp in Redis, read by the health endpoint."""
    try:
        import redis as _redis
        r = _redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"),
                            decode_responses=True, socket_timeout=2)
        try:
            r.set("costa:scraper:last_run:imerg", datetime.now(timezone.utc).isoformat(), ex=3600)
        finally:
            r.close()
    except Exception as exc:
        log.debug("imerg: heartbeat write failed (non-critical): %s", exc)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    import sys
    print(ingest_imerg_flow.fn(int(sys.argv[1]) if len(sys.argv) > 1 else 72))
