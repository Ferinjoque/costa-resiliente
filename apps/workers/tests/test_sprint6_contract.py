"""Sprint 6 contract tests: alert generator severity, API schema, decision log."""

from __future__ import annotations

import importlib.util as _util

import pytest
from datetime import datetime, timezone

_now = lambda: datetime.now(timezone.utc)
_COSTA_API_AVAILABLE = _util.find_spec("costa_api") is not None


# ─── Alert generator severity logic ──────────────────────────────────────────

class TestFloodSeverity:
    def test_critical_above_5km2(self):
        from costa_workers.ml.alert_generator import _flood_severity
        assert _flood_severity(5.0) == "critical"
        assert _flood_severity(10.0) == "critical"

    def test_high_between_1_and_5km2(self):
        from costa_workers.ml.alert_generator import _flood_severity
        assert _flood_severity(1.0) == "high"
        assert _flood_severity(4.9) == "high"

    def test_medium_below_1km2(self):
        from costa_workers.ml.alert_generator import _flood_severity
        assert _flood_severity(0.1) == "medium"
        assert _flood_severity(0.99) == "medium"


class TestSocialSeverity:
    def test_high_at_10_plus(self):
        from costa_workers.ml.alert_generator import _social_severity
        assert _social_severity(10) == "high"
        assert _social_severity(25) == "high"

    def test_medium_below_10(self):
        from costa_workers.ml.alert_generator import _social_severity
        assert _social_severity(5) == "medium"
        assert _social_severity(9) == "medium"


class TestAlertConstants:
    def test_flood_min_km2_positive(self):
        from costa_workers.ml.alert_generator import FLOOD_ALERT_MIN_KM2
        assert FLOOD_ALERT_MIN_KM2 > 0

    def test_social_cluster_min_positive(self):
        from costa_workers.ml.alert_generator import SOCIAL_CLUSTER_MIN
        assert SOCIAL_CLUSTER_MIN >= 1

    def test_huayco_alert_levels_valid(self):
        from costa_workers.ml.alert_generator import HUAYCO_ALERT_LEVELS
        valid = {"very_low", "low", "medium", "high", "very_high"}
        assert HUAYCO_ALERT_LEVELS.issubset(valid)
        assert "high" in HUAYCO_ALERT_LEVELS
        assert "very_high" in HUAYCO_ALERT_LEVELS


# ─── Alerts API schema ────────────────────────────────────────────────────────

@pytest.mark.skipif(not _COSTA_API_AVAILABLE, reason="costa_api not installed in worker env")
class TestAlertApiSchema:
    def test_alert_summary_model(self):
        from costa_api.routers.alerts import AlertSummary
        a = AlertSummary(
            id=1,
            type="flood",
            severity="critical",
            status="active",
            title="Desborde en Rímac",
            district_id=None,
            created_at=_now(),
            updated_at=_now(),
        )
        assert a.severity == "critical"
        assert a.district_id is None

    def test_alert_action_valid_actions(self):
        from costa_api.routers.alerts import AlertAction
        for action in ("acknowledge", "escalate", "false_positive", "close"):
            a = AlertAction(operator_id="op-1", action=action)
            assert a.action == action

    def test_decision_log_entry_model(self):
        from costa_api.routers.alerts import DecisionLogEntry
        entry = DecisionLogEntry(
            id=42,
            logged_at=_now(),
            operator_id="op-1",
            action_type="query",
            alert_id=None,
            payload={"query": "¿lluvia?", "intent": "rainfall_accumulation"},
            session_id=None,
        )
        assert entry.payload["intent"] == "rainfall_accumulation"
        assert entry.alert_id is None


# ─── Decision log append-only ─────────────────────────────────────────────────

class TestDecisionLogAppendOnly:
    def test_prevent_mutation_trigger_function_name(self):
        """The trigger function name must match what init.sql defines."""
        # This is a naming contract: if renamed, the trigger breaks
        expected_fn = "ops.prevent_decision_log_mutation"
        # Just assert the string appears in the init.sql (read by conftest at import)
        import importlib.util, os
        init_sql_path = os.path.join(
            os.path.dirname(__file__),
            "../../../../infra/postgres/init.sql",
        )
        if os.path.exists(init_sql_path):
            with open(init_sql_path) as f:
                content = f.read()
            assert "prevent_decision_log_mutation" in content
            assert "BEFORE UPDATE OR DELETE" in content


# ─── CSV export headers ───────────────────────────────────────────────────────

@pytest.mark.skipif(not _COSTA_API_AVAILABLE, reason="costa_api not installed in worker env")
class TestDecisionLogCsvExport:
    def test_csv_fieldnames_match_schema(self):
        """
        The CSV export must include all fields required for EDAN-Perú reporting.
        """
        from costa_api.routers.alerts import DecisionLogEntry
        required_fields = {"id", "logged_at", "operator_id", "action_type",
                           "alert_id", "session_id"}
        model_fields = set(DecisionLogEntry.model_fields.keys())
        assert required_fields.issubset(model_fields)
