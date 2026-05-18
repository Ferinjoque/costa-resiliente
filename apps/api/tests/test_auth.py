"""Auth endpoint tests — JWT issuance, /me, /operators, and unauthorized access."""

from __future__ import annotations

import pytest
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


# ─── JWT decode errors ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tampered_token_returns_401():
    token = await _login()
    parts = token.split(".")
    tampered = parts[0] + "." + parts[1] + ".invalidsignature"
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tampered}"})
    assert resp.status_code == 401
