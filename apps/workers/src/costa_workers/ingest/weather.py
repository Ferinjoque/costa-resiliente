"""Current weather conditions for Lima Metropolitana via Open-Meteo.

The platform already carried precipitation (IMERG) and river level, but nothing
that answers "what is it doing outside right now" — no temperature, humidity or
wind, and no responder-facing weather warnings. Those drive real decisions:
whether brigades can work a quebrada, whether fog closes the Carretera Central,
whether gusts ground a drone survey.

Source: Open-Meteo (https://open-meteo.com). Chosen because it needs no API key
and no account, costs nothing at any volume this project will reach, and updates
every 15 minutes — which keeps the "no paid API" guarantee intact while giving
the console one feed that is genuinely live rather than replayed. Licensed
CC-BY-4.0; attribution is carried in the data-sources panel.

Flow:
  load_points → fetch_current (one request per point) → upsert_observations
"""
import logging
import os
from datetime import datetime, timezone

import asyncpg
import httpx
from prefect import flow, task

log = logging.getLogger(__name__)

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Requested in this order; the response echoes them under "current".
CURRENT_FIELDS = [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "precipitation",
    "weather_code",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
]

DB_DSN = (
    f"postgresql://{os.getenv('POSTGRES_USER','costa')}:"
    f"{os.getenv('POSTGRES_PASSWORD','change_me_in_production')}"
    f"@{os.getenv('POSTGRES_HOST','localhost')}:5432/"
    f"{os.getenv('POSTGRES_DB','costa_resiliente')}"
)

REQUEST_TIMEOUT_S = 20.0


# Interpretation of these numbers (labels, warning thresholds) lives in
# costa_api.weather, which is what serves them to the console and the copilot.
# Keeping it in one package stops the map chip and the sitrep from disagreeing
# about whether it is currently too windy to fly a drone. This module stays
# purely an ingest: fetch, normalise, store.

# ─── Tasks ────────────────────────────────────────────────────────────────────

@task(retries=2, retry_delay_seconds=30, log_prints=True)
async def load_points() -> list[dict]:
    """Active observation points from hydro.weather_points."""
    conn = await asyncpg.connect(DB_DSN)
    try:
        rows = await conn.fetch(
            "SELECT id, name, lat, lon FROM hydro.weather_points WHERE active ORDER BY id"
        )
        return [dict(r) for r in rows]
    finally:
        await conn.close()


@task(retries=3, retry_delay_seconds=20, log_prints=True)
async def fetch_current(point: dict) -> dict | None:
    """Current conditions for one point.

    Returns None rather than raising when the endpoint misbehaves: one bad point
    must not take down the whole sweep, and the console degrades to the last
    stored observation for that location.
    """
    params = {
        "latitude": point["lat"],
        "longitude": point["lon"],
        "current": ",".join(CURRENT_FIELDS),
        "timezone": "UTC",
    }
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
            resp = await client.get(OPEN_METEO_URL, params=params)
            resp.raise_for_status()
            payload = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("weather: fetch failed for %s: %s", point["name"], exc)
        return None

    current = payload.get("current") or {}
    observed_raw = current.get("time")
    if not observed_raw:
        log.warning("weather: no current block for %s", point["name"])
        return None

    # Open-Meteo returns naive ISO minutes when timezone=UTC.
    observed_at = datetime.fromisoformat(observed_raw)
    if observed_at.tzinfo is None:
        observed_at = observed_at.replace(tzinfo=timezone.utc)

    return {
        "point_id": point["id"],
        "time": observed_at,
        "temperature_c": current.get("temperature_2m"),
        "apparent_temperature_c": current.get("apparent_temperature"),
        "humidity_pct": current.get("relative_humidity_2m"),
        "precipitation_mm": current.get("precipitation"),
        "wind_speed_kmh": current.get("wind_speed_10m"),
        "wind_gusts_kmh": current.get("wind_gusts_10m"),
        "wind_direction_deg": current.get("wind_direction_10m"),
        "weather_code": current.get("weather_code"),
    }


@task(log_prints=True)
async def upsert_observations(rows: list[dict]) -> int:
    """Write observations, replacing any row already stored for that minute."""
    if not rows:
        return 0
    conn = await asyncpg.connect(DB_DSN)
    try:
        await conn.executemany(
            """
            INSERT INTO hydro.weather_observations (
                time, point_id, temperature_c, apparent_temperature_c,
                humidity_pct, precipitation_mm, wind_speed_kmh, wind_gusts_kmh,
                wind_direction_deg, weather_code, source
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open-meteo')
            ON CONFLICT (time, point_id) DO UPDATE SET
                temperature_c          = EXCLUDED.temperature_c,
                apparent_temperature_c = EXCLUDED.apparent_temperature_c,
                humidity_pct           = EXCLUDED.humidity_pct,
                precipitation_mm       = EXCLUDED.precipitation_mm,
                wind_speed_kmh         = EXCLUDED.wind_speed_kmh,
                wind_gusts_kmh         = EXCLUDED.wind_gusts_kmh,
                wind_direction_deg     = EXCLUDED.wind_direction_deg,
                weather_code           = EXCLUDED.weather_code
            """,
            [
                (
                    r["time"], r["point_id"], r["temperature_c"],
                    r["apparent_temperature_c"], r["humidity_pct"],
                    r["precipitation_mm"], r["wind_speed_kmh"],
                    r["wind_gusts_kmh"], r["wind_direction_deg"],
                    int(r["weather_code"]) if r["weather_code"] is not None else None,
                )
                for r in rows
            ],
        )
        return len(rows)
    finally:
        await conn.close()


def _write_weather_heartbeat() -> None:
    """Publish last-run time so /health/scraper can report this source."""
    try:
        import redis as _redis
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        r = _redis.from_url(redis_url, decode_responses=True, socket_timeout=2)
        try:
            r.set(
                "costa:scraper:last_run:weather",
                datetime.now(timezone.utc).isoformat(),
                ex=3600,  # 4x the 15min schedule; stale if the flow stops
            )
        finally:
            r.close()
    except Exception as exc:
        log.debug("weather: heartbeat write failed (non-critical): %s", exc)


@flow(name="ingest-weather", log_prints=True)
async def ingest_weather_flow() -> dict:
    """Sweep every active point and store current conditions."""
    points = await load_points()
    if not points:
        log.warning("weather: no active points configured")
        return {"points": 0, "observations": 0}

    rows: list[dict] = []
    for point in points:
        observation = await fetch_current(point)
        if observation:
            rows.append(observation)

    written = await upsert_observations(rows)
    _write_weather_heartbeat()
    log.info("weather: stored %d/%d point observations", written, len(points))
    return {"points": len(points), "observations": written}
