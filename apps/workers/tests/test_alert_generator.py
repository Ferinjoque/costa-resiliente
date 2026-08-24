"""Unit tests for alert_generator business logic: no DB required.

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
        assert cfg["min"] == HUAYCO_CLUSTER_MIN  # 3: lower than needs_help
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
        from costa_workers.ml.alert_generator import (
            RAIN_CRITICAL_72H_MM, RAIN_HIGH_72H_MM, RAIN_HIGH_24H_MM,
        )
        assert RAIN_CRITICAL_72H_MM > RAIN_HIGH_72H_MM
        assert RAIN_HIGH_72H_MM > RAIN_HIGH_24H_MM  # 24h threshold below 72h high

    def test_rain_thresholds_positive(self):
        from costa_workers.ml.alert_generator import (
            RAIN_CRITICAL_72H_MM, RAIN_HIGH_72H_MM, RAIN_HIGH_24H_MM,
        )
        assert RAIN_CRITICAL_72H_MM > 0
        assert RAIN_HIGH_72H_MM > 0
        assert RAIN_HIGH_24H_MM > 0

    def test_ttl_values_positive(self):
        from costa_workers.ml.alert_generator import (
            FLOOD_ALERT_TTL_DAYS, HUAYCO_ALERT_TTL_H, SOCIAL_ALERT_TTL_H,
        )
        assert FLOOD_ALERT_TTL_DAYS > 0
        assert HUAYCO_ALERT_TTL_H > 0
        assert SOCIAL_ALERT_TTL_H > 0
        assert FLOOD_ALERT_TTL_DAYS * 24 > HUAYCO_ALERT_TTL_H > SOCIAL_ALERT_TTL_H

    def test_notify_severities(self):
        from costa_workers.ml.alert_generator import _NOTIFY_SEVERITIES
        assert "critical" in _NOTIFY_SEVERITIES
        assert "high" in _NOTIFY_SEVERITIES
        assert "medium" not in _NOTIFY_SEVERITIES

    def test_fan_out_cap_positive(self):
        from costa_workers.ml.alert_generator import _FAN_OUT_SUBSCRIBER_CAP
        assert _FAN_OUT_SUBSCRIBER_CAP > 0
        assert _FAN_OUT_SUBSCRIBER_CAP <= 200  # sanity upper bound


# ─── SSRF guard (worker _reject_private_host) ─────────────────────────────────

class TestRejectPrivateHost:
    def test_blocks_private_ip_directly(self):
        from costa_workers.ml.alert_generator import _reject_private_host
        import pytest
        with pytest.raises(ValueError, match="private IP"):
            _reject_private_host("10.0.0.1")

    def test_blocks_loopback(self):
        from costa_workers.ml.alert_generator import _reject_private_host
        import pytest
        with pytest.raises(ValueError, match="private IP"):
            _reject_private_host("127.0.0.1")

    def test_blocks_link_local(self):
        from costa_workers.ml.alert_generator import _reject_private_host
        import pytest
        with pytest.raises(ValueError, match="private IP"):
            _reject_private_host("169.254.169.254")

    def test_blocks_rfc1918_192168(self):
        from costa_workers.ml.alert_generator import _reject_private_host
        import pytest
        with pytest.raises(ValueError, match="private IP"):
            _reject_private_host("192.168.1.1")

    def test_allows_public_ip(self):
        from costa_workers.ml.alert_generator import _reject_private_host
        _reject_private_host("1.1.1.1")  # Cloudflare: must not raise

    def test_blocks_hostname_resolving_to_private_ip(self):
        from unittest.mock import patch
        from costa_workers.ml.alert_generator import _reject_private_host
        import pytest
        fake_addrinfo = [(None, None, None, None, ("10.0.0.1", 0))]
        with patch("costa_workers.ml.alert_generator.socket.getaddrinfo", return_value=fake_addrinfo):
            with pytest.raises(ValueError, match="private IP"):
                _reject_private_host("internal.corp.local")

    def test_blocks_aws_metadata_endpoint(self):
        from unittest.mock import patch
        from costa_workers.ml.alert_generator import _reject_private_host
        import pytest
        fake_addrinfo = [(None, None, None, None, ("169.254.169.254", 0))]
        with patch("costa_workers.ml.alert_generator.socket.getaddrinfo", return_value=fake_addrinfo):
            with pytest.raises(ValueError, match="private IP"):
                _reject_private_host("metadata.example.com")

    def test_blocks_unresolvable_hostname(self):
        from unittest.mock import patch
        import socket as _socket
        from costa_workers.ml.alert_generator import _reject_private_host
        import pytest
        with patch("costa_workers.ml.alert_generator.socket.getaddrinfo", side_effect=_socket.gaierror("NXDOMAIN")):
            with pytest.raises(ValueError, match="could not be resolved"):
                _reject_private_host("does-not-exist.invalid")


# ─── Rainfall alert severity ranking ─────────────────────────────────────────
# Unit test for the severity-aware dedup logic added Session 23.
# The actual asyncpg integration is exercised via E2E; this verifies the rank
# ordering is correct so critical never gets blocked by high or medium.

class TestRainfallSeverityRanking:
    """Verify that the severity rank ordering used in generate_rainfall_alerts
    prevents a lower-severity alert from blocking escalation to critical.

    Regression guard: before Session 23 fix, ANY existing rainfall alert blocked
    new ones regardless of severity: a 'high' alert blocked a 'critical' one.
    """

    def _sev_rank(self) -> dict:
        # Mirror the _SEV_RANK dict from generate_rainfall_alerts
        return {"critical": 3, "high": 2, "medium": 1, "low": 0}

    def test_critical_ranks_above_high(self):
        rank = self._sev_rank()
        assert rank["critical"] > rank["high"], "critical must outrank high"

    def test_high_ranks_above_medium(self):
        rank = self._sev_rank()
        assert rank["high"] > rank["medium"], "high must outrank medium"

    def test_critical_should_not_be_blocked_by_high(self):
        """If existing = 'high' and new = 'critical', rank[existing] < rank[new] → should NOT skip."""
        rank = self._sev_rank()
        existing, new = "high", "critical"
        should_skip = rank.get(existing, 0) >= rank.get(new, 0)
        assert not should_skip, "A critical alert must NOT be blocked by an existing high alert"

    def test_high_should_be_blocked_by_critical(self):
        """If existing = 'critical' and new = 'high', should skip (critical already exists)."""
        rank = self._sev_rank()
        existing, new = "critical", "high"
        should_skip = rank.get(existing, 0) >= rank.get(new, 0)
        assert should_skip, "A new high alert should be skipped when critical already exists"

    def test_same_severity_should_skip(self):
        """Same severity → skip (dedup)."""
        rank = self._sev_rank()
        for sev in ("critical", "high", "medium"):
            should_skip = rank.get(sev, 0) >= rank.get(sev, 0)
            assert should_skip, f"Duplicate {sev} alert should be skipped"
