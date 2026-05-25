import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.db import get_db, engine
from costa_api.auto_seed import maybe_seed
from costa_api.config import settings

log = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    version: str


class SeedStatus(BaseModel):
    districts: int
    alerts: int
    flood_polygons: int
    social_signals: int
    infrastructure: int
    hazard_zones: int
    quebradas: int
    stations: int


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(status="ok", version="0.1.0")


@router.get("/health/seed", response_model=SeedStatus)
async def seed_status(db: AsyncSession = Depends(get_db)) -> SeedStatus:
    """Return row counts for seeded tables — useful for diagnosing empty data."""
    counts: dict[str, int] = {}
    for key, tbl in [
        ("districts", "geo.districts"),
        ("alerts", "ops.alerts"),
        ("flood_polygons", "ml.flood_polygons"),
        ("social_signals", "social.signals"),
        ("infrastructure", "geo.infrastructure"),
        ("hazard_zones", "geo.hazard_zones"),
        ("quebradas", "geo.quebradas"),
        ("stations", "hydro.stations"),
    ]:
        counts[key] = (
            await db.execute(text(f"SELECT COUNT(*) FROM {tbl}"))
        ).scalar_one()
    return SeedStatus(**counts)


@router.get("/health/scraper")
async def scraper_health(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """
    Per-source scraper health: last ingested record timestamp + total count.
    Status: 'ok' (<15min), 'stale' (15min–2h), 'offline' (>2h or no data).
    """
    now = datetime.now(timezone.utc)

    async def _source_stat(query: str, params: dict | None = None) -> dict:
        try:
            row = (await db.execute(text(query), params or {})).mappings().first()
            if not row:
                return {"count": 0, "last_seen_at": None, "status": "offline"}
            count = int(row["count"] or 0)
            last = row["last_seen_at"]
            if last is None:
                status = "offline"
            else:
                age_min = (now - last.replace(tzinfo=timezone.utc) if last.tzinfo is None else now - last).total_seconds() / 60
                status = "ok" if age_min < 15 else ("stale" if age_min < 120 else "offline")
            return {
                "count": count,
                "last_seen_at": last.isoformat() if last else None,
                "status": status,
            }
        except Exception as exc:
            return {"count": 0, "last_seen_at": None, "status": "error", "error": str(exc)}

    bluesky = await _source_stat(
        "SELECT COUNT(*) as count, MAX(published_at) as last_seen_at FROM social.signals WHERE source = 'bluesky'"
    )
    rss = await _source_stat(
        "SELECT COUNT(*) as count, MAX(published_at) as last_seen_at FROM social.signals WHERE source LIKE 'rss_%'"
    )
    reddit = await _source_stat(
        "SELECT COUNT(*) as count, MAX(published_at) as last_seen_at FROM social.signals WHERE source = 'reddit'"
    )
    telegram = await _source_stat(
        "SELECT COUNT(*) as count, MAX(published_at) as last_seen_at FROM social.signals WHERE source = 'telegram'"
    )
    imerg = await _source_stat(
        "SELECT COUNT(*) as count, MAX(time) as last_seen_at FROM hydro.imerg_accumulations"
    )
    stations = await _source_stat(
        "SELECT COUNT(*) as count, MAX(time) as last_seen_at FROM hydro.station_observations"
    )
    flood = await _source_stat(
        "SELECT COUNT(*) as count, MAX(processed_at) as last_seen_at FROM ml.flood_polygons"
    )
    alerts = await _source_stat(
        "SELECT COUNT(*) as count, MAX(created_at) as last_seen_at FROM ops.alerts"
    )

    # Merge Redis scraper health (written by workers after each run)
    async def _redis_scraper_status(source_key: str) -> dict:
        try:
            import redis.asyncio as aioredis
            r = aioredis.from_url(settings.redis_url, decode_responses=True, socket_timeout=1)
            raw = await r.get(f"costa:scraper:status:{source_key}")
            await r.aclose()
            if raw:
                d = json.loads(raw)
                stations_ok = d.get("stations_ok", 0)
                total = d.get("total", 1)
                ok_pct = stations_ok / max(total, 1)
                scraper_status = "ok" if ok_pct >= 0.5 else ("stale" if ok_pct > 0 else "offline")
                return {"scraper_live_stations": stations_ok, "scraper_total": total, "scraper_status": scraper_status}
        except Exception as exc:
            log.warning("health: Redis scraper-status read failed for %r: %s", source_key, exc)
        return {}

    async def _redis_last_run_status(source_key: str, stale_min: int = 20) -> dict:
        """Read per-source last-run heartbeat written by the social worker after each cycle.
        Returns a status override dict: status='ok'/'stale'/'offline' + scraper_last_run_at."""
        try:
            import redis.asyncio as aioredis
            r = aioredis.from_url(settings.redis_url, decode_responses=True, socket_timeout=1)
            raw = await r.get(f"costa:scraper:last_run:{source_key}")
            await r.aclose()
            if raw:
                from datetime import datetime, timezone
                last_run = datetime.fromisoformat(raw)
                age_min = (now - last_run).total_seconds() / 60
                run_status = "ok" if age_min < stale_min else ("stale" if age_min < 120 else "offline")
                return {"scraper_last_run_at": raw, "status": run_status}
        except Exception as exc:
            log.warning("health: Redis last-run read failed for %r: %s", source_key, exc)
        return {}

    ana_scraper = await _redis_scraper_status("ana")
    senamhi_scraper = await _redis_scraper_status("senamhi")
    bluesky_run = await _redis_last_run_status("bluesky", stale_min=20)
    rss_run = await _redis_last_run_status("rss", stale_min=20)
    alerts_run = await _redis_last_run_status("alerts", stale_min=8)    # 5min schedule + 3min grace
    imerg_run = await _redis_last_run_status("imerg", stale_min=70)     # 30-60min actual interval + grace
    stations_run = await _redis_last_run_status("stations", stale_min=70)  # 30-60min actual interval + grace

    sources = {
        # Merge Redis last-run status into bluesky/rss so health reflects scraper
        # liveness rather than content publication density (quiet periods have no
        # new disaster posts even though the scraper ran successfully).
        "bluesky": {"label": "Bluesky Jetstream", "schedule": "15min", **bluesky, **bluesky_run},
        "rss": {"label": "RSS (RPP/Andina/Canal N…)", "schedule": "15min", **rss, **rss_run},
        "reddit": {"label": "Reddit (r/Peru, r/Lima)", "schedule": "15min", **reddit},
        "telegram": {"label": "Telegram (SENAMHI)", "schedule": "15min", **telegram},
        "imerg": {"label": "NASA IMERG Late Run V07B", "schedule": "30min", **imerg, **imerg_run},
        "stations": {"label": "ANA/SENAMHI Stations", "schedule": "15min", **stations, **ana_scraper, **stations_run},
        "flood": {"label": "SAR Flood Polygons", "schedule": "daily", **flood},
        "alerts": {"label": "Auto-generated Alerts", "schedule": "5min", **alerts, **alerts_run},
    }

    # Overall status uses operational sources only.
    # Reddit and Telegram are best-effort external scrapers — their outage does
    # not degrade situational awareness (Bluesky + RSS carry the social signal).
    # SAR flood is daily cadence; offline between acquisitions is expected.
    _core = {k: v for k, v in sources.items() if k not in ("reddit", "telegram", "flood")}
    _statuses = [s["status"] for s in _core.values()]
    if all(s == "ok" for s in _statuses):
        overall = "ok"
    elif any(s == "offline" for s in _statuses) and not any(s in ("ok", "stale") for s in _statuses):
        overall = "offline"
    else:
        overall = "stale"

    return {
        "retrieved_at": now.isoformat(),
        "overall_status": overall,
        "sources": sources,
    }


@router.post("/health/seed")
async def trigger_seed() -> dict:
    """Force a re-seed pass (idempotent — skips tables that already have data)."""
    try:
        await maybe_seed(engine)
        return {"status": "ok", "message": "Seed pass completed"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}
