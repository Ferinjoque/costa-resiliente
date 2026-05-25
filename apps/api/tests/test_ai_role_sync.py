"""Contract tests: costa_ai_ro PostgreSQL role password sync at startup."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestSyncAiRolePassword:
    """_sync_ai_role_password() must keep the DB role in sync with the env var."""

    @pytest.mark.asyncio
    async def test_skips_when_default_placeholder(self):
        """Default password → no ALTER ROLE call (dev mode, no DB needed)."""
        from costa_api.main import _sync_ai_role_password

        executed_sqls: list[str] = []

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=None)
        mock_conn.execute = AsyncMock(side_effect=lambda q, *a, **kw: executed_sqls.append(str(q)))

        with patch("costa_api.main.settings") as mock_settings, \
             patch("costa_api.main.engine") as mock_engine:
            mock_settings.postgres_ai_password = "change_me_in_production"
            mock_engine.connect.return_value = mock_conn

            await _sync_ai_role_password()

        assert executed_sqls == [], "ALTER ROLE must not run when password is the default placeholder"

    @pytest.mark.asyncio
    async def test_calls_alter_role_with_configured_password(self):
        """Non-default password → ALTER ROLE costa_ai_ro PASSWORD executed."""
        from costa_api.main import _sync_ai_role_password

        executed_sqls: list[str] = []

        async def fake_execute(query, *args, **kwargs):
            executed_sqls.append(str(query))
            return MagicMock()

        mock_conn = AsyncMock()
        mock_conn.execute = fake_execute
        mock_conn.commit = AsyncMock()

        mock_ctx = MagicMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_ctx.__aexit__ = AsyncMock(return_value=None)

        secret_pwd = "sup3r-s3cr3t-password-xyz"

        with patch("costa_api.main.settings") as mock_settings, \
             patch("costa_api.main.engine") as mock_engine:
            mock_settings.postgres_ai_password = secret_pwd
            mock_engine.connect.return_value = mock_ctx

            await _sync_ai_role_password()

        assert len(executed_sqls) == 1
        sql = executed_sqls[0]
        assert "ALTER ROLE" in sql.upper()
        assert "costa_ai_ro" in sql
        assert secret_pwd in sql

    @pytest.mark.asyncio
    async def test_does_not_raise_on_db_error(self):
        """DB failure → warning logged, no exception propagated (startup must not block)."""
        from costa_api.main import _sync_ai_role_password

        mock_ctx = MagicMock()
        mock_ctx.__aenter__ = AsyncMock(side_effect=OSError("connection refused"))
        mock_ctx.__aexit__ = AsyncMock(return_value=None)

        with patch("costa_api.main.settings") as mock_settings, \
             patch("costa_api.main.engine") as mock_engine:
            mock_settings.postgres_ai_password = "production-secret-99"
            mock_engine.connect.return_value = mock_ctx

            # Must not raise
            await _sync_ai_role_password()

    @pytest.mark.asyncio
    async def test_password_single_quote_escaped(self):
        """Single quotes in password are escaped to prevent SQL injection."""
        from costa_api.main import _sync_ai_role_password

        executed_sqls: list[str] = []

        async def fake_execute(query, *args, **kwargs):
            executed_sqls.append(str(query))
            return MagicMock()

        mock_conn = AsyncMock()
        mock_conn.execute = fake_execute
        mock_conn.commit = AsyncMock()

        mock_ctx = MagicMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_ctx.__aexit__ = AsyncMock(return_value=None)

        # Password with embedded single quote
        tricky_pwd = "it's-a-secret"

        with patch("costa_api.main.settings") as mock_settings, \
             patch("costa_api.main.engine") as mock_engine:
            mock_settings.postgres_ai_password = tricky_pwd
            mock_engine.connect.return_value = mock_ctx

            await _sync_ai_role_password()

        assert len(executed_sqls) == 1
        sql = executed_sqls[0]
        # Single quote in password must be doubled (SQL escaping)
        assert "it''s-a-secret" in sql
        # Raw unescaped form must NOT appear as a standalone token
        assert "it's-a-secret" not in sql.replace("it''s-a-secret", "")
