"""Notification subscriber CRUD and delivery log tests."""

from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport

from costa_api.main import app

BASE = "http://test"
AUTH = {"X-Testing-Operator": "1:test_op:coer"}


# ─── GET /notifications ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_subscribers_unauthenticated_returns_401():
    """Subscriber list is operator-only — no auth → 401."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/notifications")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_subscribers_returns_list():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/notifications", headers=AUTH)
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
        }, headers=AUTH)
        assert resp.status_code == 201
        sub = resp.json()
        assert sub["channel"] == "webhook"
        assert sub["active"] is True
        assert "id" in sub
        # cleanup
        await c.delete(f"/api/v1/notifications/{sub['id']}", headers=AUTH)


@pytest.mark.asyncio
async def test_create_subscriber_unauthenticated_returns_401():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/notifications", json={
            "channel": "webhook",
            "target": "https://example.com/hook",
            "label": "No auth",
            "severity_min": "high",
        })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_subscriber_invalid_channel_returns_422():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/notifications", json={
            "channel": "fax",
            "target": "some-target",
            "label": "Bad channel",
            "severity_min": "high",
        }, headers=AUTH)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_subscriber_invalid_severity_returns_422():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/notifications", json={
            "channel": "webhook",
            "target": "https://example.com/hook",
            "label": "Bad sev",
            "severity_min": "apocalyptic",
        }, headers=AUTH)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_subscriber_empty_target_returns_422():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/notifications", json={
            "channel": "email",
            "target": "   ",
            "label": "Empty target",
            "severity_min": "high",
        }, headers=AUTH)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_webhook_private_ip_target_rejected():
    """SSRF guard: webhook target pointing to private IP must return 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/notifications", json={
            "channel": "webhook",
            "target": "http://192.168.1.1/evil",
            "label": "SSRF test",
            "severity_min": "high",
        }, headers=AUTH)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_email_channel_invalid_target_rejected():
    """Email channel must reject invalid email addresses (Session 23 validation)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/notifications", json={
            "channel": "email",
            "target": "notanemail",
            "label": "Invalid email test",
            "severity_min": "high",
        }, headers=AUTH)
    assert resp.status_code == 422, f"Invalid email should return 422, got {resp.status_code}: {resp.text}"


@pytest.mark.asyncio
async def test_email_channel_valid_target_accepted():
    """Valid email address must be accepted for email channel."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/notifications", json={
            "channel": "email",
            "target": "ops-coer@indeci.gob.pe",
            "label": "Valid COER email",
            "severity_min": "high",
        }, headers=AUTH)
    # Email is a stub channel — should succeed (200 or 201)
    assert resp.status_code in (200, 201), f"Valid email should be accepted, got {resp.status_code}: {resp.text}"


@pytest.mark.asyncio
async def test_webhook_localhost_target_rejected():
    """SSRF guard: localhost webhook target must return 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/notifications", json={
            "channel": "webhook",
            "target": "http://127.0.0.1/internal",
            "label": "Localhost SSRF",
            "severity_min": "high",
        }, headers=AUTH)
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
        }, headers=AUTH)
        assert create_resp.status_code == 201
        sub_id = create_resp.json()["id"]

        del_resp = await c.delete(f"/api/v1/notifications/{sub_id}", headers=AUTH)
        assert del_resp.status_code == 204

        subs = (await c.get("/api/v1/notifications", headers=AUTH)).json()
        assert sub_id not in [s["id"] for s in subs]


@pytest.mark.asyncio
async def test_delete_nonexistent_subscriber_returns_404():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.delete("/api/v1/notifications/999999999", headers=AUTH)
    assert resp.status_code == 404


# ─── GET /notifications/deliveries ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_deliveries_unauthenticated_returns_401():
    """Delivery log is operator-only — no auth → 401."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/notifications/deliveries")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_deliveries_returns_list():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/notifications/deliveries", headers=AUTH)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_deliveries_limit_param():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/notifications/deliveries?limit=5", headers=AUTH)
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
        }, headers=AUTH)
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
        }, headers=AUTH)
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
        }, headers=AUTH)
    assert resp.status_code == 422


# ─── DNS SSRF guard unit tests ────────────────────────────────────────────────

def test_reject_private_host_blocks_hostname_resolving_to_private_ip():
    """_reject_private_host must block hostnames that resolve to private IPs (DNS SSRF)."""
    from unittest.mock import patch
    from costa_api.routers.notifications import _reject_private_host

    fake_addrinfo = [(None, None, None, None, ("10.0.0.1", 0))]
    with patch("costa_api.routers.notifications.socket.getaddrinfo", return_value=fake_addrinfo):
        with pytest.raises(ValueError, match="private IP"):
            _reject_private_host("internal.corp.local")


def test_reject_private_host_blocks_link_local_resolved():
    """169.254.x.x (AWS metadata, link-local) resolved via DNS must be blocked."""
    from unittest.mock import patch
    from costa_api.routers.notifications import _reject_private_host

    fake_addrinfo = [(None, None, None, None, ("169.254.169.254", 0))]
    with patch("costa_api.routers.notifications.socket.getaddrinfo", return_value=fake_addrinfo):
        with pytest.raises(ValueError, match="private IP"):
            _reject_private_host("metadata.example.com")


def test_reject_private_host_blocks_unresolvable_hostname():
    """Unresolvable hostname must be blocked (conservative — unknown target = deny)."""
    from unittest.mock import patch
    import socket as _socket
    from costa_api.routers.notifications import _reject_private_host

    with patch("costa_api.routers.notifications.socket.getaddrinfo", side_effect=_socket.gaierror("NXDOMAIN")):
        with pytest.raises(ValueError, match="could not be resolved"):
            _reject_private_host("does-not-exist.invalid")


def test_reject_private_host_allows_public_ip():
    """Public IP must pass the guard without raising."""
    from costa_api.routers.notifications import _reject_private_host
    _reject_private_host("1.1.1.1")  # Cloudflare public DNS — must not raise


def test_reject_private_host_blocks_ipv6_link_local():
    """IPv6 link-local addresses (fe80::/10) must be blocked.

    Regression guard: fe80::/10 was absent from _PRIVATE_NETS before Session 23.
    An attacker could create a webhook targeting fe80::1 to reach link-local services
    on the container network (e.g. metadata endpoints, COER LAN services).
    """
    from costa_api.routers.notifications import _reject_private_host
    with pytest.raises(ValueError, match="private IP blocked"):
        _reject_private_host("fe80::1")


def test_reject_private_host_blocks_ipv6_link_local_variant():
    """Another fe80::/10 variant must also be blocked."""
    from costa_api.routers.notifications import _reject_private_host
    with pytest.raises(ValueError, match="private IP blocked"):
        _reject_private_host("fe80::dead:beef")


# ─── Notifications rate limiter unit tests ───────────────────────────────────

@pytest.mark.asyncio
async def test_notif_rate_limiter_raises_429_when_limit_exceeded():
    """_check_notif_create_rate must raise 429 when Redis counter exceeds _NOTIF_RATE_LIMIT."""
    import os
    from fastapi import HTTPException
    from unittest.mock import AsyncMock, patch
    from costa_api.routers.notifications import _check_notif_create_rate, _NOTIF_RATE_LIMIT

    mock_redis = AsyncMock()
    mock_redis.incr = AsyncMock(return_value=_NOTIF_RATE_LIMIT + 1)
    mock_redis.expire = AsyncMock()

    with (
        patch("costa_api.routers.notifications._get_notif_rl_client", return_value=mock_redis),
        patch.dict(os.environ, {"TESTING": "0"}),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await _check_notif_create_rate("test_operator")

    assert exc_info.value.status_code == 429
    assert "Retry-After" in exc_info.value.headers


@pytest.mark.asyncio
async def test_notif_rate_limiter_fails_open_on_redis_error():
    """Redis unavailability must never block legitimate operators (fail-open)."""
    import os
    from unittest.mock import AsyncMock, patch
    from costa_api.routers.notifications import _check_notif_create_rate

    mock_redis = AsyncMock()
    mock_redis.incr = AsyncMock(side_effect=ConnectionError("Redis down"))

    with (
        patch("costa_api.routers.notifications._get_notif_rl_client", return_value=mock_redis),
        patch.dict(os.environ, {"TESTING": "0"}),
    ):
        await _check_notif_create_rate("test_operator")  # must not raise
