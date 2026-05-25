"""Notification subscriber CRUD and delivery log tests."""

from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport

from costa_api.main import app

BASE = "http://test"


# ─── GET /notifications ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_subscribers_returns_list():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/notifications")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# ─── POST /notifications ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_webhook_subscriber():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/notifications", json={
            "channel": "webhook",
            "target": "https://example.com/hook",
            "label": "Test webhook",
            "severity_min": "high",
        })
        assert resp.status_code == 201
        sub = resp.json()
        assert sub["channel"] == "webhook"
        assert sub["active"] is True
        assert "id" in sub
        # cleanup
        await c.delete(f"/api/v1/notifications/{sub['id']}")


@pytest.mark.asyncio
async def test_create_subscriber_invalid_channel_returns_422():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/notifications", json={
            "channel": "fax",
            "target": "some-target",
            "label": "Bad channel",
            "severity_min": "high",
        })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_subscriber_invalid_severity_returns_422():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/notifications", json={
            "channel": "webhook",
            "target": "https://example.com/hook",
            "label": "Bad sev",
            "severity_min": "apocalyptic",
        })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_subscriber_empty_target_returns_422():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/notifications", json={
            "channel": "email",
            "target": "   ",
            "label": "Empty target",
            "severity_min": "high",
        })
    assert resp.status_code == 422


# ─── DELETE /notifications/{id} ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_subscriber_soft_deactivates():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        create_resp = await c.post("/api/v1/notifications", json={
            "channel": "sms_stub",
            "target": "+51999000000",
            "label": "SMS test",
            "severity_min": "critical",
        })
        assert create_resp.status_code == 201
        sub_id = create_resp.json()["id"]

        del_resp = await c.delete(f"/api/v1/notifications/{sub_id}")
        assert del_resp.status_code == 204

        subs = (await c.get("/api/v1/notifications")).json()
        assert sub_id not in [s["id"] for s in subs]


@pytest.mark.asyncio
async def test_delete_nonexistent_subscriber_returns_404():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.delete("/api/v1/notifications/999999999")
    assert resp.status_code == 404


# ─── GET /notifications/deliveries ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_deliveries_returns_list():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/notifications/deliveries")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_deliveries_limit_param():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/notifications/deliveries?limit=5")
    assert resp.status_code == 200
    assert len(resp.json()) <= 5


# ─── SubscriberCreate field constraint tests ──────────────────────────────────

@pytest.mark.asyncio
async def test_subscriber_label_over_100_chars_rejected():
    """SubscriberCreate.label has max_length=100; longer must be rejected."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/notifications", json={
            "channel": "webhook",
            "target": "https://example.com/hook",
            "label": "L" * 101,
            "severity_min": "high",
        })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_subscriber_target_over_500_chars_rejected():
    """SubscriberCreate.target has max_length=500; longer must be rejected."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/notifications", json={
            "channel": "webhook",
            "target": "https://example.com/" + "x" * 490,
            "label": "Big target",
            "severity_min": "high",
        })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_subscriber_district_filter_over_12_chars_rejected():
    """SubscriberCreate.district_filter has max_length=12; longer must be rejected."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/notifications", json={
            "channel": "sms_stub",
            "target": "+51999000001",
            "label": "District test",
            "severity_min": "high",
            "district_filter": "1" * 13,
        })
    assert resp.status_code == 422
