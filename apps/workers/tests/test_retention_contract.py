"""Contract tests for the data retention flow.

Verifies module structure and import correctness without a live DB.
DB-integration is exercised by the daily Prefect run in the container.
"""

from __future__ import annotations

import importlib.util as _util
import pytest

_PREFECT_AVAILABLE = _util.find_spec("prefect") is not None


class TestRetentionModuleContract:
    def test_module_importable(self):
        """retention.py must be importable without a DB connection."""
        from costa_workers.flows import retention  # noqa: F401

    def test_run_retention_callable(self):
        """run_retention must be an async coroutine function."""
        import asyncio
        from costa_workers.flows.retention import run_retention

        assert asyncio.iscoroutinefunction(run_retention)

    def test_dsn_helper_returns_string(self):
        """_dsn() must return a non-empty postgresql:// string regardless of env."""
        from costa_workers.flows.retention import _dsn

        dsn = _dsn()
        assert isinstance(dsn, str)
        assert "postgresql://" in dsn

    @pytest.mark.skipif(not _PREFECT_AVAILABLE, reason="prefect not installed in this env")
    def test_flow_wrapper_importable(self):
        """Prefect flow wrapper in schedules must import retention_flow."""
        from costa_workers.flows.schedules import retention_flow

        assert retention_flow is not None

    @pytest.mark.skipif(not _PREFECT_AVAILABLE, reason="prefect not installed in this env")
    def test_flow_name(self):
        """Flow must be registered under the expected Prefect name."""
        from costa_workers.flows.schedules import retention_flow

        assert retention_flow.name == "run-retention"

    def test_sql_statements_reference_correct_tables(self):
        """Verify retention.py references the expected table names."""
        import inspect
        from costa_workers.flows import retention

        src = inspect.getsource(retention)
        assert "social.signals" in src
        assert "ops.alerts" in src
        assert "ops.share_tokens" in src
        assert "ops.security_events" in src
        assert "expires_at < NOW()" in src

    def test_parse_count_valid_status(self):
        from costa_workers.flows.retention import _parse_count

        assert _parse_count("DELETE 42") == 42
        assert _parse_count("DELETE 0") == 0
        assert _parse_count("DELETE 1") == 1

    def test_parse_count_malformed_returns_zero(self):
        from costa_workers.flows.retention import _parse_count

        assert _parse_count("") == 0
        assert _parse_count("UNEXPECTED") == 0

    def test_retention_registered_in_schedules_source(self):
        """schedules.py must reference retention_flow and the daily cron."""
        import inspect
        from costa_workers.flows import schedules

        src = inspect.getsource(schedules)
        assert "retention_flow" in src
        assert "retention-daily" in src
