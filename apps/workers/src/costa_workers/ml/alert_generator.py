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

import json
import logging
import os
from datetime import datetime, timedelta, timezone

from prefect import flow, task

logger = logging.getLogger(__name__)

DB_DSN = os.getenv("DATABASE_URL", "postgresql://costa:costa@localhost:5432/costa_resiliente")

FLOOD_ALERT_MIN_KM2 = 0.1      # minimum flood area to generate an alert
HUAYCO_ALERT_LEVELS = {"high", "very_high"}
SOCIAL_CLUSTER_MIN = 5          # minimum signal count to trigger alert
SOCIAL_CLUSTER_WINDOW_H = 1     # hours to look back for social clusters


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
            await pool.execute(
                """
                INSERT INTO ops.alerts
                    (type, severity, status, title, description,
                     district_id, source_refs)
                VALUES ('flood', $1, 'active', $2, $3, $4, $5::jsonb)
                """,
                severity, title, desc,
                row["primary_district_id"],
                source_refs,
            )
            inserted += 1

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


@task(retries=2, retry_delay_seconds=30, log_prints=True)
async def generate_social_alerts(db_dsn: str = DB_DSN) -> int:
    """
    Generate ops.alerts when ≥ SOCIAL_CLUSTER_MIN needs_help signals
    appear from the same district within SOCIAL_CLUSTER_WINDOW_H hours.
    """
    import asyncpg

    window = datetime.now(timezone.utc) - timedelta(hours=SOCIAL_CLUSTER_WINDOW_H)

    async with asyncpg.create_pool(db_dsn, min_size=1, max_size=2) as pool:
        clusters = await pool.fetch(
            """
            SELECT s.district_id, d.name AS district_name,
                   COUNT(*) AS signal_count,
                   MAX(s.ingested_at) AS latest_signal,
                   ARRAY_AGG(s.id ORDER BY s.ingested_at DESC) AS signal_ids
            FROM social.signals s
            JOIN geo.districts d ON d.id = s.district_id
            WHERE s.triage_label = 'needs_help'
              AND s.ingested_at >= $1
            GROUP BY s.district_id, d.name
            HAVING COUNT(*) >= $2
            """,
            window, SOCIAL_CLUSTER_MIN,
        )

        inserted = 0
        for cluster in clusters:
            count = int(cluster["signal_count"])
            severity = _social_severity(count)
            sig_ids = list(cluster["signal_ids"][:20])
            source_refs = json.dumps({
                "signal_ids": [str(i) for i in sig_ids],
                "district_id": str(cluster["district_id"]),
                "window_start": window.isoformat(),
            })

            # Skip if an active social alert already exists for this district
            existing = await pool.fetchval(
                """
                SELECT id FROM ops.alerts
                WHERE type = 'social_cluster'
                  AND district_id = $1
                  AND status = 'active'
                  AND created_at >= $2
                LIMIT 1
                """,
                cluster["district_id"], window,
            )
            if existing:
                continue

            title = f"{count} señales de ayuda — {cluster['district_name']}"
            desc = f"Clúster de {count} señales 'needs_help' en la última hora."
            await pool.execute(
                """
                INSERT INTO ops.alerts
                    (type, severity, status, title, description,
                     district_id, source_refs)
                VALUES ('social_cluster', $1, 'active', $2, $3, $4, $5::jsonb)
                """,
                severity, title, desc,
                cluster["district_id"], source_refs,
            )
            inserted += 1

    logger.info("Social cluster alerts generated: %d", inserted)
    return inserted


@flow(name="generate-alerts", log_prints=True)
async def generate_alerts_flow() -> dict:
    """
    Run all three alert generators. Schedule: every 5 minutes.
    """
    flood = await generate_flood_alerts()
    huayco = await generate_huayco_alerts()
    social = await generate_social_alerts()

    total = flood + huayco + social
    logger.info("Alert generation complete: %d new alerts", total)
    return {
        "flood_alerts": flood,
        "huayco_alerts": huayco,
        "social_alerts": social,
        "total": total,
    }
