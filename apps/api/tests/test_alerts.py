"""Alerts router tests — covers list, action, log, decision-log, export, PDF report.

Uses both ASGI transport (fast, no network) and live httpx for streaming endpoints.
All writes are cleaned up by conftest.py session teardown (decision_log truncate +
alert status restore + new alert delete).
"""

from __future__ import annotations

import csv
import io

import pytest
from httpx import AsyncClient, ASGITransport

from costa_api.main import app

BASE = "http://test"
AUTH = {"X-Testing-Operator": "1:test-op:coer"}


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url=BASE)


# ─── GET /api/v1/alerts ──────────────────────────────────────────────────────

class TestListAlerts:
    @pytest.mark.asyncio
    async def test_returns_200_and_list(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_alert_shape(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts")
        alerts = resp.json()
        if alerts:
            a = alerts[0]
            assert "id" in a
            assert "type" in a
            assert "severity" in a
            assert "status" in a
            assert "title" in a
            assert "created_at" in a

    @pytest.mark.asyncio
    async def test_status_filter(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts?status=active")
        assert resp.status_code == 200
        for a in resp.json():
            assert a["status"] == "active"

    @pytest.mark.asyncio
    async def test_severity_filter(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts?severity=critical")
        assert resp.status_code == 200
        for a in resp.json():
            assert a["severity"] == "critical"

    @pytest.mark.asyncio
    async def test_province_filter_lima(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts?province=Lima")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_province_filter_includes_district_less_alerts(self):
        """Province filter must include rainfall alerts (district_id=NULL).

        Regression guard: before the fix, district-less alerts (rainfall type)
        were excluded from Lima Metro view because the LEFT JOIN returns no province.
        """
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            all_alerts = (await c.get("/api/v1/alerts")).json()
            lima_alerts = (await c.get("/api/v1/alerts?province=Lima")).json()

        # Any alert without a district_id should appear in the Lima province filter
        district_less = [a for a in all_alerts if a.get("district_id") is None]
        lima_ids = {a["id"] for a in lima_alerts}
        for a in district_less:
            assert a["id"] in lima_ids, (
                f"District-less alert {a['id']} ({a['type']}/{a['title']!r}) "
                f"missing from Lima Metro province filter"
            )

    @pytest.mark.asyncio
    async def test_limit_respected(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts?limit=3")
        assert resp.status_code == 200
        assert len(resp.json()) <= 3

    @pytest.mark.asyncio
    async def test_alerts_include_source_refs_field(self):
        """GET /alerts must include source_refs field (dict or list) for each alert."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts")
        assert resp.status_code == 200
        for a in resp.json():
            # source_refs can be None, dict, or list
            assert "source_refs" in a, f"Alert {a.get('id')} missing source_refs"

    @pytest.mark.asyncio
    async def test_test_residue_excluded(self):
        """Alerts seeded by test fixtures must not appear in operator list."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts")
        for a in resp.json():
            title = a.get("title", "")
            assert not title.startswith("Test "), f"test residue: {title!r}"
            assert "<script" not in title.lower(), f"XSS seed in list: {title!r}"
            assert "drop table" not in title.lower(), f"SQLi seed in list: {title!r}"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("valid_status", ["active", "acknowledged", "escalated", "closed", "false_positive"])
    async def test_valid_status_filter_accepted(self, valid_status: str):
        """All DB-valid status values must return 200, not 400."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(f"/api/v1/alerts?status={valid_status}")
        assert resp.status_code == 200, f"status={valid_status!r} should be valid, got {resp.status_code}"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("invalid_status", ["resolved", "dismissed", "unknown", ""])
    async def test_invalid_status_filter_rejected(self, invalid_status: str):
        """Non-DB statuses must be rejected with 400."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(f"/api/v1/alerts?status={invalid_status}")
        # Empty string passes (no filter applied); non-empty invalid strings → 400
        if invalid_status:
            assert resp.status_code == 400, f"status={invalid_status!r} should be invalid, got {resp.status_code}"

    @pytest.mark.asyncio
    async def test_active_alerts_appear_before_closed(self):
        """Active/escalated alerts must appear before closed/acknowledged in default sort.

        Regression guard: prior ORDER BY a.created_at DESC could push active alerts
        out of the LIMIT window when many closed alerts exist. Fix: sort by status
        priority (active=0, escalated=1, else=2) then severity (critical=0, high=1) then created_at DESC.
        """
        from inspect import getsource
        from costa_api.routers.alerts import list_alerts
        src = getsource(list_alerts)
        # Verify the status priority sort is present
        assert "CASE a.status" in src and "THEN 0" in src, (
            "list_alerts must include status-priority sort so active alerts "
            "always appear before closed ones within the LIMIT window"
        )
        # Verify severity sort within status group
        assert "CASE a.severity" in src and "'critical' THEN 0" in src, (
            "list_alerts must sort critical before high within each status group"
        )

        # Integration: active alerts appear in first position when they exist
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            all_resp = await c.get("/api/v1/alerts")
            active_resp = await c.get("/api/v1/alerts?status=active")
        all_alerts = all_resp.json()
        active_alerts = active_resp.json()
        if active_alerts and all_alerts:
            # First returned alert should be active or escalated (highest priority)
            first_status = all_alerts[0].get("status")
            assert first_status in ("active", "escalated"), (
                f"First returned alert should be active/escalated, got {first_status!r}. "
                "Active alerts should always appear before closed ones."
            )

        # Critical before high within active group
        if len(active_alerts) > 1:
            severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
            for i in range(len(active_alerts) - 1):
                si = severity_order.get(active_alerts[i].get("severity", "low"), 3)
                si1 = severity_order.get(active_alerts[i+1].get("severity", "low"), 3)
                assert si <= si1, (
                    f"Active alerts out of severity order at position {i}: "
                    f"{active_alerts[i]['severity']} before {active_alerts[i+1]['severity']}"
                )


# ─── POST /api/v1/alerts/{id}/action ─────────────────────────────────────────

class TestAlertAction:
    @pytest.mark.asyncio
    async def test_acknowledge_active_alert(self):
        """Acknowledge the first active alert; expect new_status=acknowledged."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            alerts = (await c.get("/api/v1/alerts?status=active&limit=1")).json()
            if not alerts:
                pytest.skip("no active alerts available")
            alert_id = alerts[0]["id"]
            resp = await c.post(
                f"/api/v1/alerts/{alert_id}/action",
                json={
                    "operator_id": "test-op",
                    "action": "acknowledge",
                    "note": "unit test ack",
                    "session_id": "test-session",
                },
                headers=AUTH,
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["alert_id"] == alert_id
        assert body["new_status"] == "acknowledged"

    @pytest.mark.asyncio
    async def test_action_status_transitions_all_valid_types(self):
        """Each valid action must result in the correct ops.alerts status transition.

        Regression guard: no test previously verified escalate→escalated,
        false_positive→false_positive, close→closed transitions.
        A bug where action=close returned 200 but left status=active would be undetected.
        """
        ACTION_STATUS = {
            "acknowledge":    "acknowledged",
            "escalate":       "escalated",
            "false_positive": "false_positive",
            "close":          "closed",
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            alerts = (await c.get("/api/v1/alerts?status=active&limit=5")).json()
            if len(alerts) < 4:
                pytest.skip("need at least 4 active alerts to test all transitions")
            for i, (action, expected_status) in enumerate(ACTION_STATUS.items()):
                alert_id = alerts[i]["id"]
                resp = await c.post(
                    f"/api/v1/alerts/{alert_id}/action",
                    json={"action": action, "note": f"test {action}"},
                    headers=AUTH,
                )
                assert resp.status_code == 200, f"action={action!r} must return 200, got {resp.status_code}"
                body = resp.json()
                assert body["new_status"] == expected_status, (
                    f"action={action!r} must set new_status={expected_status!r}, got {body['new_status']!r}"
                )
                assert "age_seconds" in body, f"action={action!r} response must include age_seconds"

    @pytest.mark.asyncio
    async def test_idempotent_action_returns_200(self):
        """Applying the same action twice must return 200 (idempotent no-op).

        Regression guard: prior code unconditionally updated status so duplicate
        escalations (two operators clicking simultaneously) fired double fan-out
        notifications. Fix: if alert already in target status, return 200 immediately.
        """
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            alerts = (await c.get("/api/v1/alerts?status=active&limit=1")).json()
            if not alerts:
                pytest.skip("no active alerts available")
            alert_id = alerts[0]["id"]
            # First ack
            r1 = await c.post(f"/api/v1/alerts/{alert_id}/action",
                              json={"action": "acknowledge"}, headers=AUTH)
            assert r1.status_code == 200
            # Second ack — must also return 200 (idempotent)
            r2 = await c.post(f"/api/v1/alerts/{alert_id}/action",
                              json={"action": "acknowledge"}, headers=AUTH)
            assert r2.status_code == 200, (
                "Idempotent alert action must return 200 when alert already in target status"
            )
            assert r2.json()["new_status"] == "acknowledged"
            # Session 23: both paths (new + idempotent) must include age_seconds
            assert "age_seconds" in r2.json(), "Idempotent response must include age_seconds for consistent SLA chip updates"
            assert r2.json()["age_seconds"] >= 0, "age_seconds must be non-negative"

    @pytest.mark.asyncio
    async def test_action_unauthenticated_returns_401(self):
        """No auth header → 401 before any DB operations."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            alerts = (await c.get("/api/v1/alerts?limit=1")).json()
            if not alerts:
                pytest.skip("no alerts available")
            resp = await c.post(
                f"/api/v1/alerts/{alerts[0]['id']}/action",
                json={"operator_id": "attacker", "action": "close"},
            )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_reject_invalid_action(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            alerts = (await c.get("/api/v1/alerts?limit=1")).json()
            if not alerts:
                pytest.skip("no alerts available")
            alert_id = alerts[0]["id"]
            resp = await c.post(
                f"/api/v1/alerts/{alert_id}/action",
                json={"operator_id": "test-op", "action": "delete_everything"},
                headers=AUTH,
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_404_on_nonexistent_alert(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post(
                "/api/v1/alerts/999999999/action",
                json={"operator_id": "test-op", "action": "acknowledge"},
                headers=AUTH,
            )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_all_valid_actions_accepted(self):
        """Each of the 4 valid action strings returns 200 when alert exists."""
        valid = ["acknowledge", "escalate", "false_positive", "close"]
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            alerts = (await c.get("/api/v1/alerts?limit=1")).json()
            if not alerts:
                pytest.skip("no alerts available")
            alert_id = alerts[0]["id"]
            for action in valid:
                resp = await c.post(
                    f"/api/v1/alerts/{alert_id}/action",
                    json={"operator_id": "test-op", "action": action},
                    headers=AUTH,
                )
                assert resp.status_code == 200, f"action={action!r} returned {resp.status_code}"

    @pytest.mark.asyncio
    async def test_note_over_2000_chars_rejected(self):
        """AlertAction.note has max_length=2000; oversized note must return 422."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            alerts = (await c.get("/api/v1/alerts?limit=1")).json()
            if not alerts:
                pytest.skip("no alerts available")
            resp = await c.post(
                f"/api/v1/alerts/{alerts[0]['id']}/action",
                json={"operator_id": "test-op", "action": "acknowledge", "note": "N" * 2001},
                headers=AUTH,
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_operator_id_over_100_chars_rejected(self):
        """AlertAction.operator_id has max_length=100; oversized value must return 422."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            alerts = (await c.get("/api/v1/alerts?limit=1")).json()
            if not alerts:
                pytest.skip("no alerts available")
            resp = await c.post(
                f"/api/v1/alerts/{alerts[0]['id']}/action",
                json={"operator_id": "x" * 101, "action": "acknowledge"},
                headers=AUTH,
            )
        assert resp.status_code == 422


# ─── POST /api/v1/alerts/log ─────────────────────────────────────────────────

class TestLogDecision:
    @pytest.mark.asyncio
    async def test_log_dispatch_entry(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post(
                "/api/v1/alerts/log",
                json={
                    "operator_id": "test-op",
                    "action_type": "resource_dispatch",
                    "alert_id": None,
                    "payload": {"resource_name": "Unidad COEN Lima-Sur", "destination": "Lurigancho"},
                    "session_id": "test-session",
                },
                headers=AUTH,
            )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    @pytest.mark.asyncio
    async def test_log_protocol_step(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post(
                "/api/v1/alerts/log",
                json={
                    "operator_id": "test-op",
                    "action_type": "protocol_step",
                    "payload": {"step": "Activar COE distrital", "protocol": "INDECI-flood-v2"},
                },
                headers=AUTH,
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_log_arbitrary_payload(self):
        """Payload is free-form JSON — any shape must be accepted."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post(
                "/api/v1/alerts/log",
                json={
                    "operator_id": "test-op",
                    "action_type": "note",
                    "payload": {"note": "Reporte verbal del alcalde de Chosica"},
                },
                headers=AUTH,
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_log_unauthenticated_returns_401(self):
        """No auth header → 401."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post(
                "/api/v1/alerts/log",
                json={
                    "operator_id": "attacker",
                    "action_type": "note",
                    "payload": {"note": "unauthorized entry"},
                },
            )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_log_invalid_action_type_rejected(self):
        """Unknown action_type must return 422 — protects audit-trail integrity."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post(
                "/api/v1/alerts/log",
                json={
                    "action_type": "dispach",  # typo — not in whitelist
                    "payload": {"note": "typo test"},
                },
                headers=AUTH,
            )
        assert resp.status_code == 422, f"Typo action_type should be rejected, got {resp.status_code}: {resp.text}"

    @pytest.mark.asyncio
    async def test_log_valid_action_types_accepted(self):
        """All known action types must be accepted."""
        valid_types = ["dispatch", "resource_dispatch", "protocol_step", "note", "checklist"]
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            for atype in valid_types:
                resp = await c.post(
                    "/api/v1/alerts/log",
                    json={"action_type": atype, "payload": {"test": True}},
                    headers=AUTH,
                )
                assert resp.status_code == 200, f"action_type={atype!r} should be valid, got {resp.status_code}"

    @pytest.mark.asyncio
    async def test_alerts_include_age_seconds(self):
        """GET /alerts must include age_seconds (server-side age) to eliminate client clock skew."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts")
        assert resp.status_code == 200
        alerts = resp.json()
        if alerts:
            a = alerts[0]
            assert "age_seconds" in a, "AlertSummary must include age_seconds"
            if a["age_seconds"] is not None:
                assert isinstance(a["age_seconds"], int), "age_seconds must be int"
                assert a["age_seconds"] >= 0, "age_seconds must be non-negative"


# ─── GET /api/v1/alerts/decision-log ─────────────────────────────────────────

class TestDecisionLog:
    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self):
        """Decision log is operator-only — no auth header → 401."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_returns_list(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log", headers=AUTH)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_entry_shape(self):
        # Seed a known entry then verify it comes back with the right shape
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            await c.post(
                "/api/v1/alerts/log",
                json={
                    "operator_id": "test-op",
                    "action_type": "note",
                    "payload": {"note": "shape test"},
                },
                headers=AUTH,
            )
            resp = await c.get("/api/v1/alerts/decision-log?limit=10", headers=AUTH)
        entries = resp.json()
        assert entries, "decision log is empty after seeding"
        e = entries[0]
        assert "id" in e
        assert "logged_at" in e
        assert "operator_id" in e
        assert "action_type" in e
        assert "payload" in e

    @pytest.mark.asyncio
    async def test_operator_filter(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            await c.post(
                "/api/v1/alerts/log",
                json={
                    "operator_id": "test-op",
                    "action_type": "note",
                    "payload": {"note": "operator filter test"},
                },
                headers=AUTH,
            )
            # AUTH header username is "test-op" — that's what gets stored
            resp = await c.get(
                "/api/v1/alerts/decision-log?operator_id=test-op&limit=20",
                headers=AUTH,
            )
        entries = resp.json()
        for e in entries:
            assert e["operator_id"] == "test-op"

    @pytest.mark.asyncio
    async def test_limit_respected(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log?limit=2", headers=AUTH)
        assert len(resp.json()) <= 2

    @pytest.mark.asyncio
    async def test_since_filter_future_returns_empty(self):
        """Since=far-future should return zero rows."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(
                "/api/v1/alerts/decision-log?since=2099-01-01T00:00:00Z",
                headers=AUTH,
            )
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_until_filter_past_returns_empty(self):
        """Until=far-past should return zero rows."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(
                "/api/v1/alerts/decision-log?until=2000-01-01T00:00:00Z",
                headers=AUTH,
            )
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_payload_null_does_not_crash(self):
        """Decision log endpoint must not crash on entries with NULL payload.

        Regression guard: prior code used dict(r._mapping['payload']) which
        raises TypeError when payload is None (some action types allow null).
        Fix: coerce None → {}.
        """
        from inspect import getsource
        from costa_api.routers.alerts import list_decision_log
        src = getsource(list_decision_log)
        # Verify the NULL guard is present in the source
        assert 'if r._mapping["payload"]' in src or "if r._mapping.get" in src, (
            "list_decision_log must guard against NULL payload to avoid TypeError"
        )

        # Integration: endpoint returns 200 (does not 500 on existing null payloads)
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log?limit=50", headers=AUTH)
        assert resp.status_code == 200, (
            f"Decision log must return 200 even when entries have NULL payload, got {resp.status_code}"
        )
        for entry in resp.json():
            assert isinstance(entry.get("payload"), dict), (
                f"Entry {entry.get('id')} payload must be dict (not None), got {type(entry.get('payload'))}"
            )


# ─── GET /api/v1/alerts/decision-log/export ──────────────────────────────────

class TestDecisionLogExport:
    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self):
        """Export endpoint is operator-only — no auth → 401."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log/export")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_returns_csv(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log/export?limit=10", headers=AUTH)
        assert resp.status_code == 200
        assert "text/csv" in resp.headers.get("content-type", "")

    @pytest.mark.asyncio
    async def test_csv_has_headers(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log/export?limit=10", headers=AUTH)
        reader = csv.DictReader(io.StringIO(resp.text))
        assert "id" in (reader.fieldnames or [])
        assert "operator_id" in (reader.fieldnames or [])
        assert "action_type" in (reader.fieldnames or [])
        assert "payload_json" in (reader.fieldnames or [])
        # Session 23: CSV export must include performance analysis columns
        assert "duration_ms" in (reader.fieldnames or []), (
            "CSV export must include duration_ms column for post-incident performance analysis (Session 23)"
        )
        assert "mode" in (reader.fieldnames or []), (
            "CSV export must include mode column (sitrep/quick/full) for query path analysis (Session 23)"
        )

    @pytest.mark.asyncio
    async def test_csv_date_range_suffix_in_filename(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(
                "/api/v1/alerts/decision-log/export"
                "?since=2026-05-01T00:00:00Z&until=2026-05-31T23:59:59Z",
                headers=AUTH,
            )
        assert resp.status_code == 200
        cd = resp.headers.get("content-disposition", "")
        assert "20260501" in cd, f"date range not in filename: {cd!r}"
        assert "20260531" in cd, f"date range end not in filename: {cd!r}"

    @pytest.mark.asyncio
    async def test_csv_content_parseable(self):
        """Each row in the CSV must parse cleanly via DictReader."""
        # Seed a row first
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            await c.post(
                "/api/v1/alerts/log",
                json={
                    "operator_id": "test-op",
                    "action_type": "export",
                    "payload": {"note": "CSV parse test"},
                },
                headers=AUTH,
            )
            resp = await c.get("/api/v1/alerts/decision-log/export?limit=20", headers=AUTH)
        reader = csv.DictReader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) >= 1
        for row in rows:
            assert row["id"].isdigit() or row["id"] == ""


# ─── GET /api/v1/alerts/decision-log/report ──────────────────────────────────

class TestDecisionLogReport:
    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self):
        """PDF report endpoint is operator-only — no auth → 401."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log/report")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_returns_pdf(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log/report?limit=5", headers=AUTH)
        assert resp.status_code == 200
        assert "application/pdf" in resp.headers.get("content-type", "")

    @pytest.mark.asyncio
    async def test_pdf_has_pdf_magic_bytes(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log/report?limit=5", headers=AUTH)
        assert resp.content[:4] == b"%PDF", "response is not a valid PDF"

    @pytest.mark.asyncio
    async def test_pdf_content_disposition(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log/report?limit=5", headers=AUTH)
        cd = resp.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert ".pdf" in cd

    @pytest.mark.asyncio
    async def test_pdf_with_operator_filter(self):
        """Report with operator_id filter must still return a valid PDF."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(
                "/api/v1/alerts/decision-log/report?operator_id=test-op&limit=5",
                headers=AUTH,
            )
        assert resp.status_code == 200
        assert resp.content[:4] == b"%PDF"

    @pytest.mark.asyncio
    async def test_pdf_with_date_range(self):
        """Report with since/until params returns a valid PDF (date-range filtering parity with CSV)."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(
                "/api/v1/alerts/decision-log/report"
                "?since=2026-01-01T00:00:00Z&until=2099-12-31T23:59:59Z&limit=5",
                headers=AUTH,
            )
        assert resp.status_code == 200
        assert resp.content[:4] == b"%PDF"

    @pytest.mark.asyncio
    async def test_pdf_far_future_since_yields_empty_log_section(self):
        """Since=far-future → log section has 0 entries but PDF still renders."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(
                "/api/v1/alerts/decision-log/report?since=2099-01-01T00:00:00Z&limit=5",
                headers=AUTH,
            )
        assert resp.status_code == 200
        assert resp.content[:4] == b"%PDF"


# ─── Limit validation (ge=1) ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_decision_log_limit_zero_returns_422():
    """limit=0 must be rejected — ge=1 validator prevents zero-row queries."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/alerts/decision-log?limit=0", headers=AUTH)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_decision_log_export_limit_zero_returns_422():
    """CSV export limit=0 must be rejected."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/alerts/decision-log/export?limit=0", headers=AUTH)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_decision_log_report_limit_zero_returns_422():
    """PDF report limit=0 must be rejected."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/alerts/decision-log/report?limit=0", headers=AUTH)
    assert resp.status_code == 422
