import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.db import get_db, engine
from costa_api.auto_seed import maybe_seed
from costa_api.config import settings
from costa_api.routers.auth import get_current_operator, CurrentOperator

log = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    version: str
    sinagerd_level: str = "NORMAL"  # EMERGENCIA / ALERTA / AVISO / NORMAL
    active_alerts: int = 0
    critical_alerts: int = 0  # Count of critical-severity active alerts
    high_alerts: int = 0      # Count of high-severity active alerts
    max_rain_72h_mm: float | None = None  # Max 72h rainfall across Lima watersheds
    rain_level: str = "normal"  # emergencia (≥50mm) / alerta (≥25mm) / aviso (≥15mm 24h) / normal
    sinagerd_primary_trigger: str = "none"  # alerts | rainfall | combined | none


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
async def health_check(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    """Basic health check with current SINAGERD operational level."""
    try:
        await db.execute(text("SET LOCAL statement_timeout = '3000'"))
        result = await db.execute(
            text("""
                SELECT COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count,
                       COUNT(*) FILTER (WHERE severity = 'high') AS high_count
                FROM ops.alerts WHERE status = 'active'
            """)
        )
        row = result.mappings().first()
        total = int(row["total"] or 0) if row else 0
        critical = int(row["critical_count"] or 0) if row else 0
        high = int(row["high_count"] or 0) if row else 0
        if critical > 0:
            level = "EMERGENCIA"
        elif high > 1 or total > 4:
            level = "ALERTA"
        elif total > 0:
            level = "AVISO"
        else:
            level = "NORMAL"
    except Exception:
        total, level = 0, "NORMAL"

    # Max rainfall for quick external monitoring
    max_rain: float | None = None
    rain_level = "normal"
    try:
        rain_row = await db.execute(
            text("""
                SELECT MAX(latest.acc_72h_mm) AS max_rain
                FROM (
                    SELECT DISTINCT ON (watershed_id) acc_72h_mm
                    FROM hydro.imerg_accumulations
                    ORDER BY watershed_id, time DESC
                ) latest
            """)
        )
        r = rain_row.scalar()
        max_rain = float(r) if r is not None else None
        if max_rain is not None:
            if max_rain >= 50.0:
                rain_level = "emergencia"
                # Elevate SINAGERD level if rainfall alone exceeds EMERGENCIA threshold
                if level not in ("EMERGENCIA",):
                    level = "EMERGENCIA"
            elif max_rain >= 25.0:
                rain_level = "alerta"
                # Elevate to ALERTA if only AVISO or NORMAL from alerts
                if level in ("AVISO", "NORMAL"):
                    level = "ALERTA"
            elif max_rain >= 15.0:
                rain_level = "aviso"
                # Elevate to AVISO if only NORMAL from alerts
                if level == "NORMAL":
                    level = "AVISO"
    except Exception:
        pass

    # Determine primary trigger for downstream monitoring systems
    alerts_trigger = critical > 0 or high > 1 or total > 4
    rain_trigger = max_rain is not None and max_rain >= 25.0
    if alerts_trigger and rain_trigger:
        primary_trigger = "combined"
    elif alerts_trigger:
        primary_trigger = "alerts"
    elif rain_trigger:
        primary_trigger = "rainfall"
    else:
        primary_trigger = "none"

    return HealthResponse(
        status="ok", version="0.1.0",
        sinagerd_level=level, active_alerts=total,
        critical_alerts=critical, high_alerts=high,
        max_rain_72h_mm=max_rain, rain_level=rain_level,
        sinagerd_primary_trigger=primary_trigger,
    )


@router.get("/health/seed", response_model=SeedStatus)
async def seed_status(db: AsyncSession = Depends(get_db)) -> SeedStatus:
    """Return row counts for seeded tables: useful for diagnosing empty data."""
    await db.execute(text("SET LOCAL statement_timeout = '10000'"))
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
    Status: 'ok' (<15min), 'stale' (15min: 2h), 'offline' (>2h or no data).
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

    # Merge Redis scraper health (written by workers after each run).
    # One shared client for all reads + ping: avoids 9 separate connection opens.
    ana_scraper: dict = {}
    senamhi_scraper: dict = {}
    bluesky_run: dict = {}
    rss_run: dict = {}
    alerts_run: dict = {}
    imerg_run: dict = {}
    stations_run: dict = {}
    redis_ok = False

    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
        try:
            await r.ping()
            redis_ok = True

            # Bulk-fetch all keys in one pipeline pass
            async with r.pipeline(transaction=False) as pipe:
                pipe.get("costa:scraper:status:ana")
                pipe.get("costa:scraper:status:senamhi")
                pipe.get("costa:scraper:last_run:bluesky")
                pipe.get("costa:scraper:last_run:rss")
                pipe.get("costa:scraper:last_run:alerts")
                pipe.get("costa:scraper:last_run:imerg")
                pipe.get("costa:scraper:last_run:stations")
                results = await pipe.execute()

            raw_ana, raw_senamhi, raw_bluesky, raw_rss, raw_alerts, raw_imerg, raw_stations = results

            def _parse_scraper_status(raw: str | None) -> dict:
                if not raw:
                    return {}
                try:
                    d = json.loads(raw)
                    stations_ok = d.get("stations_ok", 0)
                    total = d.get("total", 1)
                    ok_pct = stations_ok / max(total, 1)
                    status = "ok" if ok_pct >= 0.5 else ("stale" if ok_pct > 0 else "offline")
                    return {"scraper_live_stations": stations_ok, "scraper_total": total, "scraper_status": status}
                except Exception as exc:
                    log.warning("health: _parse_scraper_status failed on raw=%r: %s", raw[:80] if raw else raw, exc)
                    return {}

            def _parse_last_run(raw: str | None, stale_min: int) -> dict:
                if not raw:
                    return {}
                try:
                    last_run = datetime.fromisoformat(raw)
                    age_min = (now - last_run).total_seconds() / 60
                    status = "ok" if age_min < stale_min else ("stale" if age_min < 120 else "offline")
                    return {"scraper_last_run_at": raw, "status": status}
                except Exception as exc:
                    log.warning("health: _parse_last_run failed on raw=%r: %s", raw[:80] if raw else raw, exc)
                    return {}

            ana_scraper = _parse_scraper_status(raw_ana)
            senamhi_scraper = _parse_scraper_status(raw_senamhi)
            bluesky_run = _parse_last_run(raw_bluesky, stale_min=20)
            rss_run = _parse_last_run(raw_rss, stale_min=20)
            alerts_run = _parse_last_run(raw_alerts, stale_min=8)
            imerg_run = _parse_last_run(raw_imerg, stale_min=70)
            stations_run = _parse_last_run(raw_stations, stale_min=70)

        finally:
            await r.aclose()
    except Exception as exc:
        log.warning("health: Redis unavailable: %s", exc)

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
    # Reddit and Telegram are best-effort external scrapers, their outage does
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

    # Include alert counts + SINAGERD level for integrated monitoring dashboards
    try:
        alert_row = (await db.execute(
            text("""
                SELECT COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count,
                       COUNT(*) FILTER (WHERE severity = 'high') AS high_count
                FROM ops.alerts WHERE status = 'active'
            """)
        )).mappings().first()
        active_total = int(alert_row["total"] or 0) if alert_row else 0
        active_crit  = int(alert_row["critical_count"] or 0) if alert_row else 0
        active_high  = int(alert_row["high_count"] or 0) if alert_row else 0
        sinagerd_quick = "EMERGENCIA" if active_crit > 0 else ("ALERTA" if active_high > 1 else "AVISO" if active_total > 0 else "NORMAL")
    except Exception:
        active_total = active_crit = active_high = 0
        sinagerd_quick = "NORMAL"

    return {
        "retrieved_at": now.isoformat(),
        "overall_status": overall,
        "redis": {"status": "ok" if redis_ok else "offline"},
        "active_alerts": active_total,
        "critical_alerts": active_crit,
        "sinagerd_level": sinagerd_quick,
        "sources": sources,
    }


@router.post("/health/seed")
async def trigger_seed(
    request: Request,
    operator: CurrentOperator | None = Depends(get_current_operator),
) -> dict:
    """Force a re-seed pass (idempotent). Requires coen or coer role."""
    if operator is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticación requerida.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if operator.role not in ("coen", "coer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo operadores COEN/COER pueden ejecutar el seed.",
        )
    try:
        await maybe_seed(engine)
        return {"status": "ok", "message": "Seed pass completed", "triggered_by": operator.username}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}
