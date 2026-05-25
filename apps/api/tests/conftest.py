"""Pytest configuration and shared fixtures for costa-api tests.

DB cleanup strategy
-------------------
Tests write to ops.alerts (status changes), ops.decision_log,
ops.share_tokens, and ops.alert_proposals. This conftest captures
pre-test state and restores it after the session so the production DB
remains clean between test runs.
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone

import asyncpg
import pytest


TEST_OPERATOR = "test-op"


def _db_dsn() -> str:
    if url := os.getenv("DATABASE_URL"):
        return url
    host = os.getenv("POSTGRES_HOST", "postgres")
    port = os.getenv("POSTGRES_PORT", "5432")
    db   = os.getenv("POSTGRES_DB", "costa_resiliente")
    user = os.getenv("POSTGRES_USER", "costa")
    pw   = os.getenv("POSTGRES_PASSWORD", "change_me_in_production")
    return f"postgresql://{user}:{pw}@{host}:{port}/{db}"


async def _take_snapshot() -> dict:
    """Capture alert statuses and token IDs before tests run."""
    pool = await asyncpg.create_pool(_db_dsn(), min_size=1, max_size=2)
    try:
        alerts = await pool.fetch("SELECT id, status FROM ops.alerts")
        tokens = await pool.fetch("SELECT id FROM ops.share_tokens")
        return {
            "alert_statuses": {r["id"]: r["status"] for r in alerts},
            "token_ids_before": {r["id"] for r in tokens},
            "test_start": datetime.now(timezone.utc),
        }
    finally:
        await pool.close()


async def _do_restore(snap: dict) -> None:
    """Remove or revert all data written during the test session."""
    pool = await asyncpg.create_pool(_db_dsn(), min_size=1, max_size=2)
    try:
        # 1. decision_log — TRUNCATE bypasses append-only row trigger
        await pool.execute("TRUNCATE TABLE ops.decision_log")

        # 2. alert_proposals created by tests (by test operator or during test window)
        await pool.execute(
            "DELETE FROM ops.alert_proposals WHERE proposed_by = $1",
            TEST_OPERATOR,
        )
        await pool.execute(
            "DELETE FROM ops.alert_proposals WHERE created_at >= $1",
            snap["test_start"],
        )

        # 3. share_tokens created during tests
        await pool.execute(
            "DELETE FROM ops.share_tokens WHERE created_at >= $1",
            snap["test_start"],
        )

        # 4. Reset alert statuses changed by tests
        for alert_id, original_status in snap["alert_statuses"].items():
            await pool.execute(
                "UPDATE ops.alerts SET status = $1, updated_at = NOW() WHERE id = $2 AND status != $1",
                original_status,
                alert_id,
            )

        # 5. Delete alert rows that didn't exist before tests (unlikely but safe)
        #    Must delete notification_deliveries referencing those alerts first
        #    (FK has no ON DELETE CASCADE).
        await pool.execute(
            "DELETE FROM ops.notification_deliveries WHERE alert_id IN "
            "(SELECT id FROM ops.alerts WHERE created_at >= $1)",
            snap["test_start"],
        )
        await pool.execute(
            "DELETE FROM ops.alerts WHERE created_at >= $1",
            snap["test_start"],
        )
    finally:
        await pool.close()


def pytest_configure(config: pytest.Config) -> None:
    """
    Force session-scoped event loops for all async tests.
    Without this, SQLAlchemy's asyncpg global pool holds connections from
    the first test's loop; subsequent tests get a new loop and pool cleanup
    raises 'Event loop is closed'.
    pytest-asyncio 1.x removed the event_loop fixture override; use ini cache instead.
    """
    config._inicache["asyncio_default_test_loop_scope"] = "session"  # type: ignore[attr-defined]
    # Disable rate-limiting and other TESTING guards during the test suite.
    os.environ.setdefault("TESTING", "1")


@pytest.fixture(scope="session", autouse=True)
def db_cleanup():
    """Session-scoped autouse fixture: snapshot before tests, restore after."""
    snap = asyncio.run(_take_snapshot())
    yield
    asyncio.run(_do_restore(snap))
