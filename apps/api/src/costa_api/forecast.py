"""72-hour rainfall forecast per watershed, from Open-Meteo.

Replaces a hard-coded table the district dashboard used to show under a
"SENAMHI · WRF" label: invented numbers attributed to a real agency. This is a
real numerical-weather-prediction forecast (Open-Meteo "best match", which
blends national and global models), free, keyless and CC BY 4.0.

Rain that causes huaycos and river floods in Lima falls in the upper basins,
not on the coast, so each basin is sampled at points along its middle and upper
course and the forecast is their mean.

The upstream call is cached in-process for 15 minutes: the model updates hourly
at best, and one dashboard open per operator should not be one API call each.
"""
from __future__ import annotations

import time
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
SOURCE = "Open-Meteo (best match NWP), CC BY 4.0"
SOURCE_URL = "https://open-meteo.com/"
CACHE_TTL_S = 15 * 60
HORIZONS_H = (6, 12, 24, 48, 72)
LIMA_TZ = ZoneInfo("America/Lima")

# ANA 72 h thresholds used across the product (alerts, fusion, SITREP).
ALERTA_72H_MM = 25.0
EMERGENCIA_72H_MM = 50.0

# (lat, lon): middle and upper course of each river.
BASIN_POINTS: dict[str, list[tuple[float, float]]] = {
    "Rímac":   [(-11.94, -76.69), (-11.84, -76.38), (-11.76, -76.30)],   # Chosica, Matucana, San Mateo
    "Chillón": [(-11.67, -76.83), (-11.47, -76.62)],                     # Santa Rosa de Quives, Canta
    "Lurín":   [(-12.10, -76.78), (-12.08, -76.51), (-12.13, -76.42)],   # Cieneguilla, Antioquía, Langa
}

_cache: dict[str, Any] = {"at": 0.0, "value": None}


def _level(mm_72h: float) -> str:
    if mm_72h >= EMERGENCIA_72H_MM:
        return "emergencia"
    if mm_72h >= ALERTA_72H_MM:
        return "alerta"
    return "normal"


def summarise(points_payload: list[dict], now: datetime) -> dict[str, Any]:
    """Pure: Open-Meteo multi-point payload (in BASIN_POINTS order) -> per-basin cumulatives."""
    now_key = now.astimezone(LIMA_TZ).strftime("%Y-%m-%dT%H:00")
    basins: dict[str, Any] = {}
    i = 0
    for basin, pts in BASIN_POINTS.items():
        series = points_payload[i:i + len(pts)]
        i += len(pts)
        cumulative = {h: 0.0 for h in HORIZONS_H}
        max_prob = 0
        for s in series:
            hourly = s.get("hourly", {})
            times = hourly.get("time", [])
            start = times.index(now_key) if now_key in times else 0
            rain = [r or 0.0 for r in hourly.get("precipitation", [])[start:start + max(HORIZONS_H)]]
            probs = [p or 0 for p in hourly.get("precipitation_probability", [])[start:start + 72]]
            for h in HORIZONS_H:
                cumulative[h] += sum(rain[:h]) / len(series)
            max_prob = max([max_prob, *probs])
        basins[basin] = {
            "cumulative_mm": {str(h): round(v, 1) for h, v in cumulative.items()},
            "level_72h": _level(cumulative[72]),
            "max_precip_probability_pct": max_prob,
            "points": [{"lat": la, "lon": lo} for la, lo in pts],
        }
    return basins


async def rain_forecast(client: httpx.AsyncClient | None = None) -> dict[str, Any]:
    if _cache["value"] is not None and time.monotonic() - _cache["at"] < CACHE_TTL_S:
        return _cache["value"]
    all_pts = [p for pts in BASIN_POINTS.values() for p in pts]
    params = {
        "latitude": ",".join(str(p[0]) for p in all_pts),
        "longitude": ",".join(str(p[1]) for p in all_pts),
        "hourly": "precipitation,precipitation_probability",
        "forecast_days": 4,
        "timezone": "America/Lima",
    }
    owns = client is None
    client = client or httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0))
    try:
        resp = await client.get(OPEN_METEO_URL, params=params)
        resp.raise_for_status()
        payload = resp.json()
    finally:
        if owns:
            await client.aclose()
    if isinstance(payload, dict):  # single point returns an object, not a list
        payload = [payload]
    now = datetime.now(LIMA_TZ)
    value = {
        "source": SOURCE,
        "source_url": SOURCE_URL,
        "issued_at": now.isoformat(),
        "horizons_h": list(HORIZONS_H),
        "thresholds_72h_mm": {"alerta": ALERTA_72H_MM, "emergencia": EMERGENCIA_72H_MM},
        "basins": summarise(payload, now),
    }
    _cache.update(at=time.monotonic(), value=value)
    return value
