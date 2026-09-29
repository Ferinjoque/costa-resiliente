"""Inputs for the mass-movement model: the rain-cell grid, rainfall and labels.

Rainfall is sampled on a 0.5-degree grid. At 0.25 degrees the 178 Lima and
Callao districts need 54 distinct cells, and 18 rainy seasons of ERA5 for 54
points exceeds Open-Meteo's free daily quota; at 0.5 degrees they need 21. The
spatial detail the coarse grid gives up is carried by the static features
(CENEPRED susceptibility, district history), not by the rain.

Sources:
  - ERA5 via the Open-Meteo archive API (training and replay), keyless.
  - Open-Meteo forecast API with past_days (live inference), keyless.
  - SINPAD / INDECI emergency inventory 2003-2020 (labels).
"""
from __future__ import annotations

import logging
import math
import asyncio
from datetime import date, timedelta

import asyncpg
import httpx

log = logging.getLogger(__name__)

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
CELL_DEG = 0.5
ANTECEDENT_DAYS = 30

# SINPAD emergency types that are mass movements.
MASS_MOVEMENT_TYPES = ("HUAYCO", "DESLIZAMIENTO", "DERRUMBE DE CERRO", "ALUD")

# Rainy season the model covers (Dec-Apr): 92% of the dated Lima events.
SEASON_MONTHS = (12, 1, 2, 3, 4)


def cell_of(lon: float, lat: float) -> tuple[str, float, float]:
    """(cell_id, centre_lon, centre_lat) of the 0.5-degree cell containing a point."""
    clon = math.floor(lon / CELL_DEG) * CELL_DEG + CELL_DEG / 2
    clat = math.floor(lat / CELL_DEG) * CELL_DEG + CELL_DEG / 2
    return f"{clon:.2f}_{clat:.2f}", clon, clat


async def load_districts(conn: asyncpg.Connection) -> list[dict]:
    """In-scope districts with their rain cell and static features."""
    rows = await conn.fetch("""
        SELECT d.ubigeo, d.name,
               ST_X(ST_PointOnSurface(d.geom)) AS lon,
               ST_Y(ST_PointOnSurface(d.geom)) AS lat,
               ST_Area(d.geom::geography) / 1e6 AS area_km2,
               r.susceptibility
        FROM geo.districts d
        JOIN geo.cenepred_risk r ON r.ubigeo = d.ubigeo AND r.hazard = 'mass_movement'
        ORDER BY d.ubigeo
    """)
    out = []
    for r in rows:
        cid, clon, clat = cell_of(r["lon"], r["lat"])
        out.append({**dict(r), "cell_id": cid, "cell_lon": clon, "cell_lat": clat})
    return out


async def load_events(conn: asyncpg.Connection) -> set[tuple[str, date]]:
    """(ubigeo, date) of every dated mass-movement event."""
    rows = await conn.fetch(
        """
        SELECT DISTINCT ubigeo, event_date FROM historical.sinpad_events
        WHERE event_type = ANY($1::text[]) AND event_date IS NOT NULL AND ubigeo IS NOT NULL
        """,
        list(MASS_MOVEMENT_TYPES),
    )
    return {(r["ubigeo"], r["event_date"]) for r in rows}


def _cells(districts: list[dict]) -> list[tuple[str, float, float]]:
    seen: dict[str, tuple[str, float, float]] = {}
    for d in districts:
        seen.setdefault(d["cell_id"], (d["cell_id"], d["cell_lon"], d["cell_lat"]))
    return list(seen.values())


async def _store(conn: asyncpg.Connection, cells, payload, source: str) -> int:
    if isinstance(payload, dict):
        payload = [payload]
    rows = []
    for (cid, lon, lat), series in zip(cells, payload):
        daily = series.get("daily", {})
        for d, p in zip(daily.get("time", []), daily.get("precipitation_sum", [])):
            rows.append((cid, lon, lat, date.fromisoformat(d), p, source))
    await conn.executemany(
        """
        INSERT INTO hydro.rain_cells_daily (cell_id, lon, lat, day, precip_mm, source)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (cell_id, day, source) DO UPDATE SET precip_mm = EXCLUDED.precip_mm
        """,
        rows,
    )
    return len(rows)


async def fetch_era5_seasons(conn: asyncpg.Connection, districts: list[dict],
                             first_year: int, last_year: int, pause_s: float = 2.0) -> int:
    """Fetch ERA5 daily rain for every rainy season, skipping seasons already cached.

    One request per season, all cells at once: Nov 1 (for the 30-day antecedent
    window) to Apr 30.
    """
    cells = _cells(districts)
    total = 0
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=15.0)) as client:
        for year in range(first_year, last_year + 1):
            start, end = date(year - 1, 11, 1), date(year, 4, 30)
            have = await conn.fetchval(
                "SELECT COUNT(*) FROM hydro.rain_cells_daily WHERE source='era5' AND day BETWEEN $1 AND $2",
                start, end,
            )
            if have >= len(cells) * (end - start).days:
                continue
            params = {
                "latitude": ",".join(f"{c[2]:.2f}" for c in cells),
                "longitude": ",".join(f"{c[1]:.2f}" for c in cells),
                "start_date": start.isoformat(), "end_date": end.isoformat(),
                "daily": "precipitation_sum", "timezone": "America/Lima", "models": "era5",
            }
            for attempt in range(4):
                resp = await client.get(ARCHIVE_URL, params=params)
                if resp.status_code != 429:
                    break
                log.warning("era5 %s: rate limited, backing off", year)
                await asyncio.sleep(60 * (attempt + 1))
            resp.raise_for_status()
            n = await _store(conn, cells, resp.json(), "era5")
            total += n
            log.info("era5 season %d: %d cell-days", year, n)
            await asyncio.sleep(pause_s)
    return total


async def fetch_era5_window(conn: asyncpg.Connection, districts: list[dict], day: date) -> int:
    """ERA5 for the antecedent window of one replay date (used outside cached seasons)."""
    cells = _cells(districts)
    start = day - timedelta(days=ANTECEDENT_DAYS)
    params = {
        "latitude": ",".join(f"{c[2]:.2f}" for c in cells),
        "longitude": ",".join(f"{c[1]:.2f}" for c in cells),
        "start_date": start.isoformat(), "end_date": day.isoformat(),
        "daily": "precipitation_sum", "timezone": "America/Lima", "models": "era5",
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=15.0)) as client:
        resp = await client.get(ARCHIVE_URL, params=params)
        resp.raise_for_status()
    return await _store(conn, cells, resp.json(), "era5")


async def fetch_live(conn: asyncpg.Connection, districts: list[dict]) -> int:
    """Recent past (31 days) plus 2-day forecast from the Open-Meteo forecast API."""
    cells = _cells(districts)
    params = {
        "latitude": ",".join(f"{c[2]:.2f}" for c in cells),
        "longitude": ",".join(f"{c[1]:.2f}" for c in cells),
        "daily": "precipitation_sum", "past_days": ANTECEDENT_DAYS + 1, "forecast_days": 2,
        "timezone": "America/Lima",
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=15.0)) as client:
        resp = await client.get(FORECAST_URL, params=params)
        resp.raise_for_status()
    return await _store(conn, cells, resp.json(), "open-meteo")


async def load_rain(conn: asyncpg.Connection, source: str, start: date, end: date) -> dict[tuple[str, date], float]:
    rows = await conn.fetch(
        "SELECT cell_id, day, precip_mm FROM hydro.rain_cells_daily "
        "WHERE source = $1 AND day BETWEEN $2 AND $3",
        source, start, end,
    )
    return {(r["cell_id"], r["day"]): (r["precip_mm"] or 0.0) for r in rows}
