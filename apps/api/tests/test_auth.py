"""Auth endpoint tests: JWT issuance, /me, /operators, and unauthorized access."""

from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import Request
from httpx import AsyncClient, ASGITransport

from costa_api.main import app

BASE = "http://test"


async def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url=BASE)


async def _login(username: str = "coer_lima", password: str = "demo1234") -> str:
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/auth/token",
            data={"username": username, "password": password, "grant_type": "password"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


# ─── POST /auth/token ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_coer_returns_token():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/auth/token",
            data={"username": "coer_lima", "password": "demo1234", "grant_type": "password"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["role"] == "coer"
    assert body["district_ubigeo"] is None
    assert body["username"] == "coer_lima"
    assert "full_name" in body
    assert len(body["full_name"]) > 0


@pytest.mark.asyncio
async def test_login_coel_returns_district():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/auth/token",
            data={"username": "coel_sjl", "password": "demo1234", "grant_type": "password"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["role"] == "coel"
    assert body["district_ubigeo"] == "150132"


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/auth/token",
            data={"username": "coer_lima", "password": "wrong", "grant_type": "password"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_user_returns_401():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/auth/token",
            data={"username": "nobody", "password": "demo1234", "grant_type": "password"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    assert resp.status_code == 401


# ─── GET /auth/me ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_me_returns_current_operator():
    token = await _login()
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["username"] == "coer_lima"
    assert body["role"] == "coer"
    assert "password_hash" not in body


@pytest.mark.asyncio
async def test_me_without_token_returns_401():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_with_invalid_token_returns_401():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/auth/me", headers={"Authorization": "Bearer not.a.valid.token"})
    assert resp.status_code == 401


# ─── GET /auth/operators ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_operators_returns_all_three():
    token = await _login("coen_lima")
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/auth/operators", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    ops = resp.json()
    assert len(ops) >= 3
    usernames = {o["username"] for o in ops}
    assert {"coer_lima", "coen_lima", "coel_sjl"}.issubset(usernames)


@pytest.mark.asyncio
async def test_list_operators_without_auth_returns_401():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/auth/operators")
    assert resp.status_code == 401


# ─── Rate limiter ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rate_limiter_raises_429_when_limit_exceeded():
    """_check_rate_limit must raise 429 when Redis counter exceeds _RATE_LIMIT."""
    from fastapi import HTTPException
    from costa_api.routers.auth import _check_rate_limit, _RATE_LIMIT

    # Build a minimal Request-like object with a known client IP
    scope = {"type": "http", "headers": [], "query_string": b""}
    mock_request = MagicMock(spec=Request)
    mock_request.headers = {}
    mock_request.client = MagicMock()
    mock_request.client.host = "10.0.0.1"

    mock_redis = AsyncMock()
    mock_redis.incr = AsyncMock(return_value=_RATE_LIMIT + 1)
    mock_redis.expire = AsyncMock()

    with (
        patch("costa_api.routers.auth.TESTING", False),
        patch("costa_api.routers.auth._get_rl_client", return_value=mock_redis),
        patch.dict(os.environ, {"TESTING": "0"}),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await _check_rate_limit(mock_request)

    assert exc_info.value.status_code == 429
    assert "Retry-After" in exc_info.value.headers


@pytest.mark.asyncio
async def test_rate_limiter_allows_up_to_limit():
    """Requests at exactly _RATE_LIMIT must pass without raising."""
    from costa_api.routers.auth import _check_rate_limit, _RATE_LIMIT

    mock_request = MagicMock(spec=Request)
    mock_request.headers = {}
    mock_request.client = MagicMock()
    mock_request.client.host = "10.0.0.2"

    mock_redis = AsyncMock()
    mock_redis.incr = AsyncMock(return_value=_RATE_LIMIT)
    mock_redis.expire = AsyncMock()

    with (
        patch("costa_api.routers.auth.TESTING", False),
        patch("costa_api.routers.auth._get_rl_client", return_value=mock_redis),
        patch.dict(os.environ, {"TESTING": "0"}),
    ):
        # Should not raise
        await _check_rate_limit(mock_request)


@pytest.mark.asyncio
async def test_rate_limiter_fails_open_when_redis_unavailable():
    """Redis outage must not block logins: fail-open."""
    from costa_api.routers.auth import _check_rate_limit

    mock_request = MagicMock(spec=Request)
    mock_request.headers = {}
    mock_request.client = MagicMock()
    mock_request.client.host = "10.0.0.3"

    mock_redis = AsyncMock()
    mock_redis.incr = AsyncMock(side_effect=ConnectionError("Redis down"))

    with (
        patch("costa_api.routers.auth.TESTING", False),
        patch("costa_api.routers.auth._get_rl_client", return_value=mock_redis),
        patch.dict(os.environ, {"TESTING": "0"}),
    ):
        # Must not raise even though Redis is broken
        await _check_rate_limit(mock_request)


# ─── Canonical username from DB (not raw form input) ─────────────────────────

@pytest.mark.asyncio
async def test_login_returns_db_canonical_username():
    """Token and response username must come from the DB record, not raw form input.

    Regression guard: prior code used `form.username` (raw input) for both the JWT
    claim and the TokenResponse. Using the DB canonical value ensures audit-trail
    attribution is consistent even if operators differ in case or whitespace.
    """
    from inspect import getsource
    from costa_api.routers.auth import issue_token
    src = getsource(issue_token)

    # The fix adds `username` to the SELECT and uses `canonical_username`
    assert "canonical_username" in src, (
        "issue_token must select and use the DB canonical username, "
        "not form.username, for the token claim and response"
    )
    assert 'row["username"]' in src, (
        "issue_token must read username from the DB row for canonical attribution"
    )


# ─── JWT decode errors ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tampered_token_returns_401():
    token = await _login()
    parts = token.split(".")
    tampered = parts[0] + "." + parts[1] + ".invalidsignature"
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tampered}"})
    assert resp.status_code == 401


# ─── POST /auth/operators ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_operator_as_coen_succeeds():
    token = await _login("coen_lima")
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/auth/operators",
            json={
                "username": "test_coel_temp",
                "full_name": "Test COEL temp",
                "role": "coel",
                "district_ubigeo": "150101",
                "password": "testpass99",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["username"] == "test_coel_temp"
    assert body["role"] == "coel"
    assert body["district_ubigeo"] == "150101"
    assert "password_hash" not in body


@pytest.mark.asyncio
async def test_create_operator_as_coel_forbidden():
    token = await _login("coel_sjl")
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/auth/operators",
            json={
                "username": "test_extra_op",
                "full_name": "Should fail",
                "role": "coel",
                "district_ubigeo": "150101",
                "password": "testpass99",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_operator_invalid_role_returns_422():
    token = await _login("coen_lima")
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/auth/operators",
            json={
                "username": "test_bad_role",
                "full_name": "Bad role",
                "role": "admin",
                "password": "testpass99",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_coel_without_district_returns_422():
    token = await _login("coen_lima")
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/auth/operators",
            json={
                "username": "test_coel_nodist",
                "full_name": "COEL without district",
                "role": "coel",
                "password": "testpass99",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_operator_duplicate_username_returns_409():
    token = await _login("coen_lima")
    payload = {
        "username": "test_dup_409",
        "full_name": "Duplicate test",
        "role": "coer",
        "password": "testpass99",
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        r1 = await c.post("/api/v1/auth/operators", json=payload, headers={"Authorization": f"Bearer {token}"})
        r2 = await c.post("/api/v1/auth/operators", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert r1.status_code == 201
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_create_operator_without_auth_returns_401():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/auth/operators",
            json={
                "username": "test_noauth",
                "full_name": "No auth",
                "role": "coer",
                "password": "testpass99",
            },
        )
    assert resp.status_code == 401
