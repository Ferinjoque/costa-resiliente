"""Data retention flow: prune expired rows to keep storage bounded.

Scheduled daily via Prefect (see schedules.py).  All operations are
idempotent and safe to re-run.  Nothing is deleted that the schema did
not already mark as expired.

Targets:
  social.signals: rows where expires_at < NOW()  (7-day TTL set at ingest)
  ops.alerts: closed / false_positive rows older than 90 days
  ops.share_tokens: rows where expires_at < NOW()  (30-day TTL)
  ops.security_events: rows older than 180 days (audit window)
"""
from __future__ import annotations

import logging
import os

import asyncpg

logger = logging.getLogger(__name__)


def _dsn() -> str:
    return os.getenv(
        "DATABASE_URL",
        f"postgresql://{os.getenv('POSTGRES_USER', 'costa')}:"
        f"{os.getenv('POSTGRES_PASSWORD', 'change_me_in_production')}"
        f"@{os.getenv('POSTGRES_HOST', 'postgres')}:"
        f"{os.getenv('POSTGRES_PORT', '5432')}/"
        f"{os.getenv('POSTGRES_DB', 'costa_resiliente')}",
    )


def _parse_count(status: str) -> int:
    """asyncpg execute() returns e.g. 'DELETE 42', parse the row count."""
    try:
        return int(status.split()[-1])
    except (IndexError, ValueError):
        return 0


async def run_retention() -> dict:
    conn = await asyncpg.connect(_dsn())
    results: dict[str, int] = {}
    try:
        # 1. Expired social signals (7-day TTL set at ingest time)
        status = await conn.execute(
            "DELETE FROM social.signals WHERE expires_at < NOW()"
        )
        results["social_signals_deleted"] = _parse_count(status)

        # 2. Old resolved alerts (closed / false_positive > 90 days)
        status = await conn.execute(
            """
            DELETE FROM ops.alerts
            WHERE status IN ('closed', 'false_positive')
              AND updated_at < NOW() - INTERVAL '90 days'
            """
        )
        results["alerts_deleted"] = _parse_count(status)

        # 3. Expired share tokens (30-day TTL)
        status = await conn.execute(
            "DELETE FROM ops.share_tokens WHERE expires_at < NOW()"
        )
        results["share_tokens_deleted"] = _parse_count(status)

        # 4. Old security events (180-day audit window)
        status = await conn.execute(
            "DELETE FROM ops.security_events WHERE created_at < NOW() - INTERVAL '180 days'"
        )
        results["security_events_deleted"] = _parse_count(status)

        logger.info("Retention complete: %s", results)
        return results
    finally:
        await conn.close()
