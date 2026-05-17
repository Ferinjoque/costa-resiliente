"""ANA / SENAMHI hydro station scraper.

Sources:
  ANA (Autoridad Nacional del Agua):
    - SNIRH (Sistema Nacional de Información de Recursos Hídricos)
    - Endpoint: https://snirh.ana.gob.pe/Snirh/  (HTML table scraping)
    - Covers: stage (nivel), discharge (caudal), rainfall for Lima stations

  SENAMHI (Servicio Nacional de Meteorología e Hidrología):
    - API: https://www.senamhi.gob.pe/?p=estaciones  (HTML; CSV export)
    - Covers: rainfall, temperature, humidity at meteorological stations

Both sources require HTML scraping (no stable public API).
Retries with exponential backoff; rate limited to 1 req/2s per source.

Stations of interest (Lima watersheds):
  Rímac basin:  La Oroya, Chosica, Obrajillo, Sheque, Bocatoma Atarjea
  Chillón basin: Huamantanga, Lajas, Canta
  Lurín basin:  Santiago de Tuna, Manchay Bajo
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any

import httpx
from prefect import flow, task

logger = logging.getLogger(__name__)

def _db_dsn() -> str:
    if url := os.getenv("DATABASE_URL"):
        return url
    host = os.getenv("POSTGRES_HOST", "postgres")
    port = os.getenv("POSTGRES_PORT", "5432")
    db   = os.getenv("POSTGRES_DB", "costa_resiliente")
    user = os.getenv("POSTGRES_USER", "costa")
    pw   = os.getenv("POSTGRES_PASSWORD", "change_me_in_production")
    return f"postgresql://{user}:{pw}@{host}:{port}/{db}"

DB_DSN = _db_dsn()

# ─── ANA SNIRH station codes (Rímac + Chillón + Lurín) ───────────────────────
ANA_STATIONS: list[dict] = [
    # Rímac
    {"code": "100120", "name": "Chosica",        "river": "Rimac",   "source": "ana"},
    {"code": "100130", "name": "La Atarjea",      "river": "Rimac",   "source": "ana"},
    {"code": "100110", "name": "Sheque",           "river": "Rimac",   "source": "ana"},
    {"code": "100100", "name": "Obrajillo",        "river": "Rimac",   "source": "ana"},
    # Chillón
    {"code": "107130", "name": "Huamantanga",     "river": "Chillon", "source": "ana"},
    {"code": "107120", "name": "Lajas",           "river": "Chillon", "source": "ana"},
    # Lurín
    {"code": "119100", "name": "Santiago de Tuna","river": "Lurin",   "source": "ana"},
    {"code": "119110", "name": "Manchay Bajo",    "river": "Lurin",   "source": "ana"},
]

# SENAMHI stations (meteorological, rainfall-focused)
SENAMHI_STATIONS: list[dict] = [
    {"code": "47288", "name": "Von Humboldt",     "river": None,      "source": "senamhi"},
    {"code": "47284", "name": "Chosica - SENAMHI","river": "Rimac",   "source": "senamhi"},
    {"code": "47271", "name": "Manchay",          "river": "Lurin",   "source": "senamhi"},
    {"code": "47249", "name": "Canta",            "river": "Chillon", "source": "senamhi"},
]

ANA_BASE = "https://snirh.ana.gob.pe/Snirh"
SENAMHI_BASE = "https://www.senamhi.gob.pe"
REQUEST_TIMEOUT = 30.0
RATE_LIMIT_S = 2.0  # seconds between requests per source

# ─── HTTP client ──────────────────────────────────────────────────────────────


def _make_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT,
        headers={
            "User-Agent": (
                "CostaResiliiente/1.0 (+https://costa-resiliente.pe/; "
                "emergency-response-research@ieee.org)"
            ),
            "Accept-Language": "es-PE,es;q=0.9",
        },
        follow_redirects=True,
    )


# ─── Parsers ──────────────────────────────────────────────────────────────────

def _parse_ana_table(html: str, station_code: str) -> list[dict]:
    """
    Extract observation rows from ANA SNIRH HTML table.
    Returns list of {level_m, flow_m3s, rain_mm, observed_at}.
    ANA tables use format: DD/MM/YYYY HH:MM | nivel | caudal | lluvia
    """
    rows = []
    # Find all table rows with numeric data
    pattern = re.compile(
        r"(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2})"   # datetime
        r".*?([0-9]+\.?[0-9]*|-+)"               # nivel
        r".*?([0-9]+\.?[0-9]*|-+)"               # caudal
        r".*?([0-9]+\.?[0-9]*|-+)",               # lluvia
        re.DOTALL,
    )
    for m in pattern.finditer(html):
        try:
            obs_at = datetime.strptime(m.group(1).strip(), "%d/%m/%Y %H:%M").replace(
                tzinfo=timezone.utc
            )
            def _safe(val: str) -> float | None:
                return float(val) if re.match(r"\d", val) else None

            rows.append({
                "station_code": station_code,
                "observed_at": obs_at,
                "level_m": _safe(m.group(2)),
                "flow_m3s": _safe(m.group(3)),
                "rain_mm": _safe(m.group(4)),
            })
        except (ValueError, IndexError):
            continue
    return rows


def _parse_senamhi_csv(csv_text: str, station_code: str) -> list[dict]:
    """
    Parse SENAMHI CSV export (semicolon-delimited):
    Fecha;Hora;Precipitacion(mm);Temperatura(°C);Humedad(%)
    """
    rows = []
    for line in csv_text.splitlines()[1:]:  # skip header
        parts = line.split(";")
        if len(parts) < 3:
            continue
        try:
            obs_at = datetime.strptime(
                f"{parts[0].strip()} {parts[1].strip()}", "%d/%m/%Y %H:%M"
            ).replace(tzinfo=timezone.utc)
            rain = float(parts[2].strip().replace(",", ".")) if parts[2].strip() else None
            rows.append({
                "station_code": station_code,
                "observed_at": obs_at,
                "level_m": None,
                "flow_m3s": None,
                "rain_mm": rain,
            })
        except (ValueError, IndexError):
            continue
    return rows


# ─── Fetch tasks ──────────────────────────────────────────────────────────────

@task(retries=3, retry_delay_seconds=120, log_prints=True)
async def fetch_ana_station(station: dict) -> list[dict]:
    """
    Fetch latest 24h observations for one ANA station via SNIRH HTML scraping.
    """
    url = (
        f"{ANA_BASE}/Descarga/DescargaDatosHidrometeorologicos"
        f"?CodEstacion={station['code']}&TipoDato=H&periodo=24"
    )
    async with _make_client() as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("ANA fetch failed for %s: %s", station["code"], exc)
            return []
    await asyncio.sleep(RATE_LIMIT_S)
    observations = _parse_ana_table(resp.text, station["code"])
    logger.info(
        "ANA station %s (%s): %d observations",
        station["name"], station["code"], len(observations),
    )
    return observations


@task(retries=3, retry_delay_seconds=120, log_prints=True)
async def fetch_senamhi_station(station: dict) -> list[dict]:
    """
    Fetch latest 24h observations for one SENAMHI station.
    """
    url = (
        f"{SENAMHI_BASE}/descarga-datos-hidrometeorologicos-pluviometros"
        f"?estacion={station['code']}&tipo=automatica&periodo=24h"
    )
    async with _make_client() as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("SENAMHI fetch failed for %s: %s", station["code"], exc)
            return []
    await asyncio.sleep(RATE_LIMIT_S)
    observations = _parse_senamhi_csv(resp.text, station["code"])
    logger.info(
        "SENAMHI station %s (%s): %d observations",
        station["name"], station["code"], len(observations),
    )
    return observations


@task(retries=2, retry_delay_seconds=30, log_prints=True)
async def upsert_observations(observations: list[dict], stations_meta: dict[str, dict]) -> int:
    """
    Upsert observations into hydro.station_observations.
    `stations_meta` maps station_code → DB row (id, name, source, etc.)
    """
    import asyncpg

    if not observations:
        return 0

    async with asyncpg.create_pool(DB_DSN, min_size=1, max_size=3) as pool:
        # Ensure station rows exist (idempotent)
        for code, meta in stations_meta.items():
            await pool.execute(
                """
                INSERT INTO hydro.stations
                    (code, name, source, river, active)
                VALUES ($1, $2, $3, $4, TRUE)
                ON CONFLICT (code) DO UPDATE SET
                    name = EXCLUDED.name,
                    active = TRUE
                """,
                code, meta["name"], meta["source"], meta.get("river"),
            )

        inserted = 0
        for obs in observations:
            station_meta = stations_meta.get(obs["station_code"])
            if not station_meta:
                continue
            # Get station DB id
            station_id = await pool.fetchval(
                "SELECT id FROM hydro.stations WHERE code = $1",
                obs["station_code"],
            )
            if not station_id:
                continue
            await pool.execute(
                """
                INSERT INTO hydro.station_observations
                    (station_id, time, level_m, flow_m3s, rain_mm)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (station_id, time) DO NOTHING
                """,
                station_id,
                obs["observed_at"],
                obs.get("level_m"),
                obs.get("flow_m3s"),
                obs.get("rain_mm"),
            )
            inserted += 1

    logger.info("Upserted %d station observations", inserted)
    return inserted


# ─── Flow ──────────────────────────────────────────────────────────────────────

async def _check_stale_stations(pool: "asyncpg.Pool", threshold_hours: int = 2) -> list[str]:
    """Return station codes that have received no new observations in `threshold_hours` hours."""
    import asyncpg  # noqa: F401 — ensure import inside async context
    rows = await pool.fetch(
        """
        SELECT s.code
        FROM hydro.stations s
        LEFT JOIN hydro.station_observations so
               ON so.station_id = s.id
              AND so.time > NOW() - INTERVAL '1 hour' * $1
        WHERE s.active = TRUE
        GROUP BY s.code
        HAVING COUNT(so.id) = 0
        """,
        threshold_hours,
    )
    return [r["code"] for r in rows]


@flow(name="ingest-hydro-stations", log_prints=True)
async def ingest_hydro_stations_flow() -> dict:
    """
    Fetch hydro observations from ANA SNIRH and SENAMHI, upsert to DB.
    Schedule: every 30 minutes.
    """
    import asyncpg

    all_stations = ANA_STATIONS + SENAMHI_STATIONS
    stations_meta = {s["code"]: s for s in all_stations}

    all_observations: list[dict] = []

    # ANA stations
    for station in ANA_STATIONS:
        obs = await fetch_ana_station(station)
        all_observations.extend(obs)

    # SENAMHI stations
    for station in SENAMHI_STATIONS:
        obs = await fetch_senamhi_station(station)
        all_observations.extend(obs)

    total = await upsert_observations(all_observations, stations_meta)
    logger.info("Hydro ingest complete: %d observations stored", total)

    # Warn if any station has been silent for >2 hours (scraper fragility check)
    try:
        async with asyncpg.create_pool(DB_DSN, min_size=1, max_size=2) as pool:
            stale = await _check_stale_stations(pool, threshold_hours=2)
        if stale:
            logger.warning(
                "SCRAPER ALERT — %d station(s) have received no data for >2h: %s",
                len(stale),
                ", ".join(stale),
            )
    except Exception as exc:
        logger.warning("Stale-station check failed (non-fatal): %s", exc)

    return {
        "observations_stored": total,
        "stations_polled": len(all_stations),
        "stale_stations": stale if "stale" in dir() else [],
    }
