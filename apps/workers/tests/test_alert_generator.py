"""Unit tests for alert_generator business logic — no DB required.

Covers threshold functions, cluster config structure, and severity mappings.
The live asyncpg integration (generate_* tasks) is exercised via E2E only.
"""

from __future__ import annotations

import pytest


# ─── Severity functions ────────────────────────────────────────────────────────

class TestFloodSeverity:
    def _sev(self, area: float) -> str:
        from costa_workers.ml.alert_generator import _flood_severity
        return _flood_severity(area)

    def test_critical_threshold(self):
        assert self._sev(5.0) == "critical"
        assert self._sev(10.0) == "critical"

    def test_high_threshold(self):
        assert self._sev(1.0) == "high"
        assert self._sev(4.9) == "high"

    def test_medium_threshold(self):
        assert self._sev(0.1) == "medium"
        assert self._sev(0.99) == "medium"

    def test_boundary_exactly_5(self):
        assert self._sev(5.0) == "critical"

    def test_boundary_exactly_1(self):
        assert self._sev(1.0) == "high"


class TestSocialSeverity:
    def _sev(self, count: int) -> str:
        from costa_workers.ml.alert_generator import _social_severity
        return _social_severity(count)

    def test_high_at_10(self):
        assert self._sev(10) == "high"
        assert self._sev(50) == "high"

    def test_medium_below_10(self):
        assert self._sev(5) == "medium"
        assert self._sev(9) == "medium"


# ─── Cluster config structure ─────────────────────────────────────────────────

class TestSocialClusterConfigs:
    def test_three_configs_exist(self):
        from costa_workers.ml.alert_generator import _SOCIAL_CLUSTER_CONFIGS
        assert len(_SOCIAL_CLUSTER_CONFIGS) == 3

    def test_needs_help_config(self):
        from costa_workers.ml.alert_generator import _SOCIAL_CLUSTER_CONFIGS, SOCIAL_CLUSTER_MIN
        cfg = next(c for c in _SOCIAL_CLUSTER_CONFIGS if "needs_help" in c["labels"])
        assert cfg["min"] == SOCIAL_CLUSTER_MIN  # 5
        assert cfg["severity_fn"](10) == "high"
        assert cfg["severity_fn"](5) == "medium"
        assert cfg["alert_type"] == "social_cluster"

    def test_huayco_observation_config(self):
        from costa_workers.ml.alert_generator import _SOCIAL_CLUSTER_CONFIGS, HUAYCO_CLUSTER_MIN
        cfg = next(c for c in _SOCIAL_CLUSTER_CONFIGS if "huayco_observation" in c["labels"])
        assert cfg["min"] == HUAYCO_CLUSTER_MIN  # 3 — lower than needs_help
        assert cfg["severity_fn"](3) == "critical"  # even at threshold = critical
        assert cfg["alert_type"] == "social_cluster"

    def test_flood_observation_config(self):
        from costa_workers.ml.alert_generator import _SOCIAL_CLUSTER_CONFIGS, SOCIAL_CLUSTER_MIN
        cfg = next(c for c in _SOCIAL_CLUSTER_CONFIGS if "flood_observation" in c["labels"])
        assert cfg["min"] == SOCIAL_CLUSTER_MIN  # 5
        assert cfg["alert_type"] == "social_cluster"

    def test_huayco_threshold_lower_than_social(self):
        from costa_workers.ml.alert_generator import HUAYCO_CLUSTER_MIN, SOCIAL_CLUSTER_MIN
        assert HUAYCO_CLUSTER_MIN < SOCIAL_CLUSTER_MIN

    def test_all_configs_have_required_keys(self):
        from costa_workers.ml.alert_generator import _SOCIAL_CLUSTER_CONFIGS
        required = {"labels", "min", "alert_type", "title_fn", "desc_fn", "severity_fn"}
        for cfg in _SOCIAL_CLUSTER_CONFIGS:
            assert required.issubset(cfg.keys()), f"Missing keys in config: {cfg}"

    def test_title_fn_callable(self):
        from costa_workers.ml.alert_generator import _SOCIAL_CLUSTER_CONFIGS
        for cfg in _SOCIAL_CLUSTER_CONFIGS:
            title = cfg["title_fn"](5, "Lima", cfg["labels"][0])
            assert isinstance(title, str)
            assert len(title) > 0

    def test_desc_fn_callable(self):
        from costa_workers.ml.alert_generator import _SOCIAL_CLUSTER_CONFIGS
        for cfg in _SOCIAL_CLUSTER_CONFIGS:
            desc = cfg["desc_fn"](5, "Lima", cfg["labels"][0])
            assert isinstance(desc, str)
            assert len(desc) > 0


# ─── Constants ────────────────────────────────────────────────────────────────

class TestConstants:
    def test_flood_min_km2(self):
        from costa_workers.ml.alert_generator import FLOOD_ALERT_MIN_KM2
        assert FLOOD_ALERT_MIN_KM2 > 0

    def test_rain_thresholds_ordered(self):
        from costa_workers.ml.alert_generator import RAIN_CRITICAL_72H_MM, RAIN_HIGH_72H_MM
        assert RAIN_CRITICAL_72H_MM > RAIN_HIGH_72H_MM

    def test_notify_severities(self):
        from costa_workers.ml.alert_generator import _NOTIFY_SEVERITIES
        assert "critical" in _NOTIFY_SEVERITIES
        assert "high" in _NOTIFY_SEVERITIES
        assert "medium" not in _NOTIFY_SEVERITIES
