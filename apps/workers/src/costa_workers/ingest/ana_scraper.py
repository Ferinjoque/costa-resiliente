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
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any

import httpx
from prefect import flow, task

logger = logging.getLogger(__name__)

# ─── Redis stale-reading cache ────────────────────────────────────────────────
# Keyed as `costa:hydro:{station_code}:latest`.  TTL 24h.
# When ANA/SENAMHI endpoint is down, the last known good reading is served
# instead of returning nothing: critical during flood events when gauge sites
# are overloaded.

def _redis_url() -> str:
    return os.getenv("REDIS_URL", "redis://redis:6379/0")


async def _cache_station_reading(code: str, obs: dict) -> None:
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(_redis_url(), decode_responses=True, socket_timeout=2)
        try:
            await r.setex(
                f"costa:hydro:{code}:latest",
                86400,  # 24h TTL
                json.dumps(obs, default=str),
            )
        finally:
            await r.aclose()
    except Exception as exc:
        logger.debug("Redis cache write skipped for %s: %s", code, exc)


async def _get_cached_reading(code: str) -> dict | None:
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(_redis_url(), decode_responses=True, socket_timeout=2)
        try:
            raw = await r.get(f"costa:hydro:{code}:latest")
        finally:
            await r.aclose()
        if raw:
            data = json.loads(raw)
            data["from_cache"] = True
            return data
    except Exception as exc:
        logger.debug("Redis cache read skipped for %s: %s", code, exc)
    return None


async def _publish_scraper_status(source: str, ok: bool, stations_ok: int, total: int) -> None:
    """Publish scraper health to Redis pub/sub for OperationalHUD FEEDS chip."""
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(_redis_url(), decode_responses=True, socket_timeout=2)
        try:
            payload = json.dumps({
                "source": source,
                "ok": ok,
                "stations_ok": stations_ok,
                "total": total,
                "ts": datetime.now(timezone.utc).isoformat(),
            })
            await r.set(f"costa:scraper:status:{source}", payload, ex=3600)
        finally:
            await r.aclose()
    except Exception as exc:
        logger.debug("Scraper status publish skipped: %s", exc)


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
# lat/lng added for Open-Meteo fallback when ANA/SENAMHI endpoints are unavailable
ANA_STATIONS: list[dict] = [
    # Rímac
    {"code": "100120", "name": "Chosica",         "river": "Rimac",   "source": "ana",     "lat": -11.93, "lng": -76.70},
    {"code": "100130", "name": "La Atarjea",       "river": "Rimac",   "source": "ana",     "lat": -12.03, "lng": -76.96},
    {"code": "100110", "name": "Sheque",            "river": "Rimac",   "source": "ana",     "lat": -11.90, "lng": -76.57},
    {"code": "100100", "name": "Obrajillo",         "river": "Rimac",   "source": "ana",     "lat": -11.68, "lng": -76.82},
    # Chillón
    {"code": "107130", "name": "Huamantanga",      "river": "Chillon", "source": "ana",     "lat": -11.52, "lng": -76.76},
    {"code": "107120", "name": "Lajas",            "river": "Chillon", "source": "ana",     "lat": -11.56, "lng": -76.73},
    # Lurín
    {"code": "119100", "name": "Santiago de Tuna", "river": "Lurin",   "source": "ana",     "lat": -12.05, "lng": -76.72},
    {"code": "119110", "name": "Manchay Bajo",      "river": "Lurin",   "source": "ana",     "lat": -12.10, "lng": -76.81},
]

# SENAMHI stations (meteorological, rainfall-focused)
SENAMHI_STATIONS: list[dict] = [
    {"code": "47288", "name": "Von Humboldt",      "river": None,      "source": "senamhi", "lat": -12.08, "lng": -77.00},
    {"code": "47284", "name": "Chosica - SENAMHI", "river": "Rimac",   "source": "senamhi", "lat": -11.93, "lng": -76.70},
    {"code": "47271", "name": "Manchay",           "river": "Lurin",   "source": "senamhi", "lat": -12.10, "lng": -76.84},
    {"code": "47249", "name": "Canta",             "river": "Chillon", "source": "senamhi", "lat": -11.47, "lng": -76.63},
]

ANA_BASE = "https://snirh.ana.gob.pe/Snirh"
SENAMHI_BASE = "https://www.senamhi.gob.pe"
OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast"
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
    Falls back to Redis-cached last known good reading when endpoint is unreachable.
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
            logger.warning("ANA fetch failed for %s: %s, trying Redis cache", station["code"], exc)
            cached = await _get_cached_reading(station["code"])
            if cached:
                logger.info("ANA %s: serving stale cached reading (cached_at=%s)", station["code"], cached.get("observed_at"))
            return [cached] if cached else []

    await asyncio.sleep(RATE_LIMIT_S)
    observations = _parse_ana_table(resp.text, station["code"])
    if observations:
        # Cache the most recent observation for stale fallback
        await _cache_station_reading(station["code"], observations[0])
    logger.info(
        "ANA station %s (%s): %d observations",
        station["name"], station["code"], len(observations),
    )
    return observations


@task(retries=3, retry_delay_seconds=120, log_prints=True)
async def fetch_senamhi_station(station: dict) -> list[dict]:
    """
    Fetch latest 24h observations for one SENAMHI station.
    Falls back to Redis-cached last known good reading when endpoint is unreachable.
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
            logger.warning("SENAMHI fetch failed for %s: %s, trying Redis cache", station["code"], exc)
            cached = await _get_cached_reading(station["code"])
            if cached:
                logger.info("SENAMHI %s: serving stale cached reading", station["code"])
            return [cached] if cached else []

    await asyncio.sleep(RATE_LIMIT_S)
    observations = _parse_senamhi_csv(resp.text, station["code"])
    if observations:
        await _cache_station_reading(station["code"], observations[0])
    logger.info(
        "SENAMHI station %s (%s): %d observations",
        station["name"], station["code"], len(observations),
    )
    return observations


@task(retries=3, retry_delay_seconds=30, log_prints=True)
async def fetch_openmeteo_station(station: dict) -> list[dict]:
    """
    Fallback: fetch current-hour precipitation for a station from Open-Meteo (no auth required).
    Returns one observation timestamped to the current hour so each run writes a fresh row.
    Used when ANA/SENAMHI endpoints are unreachable.
    """
    lat = station.get("lat")
    lng = station.get("lng")
    if lat is None or lng is None:
        return []

    params = {
        "latitude": lat,
        "longitude": lng,
        "hourly": "precipitation",
        "past_days": 1,
        "forecast_days": 0,
        "timezone": "UTC",
    }
    async with _make_client() as client:
        try:
            resp = await client.get(OPEN_METEO_BASE, params=params)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning("Open-Meteo fetch failed for %s: %s", station["code"], exc)
            return []

    hourly = data.get("hourly", {})
    times = hourly.get("time", [])
    precip = hourly.get("precipitation", [])

    # Use the current-hour timestamp so each scraper run inserts a fresh row.
    # On conflict, update rain_mm so the value reflects the latest Open-Meteo
    # nowcast (which refines as the hour progresses).
    now_hour = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    latest_rain: float | None = None

    for ts, rain in zip(reversed(times), reversed(precip)):
        if rain is None:
            continue
        try:
            obs_at = datetime.fromisoformat(ts).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if obs_at <= now_hour:
            latest_rain = float(rain)
            break

    if latest_rain is None:
        logger.info("Open-Meteo station %s (%s): no recent precipitation data", station["name"], station["code"])
        return []

    observation = {
        "station_code": station["code"],
        "observed_at": now_hour,
        "level_m": None,
        "flow_m3s": None,
        "rain_mm": latest_rain,
        "_openmeteo": True,  # flag for DO UPDATE in upsert
    }
    logger.info(
        "Open-Meteo station %s (%s): %.1f mm at %s",
        station["name"], station["code"], latest_rain, now_hour.isoformat(),
    )
    return [observation]


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
        # Ensure station rows exist (idempotent), updating geom if coordinates present
        for code, meta in stations_meta.items():
            if meta.get("lat") is not None and meta.get("lng") is not None:
                await pool.execute(
                    """
                    INSERT INTO hydro.stations
                        (code, name, source, river, active, geom)
                    VALUES ($1, $2, $3, $4, TRUE, ST_SetSRID(ST_MakePoint($5, $6), 4326))
                    ON CONFLICT (code) DO UPDATE SET
                        name = EXCLUDED.name,
                        active = TRUE,
                        geom = EXCLUDED.geom
                    """,
                    code, meta["name"], meta["source"], meta.get("river"),
                    meta["lng"], meta["lat"],
                )
            else:
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
                logger.warning("upsert_observations: unknown station_code %r, skipping observation", obs.get("station_code"))
                continue
            # Get station DB id
            station_id = await pool.fetchval(
                "SELECT id FROM hydro.stations WHERE code = $1",
                obs["station_code"],
            )
            if not station_id:
                continue
            # Open-Meteo observations use DO UPDATE so each hourly run refreshes
            # the current-hour row; ANA/SENAMHI use DO NOTHING (authoritative gauge data).
            if obs.get("_openmeteo"):
                await pool.execute(
                    """
                    INSERT INTO hydro.station_observations
                        (station_id, time, level_m, flow_m3s, rain_mm)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (station_id, time) DO UPDATE
                        SET rain_mm = EXCLUDED.rain_mm
                    """,
                    station_id,
                    obs["observed_at"],
                    obs.get("level_m"),
                    obs.get("flow_m3s"),
                    obs.get("rain_mm"),
                )
            else:
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
    import asyncpg  # noqa: F401, ensure import inside async context
    rows = await pool.fetch(
        """
        SELECT s.code
        FROM hydro.stations s
        LEFT JOIN hydro.station_observations so
               ON so.station_id = s.id
              AND so.time > NOW() - INTERVAL '1 hour' * $1
        WHERE s.active = TRUE
        GROUP BY s.code
        HAVING COUNT(so.station_id) = 0
        """,
        threshold_hours,
    )
    return [r["code"] for r in rows]


@flow(name="ingest-hydro-stations", log_prints=True)
async def ingest_hydro_stations_flow() -> dict:
    """
    Fetch hydro observations from ANA SNIRH and SENAMHI.
    Per-station fallback chain: primary scrape → Redis stale cache → Open-Meteo (rain only).
    Publishes scraper health status to Redis for OperationalHUD FEEDS chip.
    Schedule: every 15 minutes.
    """
    import asyncpg

    all_stations = ANA_STATIONS + SENAMHI_STATIONS
    stations_meta = {s["code"]: s for s in all_stations}

    all_observations: list[dict] = []
    ana_ok_count = 0
    senamhi_ok_count = 0

    # ANA stations (primary)
    for station in ANA_STATIONS:
        obs = await fetch_ana_station(station)
        all_observations.extend(obs)
        if obs and not obs[0].get("from_cache"):
            ana_ok_count += 1

    # SENAMHI stations (primary)
    for station in SENAMHI_STATIONS:
        obs = await fetch_senamhi_station(station)
        all_observations.extend(obs)
        if obs and not obs[0].get("from_cache"):
            senamhi_ok_count += 1

    # Open-Meteo fallback: only for stations that returned nothing at all
    # (neither fresh nor cached).  Gives rain_mm even when gauges are down.
    stations_with_data = {o["station_code"] for o in all_observations}
    fallback_stations = [s for s in all_stations if s["code"] not in stations_with_data]
    if fallback_stations:
        logger.warning(
            "%d station(s) have no data from primary or cache. Open-Meteo fallback: %s",
            len(fallback_stations),
            ", ".join(s["name"] for s in fallback_stations),
        )
        for station in fallback_stations:
            obs = await fetch_openmeteo_station(station)
            all_observations.extend(obs)

    # Publish scraper health for FEEDS chip
    await _publish_scraper_status("ana", ana_ok_count > 0, ana_ok_count, len(ANA_STATIONS))
    await _publish_scraper_status("senamhi", senamhi_ok_count > 0, senamhi_ok_count, len(SENAMHI_STATIONS))

    total = await upsert_observations(all_observations, stations_meta)
    logger.info("Hydro ingest complete: %d observations stored", total)

    stale: list[str] = []
    try:
        async with asyncpg.create_pool(DB_DSN, min_size=1, max_size=2) as pool:
            stale = await _check_stale_stations(pool, threshold_hours=2)
        if stale:
            logger.warning(
                "SCRAPER ALERT, %d station(s) have received no data for >2h: %s",
                len(stale),
                ", ".join(stale),
            )
    except Exception as exc:
        logger.warning("Stale-station check failed (non-fatal): %s", exc)

    # Heartbeat for health endpoint liveness: distinct from scraper status (which
    # measures live-station count); this marks the flow as running on schedule.
    try:
        import redis.asyncio as aioredis
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        r = aioredis.from_url(redis_url, decode_responses=True, socket_timeout=2)
        try:
            await r.set(
                "costa:scraper:last_run:stations",
                datetime.now(timezone.utc).isoformat(),
                ex=7200,  # 2h, covers actual observed 30-60min schedule intervals
            )
        finally:
            await r.aclose()
    except Exception as exc:
        logger.debug("ana_scraper: heartbeat write failed (non-critical): %s", exc)

    return {
        "observations_stored": total,
        "stations_polled": len(all_stations),
        "ana_live": ana_ok_count,
        "senamhi_live": senamhi_ok_count,
        "fallback_count": len(fallback_stations),
        "stale_stations": stale,
    }
