"""Automated alert generation from ML/hydro/social signals → ops.alerts.

Three alert sources:
  1. Flood polygons: new ml.flood_polygons with area_km2 ≥ threshold
  2. Huayco susceptibility: quebradas at high/very_high risk
  3. Social clusters: 5+ needs_help signals from same district in 1h

Severity mapping:
  flood:   area_km2 ≥ 5 → critical; ≥ 1 → high; else medium
  huayco:  very_high → critical; high → high
  social:  ≥ 10 signals → high; ≥ 5 → medium

Idempotency:
  Each alert type carries a source_refs JSONB fingerprint.
  ON CONFLICT DO NOTHING via unique fingerprint prevents duplicate alerts
  for the same event.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone

import httpx
from prefect import flow, task

logger = logging.getLogger(__name__)

DB_DSN = os.getenv("DATABASE_URL", "postgresql://costa:costa@localhost:5432/costa_resiliente")

SEVERITY_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}
_NOTIFY_SEVERITIES = {"critical", "high"}  # auto-notify on these; operators see medium/low in UI


async def _auto_notify(pool, alert_id: int, severity: str, title: str, alert_type: str) -> None:
    """
    Fan out to notification_subscribers for newly generated alerts.
    Only fires for critical/high — medium/low visible in dashboard only.
    Mirrors the logic in api/notifications.py but runs in-process in the worker.
    """
    if severity not in _NOTIFY_SEVERITIES:
        return
    try:
        sev_rank = SEVERITY_RANK[severity]
        subscribers = await pool.fetch(
            """
            SELECT id, channel, target, label, severity_min
            FROM ops.notification_subscribers
            WHERE active = TRUE
            """
        )
        for sub in subscribers:
            sub_min_rank = SEVERITY_RANK.get(sub["severity_min"], 2)
            if sev_rank < sub_min_rank:
                continue
            payload = {
                "event": "new_alert",
                "alert_id": alert_id,
                "severity": severity,
                "title": title,
                "type": alert_type,
                "source": "costa-resiliente-auto",
            }
            channel = sub["channel"]
            status, err = "skipped", f"{channel} stub"
            if channel == "webhook":
                async with httpx.AsyncClient(timeout=5.0) as client:
                    for attempt in range(1, 4):
                        try:
                            resp = await client.post(sub["target"], json=payload,
                                                    headers={"User-Agent": "CostaResililienteAlerts/1.0"})
                            if resp.status_code < 300:
                                status, err = "delivered", ""
                                break
                            err = f"HTTP {resp.status_code}"
                        except Exception as exc:
                            err = str(exc)
                        if attempt < 3:
                            await asyncio.sleep(2 ** attempt)
            await pool.execute(
                """
                INSERT INTO ops.notification_deliveries
                    (subscriber_id, alert_id, trigger_event, status, attempts, last_error, delivered_at)
                VALUES ($1, $2, 'auto_generated', $3, 1, $4,
                        CASE WHEN $5 = 'delivered' THEN NOW() ELSE NULL END)
                """,
                sub["id"], alert_id, status, err or None, status,
            )
    except Exception as exc:
        logger.warning("_auto_notify failed (non-fatal): %s", exc)

FLOOD_ALERT_MIN_KM2 = 0.1      # minimum flood area to generate an alert
HUAYCO_ALERT_LEVELS = {"high", "very_high"}
SOCIAL_CLUSTER_MIN = 5          # minimum signal count to trigger alert
SOCIAL_CLUSTER_WINDOW_H = 1     # hours to look back for social clusters

# IMERG rainfall thresholds (ANA/SENAMHI-aligned for Lima El Niño events)
RAIN_CRITICAL_72H_MM = 50.0    # EMERGENCIA-level — corresponds to ~2017 El Niño peaks
RAIN_HIGH_72H_MM = 25.0        # ALERTA level
RAIN_HIGH_24H_MM = 15.0        # 24h spike threshold

# Auto-resolution windows (if triggering condition no longer met)
FLOOD_ALERT_TTL_DAYS = 7       # SAR polygon is still evidence for 7 days
HUAYCO_ALERT_TTL_H = 48        # susceptibility recalculated daily
SOCIAL_ALERT_TTL_H = 4         # social clusters dissipate quickly


def _flood_severity(area_km2: float) -> str:
    if area_km2 >= 5.0:
        return "critical"
    if area_km2 >= 1.0:
        return "high"
    return "medium"


def _social_severity(count: int) -> str:
    return "high" if count >= 10 else "medium"


@task(retries=2, retry_delay_seconds=30, log_prints=True)
async def generate_flood_alerts(db_dsn: str = DB_DSN) -> int:
    """
    Generate ops.alerts for new flood polygons not yet alerted.
    Skips sentinel rows (geom IS NULL) and areas below threshold.
    """
    import asyncpg

    async with asyncpg.create_pool(db_dsn, min_size=1, max_size=2) as pool:
        rows = await pool.fetch(
            """
            SELECT fp.id, fp.acquired_at, fp.area_km2, fp.confidence,
                   fp.affected_districts,
                   (SELECT d.id FROM geo.districts d
                    WHERE d.id = ANY(fp.affected_districts)
                    LIMIT 1) AS primary_district_id
            FROM ml.flood_polygons fp
            WHERE fp.geom IS NOT NULL
              AND fp.area_km2 >= $1
              AND NOT EXISTS (
                  SELECT 1 FROM ops.alerts a
                  WHERE a.source_refs->>'flood_polygon_id' = fp.id::text
              )
            ORDER BY fp.acquired_at DESC
            LIMIT 20
            """,
            FLOOD_ALERT_MIN_KM2,
        )

        inserted = 0
        for row in rows:
            area = float(row["area_km2"] or 0)
            severity = _flood_severity(area)
            source_refs = json.dumps({
                "flood_polygon_id": str(row["id"]),
                "scene_acquired_at": str(row["acquired_at"]),
            })
            title = f"Inundación detectada — {area:.1f} km² afectados"
            desc = (
                f"Polígono SAR adquirido {row['acquired_at'].strftime('%d/%m %H:%M')} UTC. "
                f"Confianza: {float(row['confidence'] or 0):.0%}."
            )
            new_id = await pool.fetchval(
                """
                INSERT INTO ops.alerts
                    (type, severity, status, title, description,
                     district_id, source_refs)
                VALUES ('flood', $1, 'active', $2, $3, $4, $5::jsonb)
                RETURNING id
                """,
                severity, title, desc,
                row["primary_district_id"],
                source_refs,
            )
            inserted += 1
            await _auto_notify(pool, new_id, severity, title, "flood")

    logger.info("Flood alerts generated: %d", inserted)
    return inserted


@task(retries=2, retry_delay_seconds=30, log_prints=True)
async def generate_huayco_alerts(db_dsn: str = DB_DSN) -> int:
    """
    Generate ops.alerts for quebradas at high/very_high risk from latest
    huayco susceptibility run. One alert per quebrada per run.
    """
    import asyncpg

    async with asyncpg.create_pool(db_dsn, min_size=1, max_size=2) as pool:
        rows = await pool.fetch(
            """
            SELECT hs.id, hs.quebrada_id, hs.probability, hs.risk_level,
                   hs.computed_at, hs.trigger_rain_24h_mm,
                   q.name AS quebrada_name
            FROM ml.huayco_susceptibility hs
            JOIN geo.quebradas q ON q.id = hs.quebrada_id
            WHERE hs.risk_level = ANY($1::text[])
              AND hs.computed_at = (
                  SELECT MAX(computed_at) FROM ml.huayco_susceptibility
              )
              AND NOT EXISTS (
                  SELECT 1 FROM ops.alerts a
                  WHERE a.source_refs->>'huayco_susceptibility_id' = hs.id::text
              )
            ORDER BY hs.probability DESC
            """,
            list(HUAYCO_ALERT_LEVELS),
        )

        inserted = 0
        for row in rows:
            severity = "critical" if row["risk_level"] == "very_high" else "high"
            source_refs = json.dumps({
                "huayco_susceptibility_id": str(row["id"]),
                "quebrada_id": str(row["quebrada_id"]),
                "computed_at": str(row["computed_at"]),
            })
            rain = row["trigger_rain_24h_mm"]
            title = f"Riesgo de huayco — {row['quebrada_name']}"
            desc = (
                f"Susceptibilidad: {float(row['probability']):.0%} ({row['risk_level']}). "
                + (f"Lluvia 24h: {float(rain):.1f} mm." if rain else "")
            )
            await pool.execute(
                """
                INSERT INTO ops.alerts
                    (type, severity, status, title, description, source_refs)
                VALUES ('huayco', $1, 'active', $2, $3, $4::jsonb)
                """,
                severity, title, desc, source_refs,
            )
            inserted += 1

    logger.info("Huayco alerts generated: %d", inserted)
    return inserted


HUAYCO_CLUSTER_MIN = 3          # huaycos are immediately life-threatening — lower threshold

# Per-label cluster config: (min_signals, alert_type_suffix, severity_fn, title_template, desc_template)
_SOCIAL_CLUSTER_CONFIGS = [
    {
        "labels":    ["needs_help"],
        "min":       SOCIAL_CLUSTER_MIN,
        "alert_type": "social_cluster",
        "title_fn":  lambda count, name, _lbl: f"{count} señales de ayuda — {name}",
        "desc_fn":   lambda count, _name, _lbl: f"Clúster de {count} señales 'needs_help' en la última hora.",
        "severity_fn": _social_severity,
    },
    {
        "labels":    ["huayco_observation"],
        "min":       HUAYCO_CLUSTER_MIN,
        "alert_type": "social_cluster",
        "title_fn":  lambda count, name, _lbl: f"{count} avistamientos de huayco — {name}",
        "desc_fn":   lambda count, _name, _lbl: f"{count} reportes de campo 'huayco_observation' en la última hora. Activar protocolo de evacuación de quebradas.",
        "severity_fn": lambda count: "critical" if count >= 3 else "high",
    },
    {
        "labels":    ["flood_observation"],
        "min":       SOCIAL_CLUSTER_MIN,
        "alert_type": "social_cluster",
        "title_fn":  lambda count, name, _lbl: f"{count} avistamientos de inundación — {name}",
        "desc_fn":   lambda count, _name, _lbl: f"{count} reportes de campo 'flood_observation' en la última hora.",
        "severity_fn": _social_severity,
    },
]


@task(retries=2, retry_delay_seconds=30, log_prints=True)
async def generate_social_alerts(db_dsn: str = DB_DSN) -> int:
    """
    Generate ops.alerts when signal clusters exceed thresholds per label type.
    - needs_help:         ≥5 in 1h → social_cluster alert
    - huayco_observation: ≥3 in 1h → critical social_cluster (lower threshold, immediate threat)
    - flood_observation:  ≥5 in 1h → social_cluster alert
    """
    import asyncpg

    window = datetime.now(timezone.utc) - timedelta(hours=SOCIAL_CLUSTER_WINDOW_H)
    inserted = 0

    async with asyncpg.create_pool(db_dsn, min_size=1, max_size=2) as pool:
        for cfg in _SOCIAL_CLUSTER_CONFIGS:
            clusters = await pool.fetch(
                """
                SELECT s.district_id, d.name AS district_name,
                       COUNT(*) AS signal_count,
                       MAX(s.ingested_at) AS latest_signal,
                       ARRAY_AGG(s.id ORDER BY s.ingested_at DESC) AS signal_ids,
                       s.triage_label AS label
                FROM social.signals s
                JOIN geo.districts d ON d.id = s.district_id
                WHERE s.triage_label = ANY($1::text[])
                  AND s.ingested_at >= $2
                GROUP BY s.district_id, d.name, s.triage_label
                HAVING COUNT(*) >= $3
                """,
                cfg["labels"], window, cfg["min"],
            )

            for cluster in clusters:
                count = int(cluster["signal_count"])
                label = cluster["label"]
                severity = cfg["severity_fn"](count)
                sig_ids = list(cluster["signal_ids"][:20])
                source_refs = json.dumps({
                    "signal_ids": [str(i) for i in sig_ids],
                    "district_id": str(cluster["district_id"]),
                    "window_start": window.isoformat(),
                    "trigger_label": label,
                })

                existing = await pool.fetchval(
                    """
                    SELECT id FROM ops.alerts
                    WHERE type = $1
                      AND district_id = $2
                      AND status = 'active'
                      AND created_at >= $3
                      AND source_refs->>'trigger_label' = $4
                    LIMIT 1
                    """,
                    cfg["alert_type"], cluster["district_id"], window, label,
                )
                if existing:
                    continue

                title = cfg["title_fn"](count, cluster["district_name"], label)
                desc = cfg["desc_fn"](count, cluster["district_name"], label)
                new_id = await pool.fetchval(
                    """
                    INSERT INTO ops.alerts
                        (type, severity, status, title, description,
                         district_id, source_refs)
                    VALUES ($1, $2, 'active', $3, $4, $5, $6::jsonb)
                    RETURNING id
                    """,
                    cfg["alert_type"], severity, title, desc,
                    cluster["district_id"], source_refs,
                )
                inserted += 1
                await _auto_notify(pool, new_id, severity, title, cfg["alert_type"])

    logger.info("Social cluster alerts generated: %d", inserted)
    return inserted


@task(retries=2, retry_delay_seconds=30, log_prints=True)
async def generate_rainfall_alerts(db_dsn: str = DB_DSN) -> int:
    """
    Generate ops.alerts when IMERG rainfall accumulations exceed ANA El Niño thresholds.
    One alert per watershed per threshold breach. Auto-deduped within 6h window.
    """
    import asyncpg

    async with asyncpg.create_pool(db_dsn, min_size=1, max_size=2) as pool:
        rows = await pool.fetch(
            """
            SELECT ia.watershed_id, w.name AS watershed_name,
                   ia.time, ia.acc_24h_mm, ia.acc_72h_mm
            FROM hydro.imerg_accumulations ia
            JOIN geo.watersheds w ON w.id = ia.watershed_id
            WHERE ia.time = (
                SELECT MAX(time) FROM hydro.imerg_accumulations
            )
            ORDER BY ia.acc_72h_mm DESC NULLS LAST
            """
        )

        inserted = 0
        dedup_window = datetime.now(timezone.utc) - timedelta(hours=6)

        for row in rows:
            acc_72h = float(row["acc_72h_mm"] or 0)
            acc_24h = float(row["acc_24h_mm"] or 0)

            # Determine if this reading breaches any threshold
            if acc_72h >= RAIN_CRITICAL_72H_MM:
                severity = "critical"
                threshold_label = f"Acumulación 72h: {acc_72h:.1f} mm (UMBRAL CRÍTICO >{RAIN_CRITICAL_72H_MM:.0f} mm)"
            elif acc_72h >= RAIN_HIGH_72H_MM:
                severity = "high"
                threshold_label = f"Acumulación 72h: {acc_72h:.1f} mm (UMBRAL ALTO >{RAIN_HIGH_72H_MM:.0f} mm)"
            elif acc_24h >= RAIN_HIGH_24H_MM:
                severity = "medium"
                threshold_label = f"Acumulación 24h: {acc_24h:.1f} mm (>{RAIN_HIGH_24H_MM:.0f} mm/día)"
            else:
                continue  # Below all thresholds — no alert needed

            # Skip if recent rainfall alert already exists for this watershed
            existing = await pool.fetchval(
                """
                SELECT id FROM ops.alerts
                WHERE type = 'rainfall'
                  AND source_refs->>'watershed_id' = $1
                  AND status = 'active'
                  AND created_at >= $2
                LIMIT 1
                """,
                str(row["watershed_id"]), dedup_window,
            )
            if existing:
                continue

            source_refs = json.dumps({
                "watershed_id": str(row["watershed_id"]),
                "imerg_time": str(row["time"]),
                "acc_72h_mm": acc_72h,
                "acc_24h_mm": acc_24h,
            })
            title = f"Lluvia intensa — cuenca {row['watershed_name']}"
            desc = threshold_label + f". Observado a las {row['time'].strftime('%d/%m %H:%M')} UTC (IMERG)."

            new_id = await pool.fetchval(
                """
                INSERT INTO ops.alerts
                    (type, severity, status, title, description, source_refs)
                VALUES ('rainfall', $1, 'active', $2, $3, $4::jsonb)
                RETURNING id
                """,
                severity, title, desc, source_refs,
            )
            inserted += 1
            await _auto_notify(pool, new_id, severity, title, "rainfall")

    logger.info("Rainfall alerts generated: %d", inserted)
    return inserted


@task(retries=2, retry_delay_seconds=30, log_prints=True)
async def resolve_stale_alerts(db_dsn: str = DB_DSN) -> int:
    """
    Auto-close alerts whose triggering condition can no longer be active.
    Flood: older than FLOOD_ALERT_TTL_DAYS.
    Huayco: older than HUAYCO_ALERT_TTL_H.
    Social: older than SOCIAL_ALERT_TTL_H.
    Rainfall: older than 6h (IMERG refreshes every 30min).
    Transitions active → closed. RETURNING COUNT(*) is invalid in PostgreSQL;
    use RETURNING id and count on the Python side instead.
    """
    import asyncpg

    async with asyncpg.create_pool(db_dsn, min_size=1, max_size=2) as pool:
        # Flood — SAR revisit cadence, keep alert alive for 7 days
        flood_rows = await pool.fetch(
            """
            UPDATE ops.alerts SET status = 'closed', updated_at = NOW()
            WHERE type = 'flood'
              AND status = 'active'
              AND created_at < NOW() - INTERVAL '1 day' * $1
            RETURNING id
            """,
            FLOOD_ALERT_TTL_DAYS,
        )
        # Huayco — susceptibility recalculated daily, 48h window
        huayco_rows = await pool.fetch(
            """
            UPDATE ops.alerts SET status = 'closed', updated_at = NOW()
            WHERE type = 'huayco'
              AND status = 'active'
              AND created_at < NOW() - make_interval(hours => $1)
            RETURNING id
            """,
            HUAYCO_ALERT_TTL_H,
        )
        # Social cluster — dissipates quickly, 4h window
        social_rows = await pool.fetch(
            """
            UPDATE ops.alerts SET status = 'closed', updated_at = NOW()
            WHERE type = 'social_cluster'
              AND status = 'active'
              AND created_at < NOW() - make_interval(hours => $1)
            RETURNING id
            """,
            SOCIAL_ALERT_TTL_H,
        )
        # Rainfall — IMERG refreshes every 30min; close old alerts after 6h
        rain_rows = await pool.fetch(
            """
            UPDATE ops.alerts SET status = 'closed', updated_at = NOW()
            WHERE type = 'rainfall'
              AND status = 'active'
              AND created_at < NOW() - INTERVAL '6 hours'
            RETURNING id
            """
        )

    flood_resolved = len(flood_rows)
    huayco_resolved = len(huayco_rows)
    social_resolved = len(social_rows)
    rain_resolved = len(rain_rows)
    total = flood_resolved + huayco_resolved + social_resolved + rain_resolved
    if total:
        logger.info("Auto-closed %d stale alerts (flood=%d, huayco=%d, social=%d, rain=%d)",
                    total, flood_resolved, huayco_resolved, social_resolved, rain_resolved)
    return total


@flow(name="generate-alerts", log_prints=True)
async def generate_alerts_flow() -> dict:
    """
    Run all three alert generators. Schedule: every 5 minutes.
    """
    flood = await generate_flood_alerts()
    huayco = await generate_huayco_alerts()
    social = await generate_social_alerts()
    rainfall = await generate_rainfall_alerts()
    resolved = await resolve_stale_alerts()

    total = flood + huayco + social + rainfall
    logger.info("Alert generation complete: %d new, %d auto-resolved", total, resolved)

    # Heartbeat for health endpoint — flow ran, not just "was an alert created"
    try:
        import redis.asyncio as aioredis
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        r = aioredis.from_url(redis_url, decode_responses=True, socket_timeout=2)
        await r.set(
            "costa:scraper:last_run:alerts",
            datetime.now(timezone.utc).isoformat(),
            ex=600,  # 10min — expire if flow stops running so stale flag fires naturally
        )
        await r.aclose()
    except Exception:
        pass  # non-critical; health falls back to MAX(created_at)

    return {
        "flood_alerts": flood,
        "huayco_alerts": huayco,
        "social_alerts": social,
        "rainfall_alerts": rainfall,
        "total": total,
        "auto_resolved": resolved,
    }
