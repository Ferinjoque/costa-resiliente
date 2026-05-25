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
    async def test_limit_respected(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts?limit=3")
        assert resp.status_code == 200
        assert len(resp.json()) <= 3

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
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["alert_id"] == alert_id
        assert body["new_status"] == "acknowledged"

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
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_404_on_nonexistent_alert(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post(
                "/api/v1/alerts/999999999/action",
                json={"operator_id": "test-op", "action": "acknowledge"},
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
                )
                assert resp.status_code == 200, f"action={action!r} returned {resp.status_code}"


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
            )
        assert resp.status_code == 200


# ─── GET /api/v1/alerts/decision-log ─────────────────────────────────────────

class TestDecisionLog:
    @pytest.mark.asyncio
    async def test_returns_list(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log")
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
            )
            resp = await c.get("/api/v1/alerts/decision-log?limit=10")
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
            )
            resp = await c.get("/api/v1/alerts/decision-log?operator_id=test-op&limit=20")
        entries = resp.json()
        for e in entries:
            assert e["operator_id"] == "test-op"

    @pytest.mark.asyncio
    async def test_limit_respected(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log?limit=2")
        assert len(resp.json()) <= 2

    @pytest.mark.asyncio
    async def test_since_filter_future_returns_empty(self):
        """Since=far-future should return zero rows."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log?since=2099-01-01T00:00:00Z")
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_until_filter_past_returns_empty(self):
        """Until=far-past should return zero rows."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log?until=2000-01-01T00:00:00Z")
        assert resp.status_code == 200
        assert resp.json() == []


# ─── GET /api/v1/alerts/decision-log/export ──────────────────────────────────

class TestDecisionLogExport:
    @pytest.mark.asyncio
    async def test_returns_csv(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log/export?limit=10")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers.get("content-type", "")

    @pytest.mark.asyncio
    async def test_csv_has_headers(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log/export?limit=10")
        reader = csv.DictReader(io.StringIO(resp.text))
        assert "id" in (reader.fieldnames or [])
        assert "operator_id" in (reader.fieldnames or [])
        assert "action_type" in (reader.fieldnames or [])
        assert "payload_json" in (reader.fieldnames or [])

    @pytest.mark.asyncio
    async def test_csv_date_range_suffix_in_filename(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(
                "/api/v1/alerts/decision-log/export"
                "?since=2026-05-01T00:00:00Z&until=2026-05-31T23:59:59Z"
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
            )
            resp = await c.get("/api/v1/alerts/decision-log/export?limit=20")
        reader = csv.DictReader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) >= 1
        for row in rows:
            assert row["id"].isdigit() or row["id"] == ""


# ─── GET /api/v1/alerts/decision-log/report ──────────────────────────────────

class TestDecisionLogReport:
    @pytest.mark.asyncio
    async def test_returns_pdf(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log/report?limit=5")
        assert resp.status_code == 200
        assert "application/pdf" in resp.headers.get("content-type", "")

    @pytest.mark.asyncio
    async def test_pdf_has_pdf_magic_bytes(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log/report?limit=5")
        assert resp.content[:4] == b"%PDF", "response is not a valid PDF"

    @pytest.mark.asyncio
    async def test_pdf_content_disposition(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/alerts/decision-log/report?limit=5")
        cd = resp.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert ".pdf" in cd

    @pytest.mark.asyncio
    async def test_pdf_with_operator_filter(self):
        """Report with operator_id filter must still return a valid PDF."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(
                "/api/v1/alerts/decision-log/report?operator_id=test-op&limit=5"
            )
        assert resp.status_code == 200
        assert resp.content[:4] == b"%PDF"
