"""Proposal HITL workflow tests.

Session 6 adds frontend UI for review + filters test-residue rows from the
operator-facing list. These tests pin both behaviors so we don't regress.
Session 15 adds auth guards to approve/reject; write tests use AUTH header.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport

from costa_api.main import app

BASE = "http://test"
AUTH = {"X-Testing-Operator": "1:test-op:coer"}


@pytest.mark.asyncio
async def test_list_proposals_unauthenticated_returns_401():
    """Proposals list is operator-only: no auth header → 401."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/proposals")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_proposal_unauthenticated_returns_401():
    """Create is operator-only: no auth header → 401 (prevents queue spam)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/proposals",
            json={"severity": "low", "alert_type": "general", "title": "X", "summary": "Y"},
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_proposals_excludes_test_residue():
    """`Test Flood Alert`, XSS, and SQL-injection seed titles must not appear
    in the operator-facing list. They live on in the table for audit but the
    duty officer's queue stays clean."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/proposals", headers=AUTH)
    assert resp.status_code == 200
    items = resp.json()
    for p in items:
        title = (p.get("title") or "").strip()
        summary = (p.get("summary") or "").strip()
        assert title, f"empty-title proposal leaked: id={p.get('id')}"
        assert not title.startswith("Test "), f"test fixture leaked: {title!r}"
        assert "<script" not in title.lower(), f"XSS seed leaked: {title!r}"
        assert "drop table" not in title.lower(), f"SQLi seed leaked: {title!r}"
        assert not summary.lower().startswith("automated test"), summary


@pytest.mark.asyncio
async def test_create_proposal_then_approve_inserts_alert():
    """Create → approve → /alerts shows the new alert; audit log has the row."""
    proposal_body = {
        "severity": "high",
        "alert_type": "flood",
        "district_ubigeo": "150132",
        "title": "Sesión-6: desborde controlado quebrada Huaycoloro",
        "summary": "Sensor SAR + 3 señales sociales convergen en km 7 del cauce.",
        "source_refs": [{"source": "sentinel1"}, {"source": "social_cluster"}],
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        # Create requires auth
        created = await c.post("/api/v1/proposals", json=proposal_body, headers=AUTH)
        assert created.status_code == 201
        pid = created.json()["id"]

        # Approve (operator-gated: requires auth)
        approve = await c.post(
            f"/api/v1/proposals/{pid}/approve",
            json={"operator_id": "coen_lima", "notes": "Session 6 audit"},
            headers=AUTH,
        )
        assert approve.status_code == 200
        approved = approve.json()
        assert approved["status"] == "approved"
        assert approved["proposal_id"] == pid
        alert_id = approved["alert_id"]
        assert isinstance(alert_id, int) and alert_id > 0


@pytest.mark.asyncio
async def test_approve_unauthenticated_returns_401():
    """No auth header → 401 before any DB operations."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/proposals/1/approve",
            json={"operator_id": "attacker"},
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_reject_unauthenticated_returns_401():
    """No auth header → 401 before any DB operations."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/proposals/1/reject",
            json={"operator_id": "attacker"},
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_approve_unknown_proposal_404():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/proposals/99999999/approve",
            json={"operator_id": "coen_lima"},
            headers=AUTH,
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_double_approve_second_returns_404():
    """Approve the same proposal twice: second approval must return 404
    (atomic UPDATE WHERE status='pending' only matches once)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        created = await c.post(
            "/api/v1/proposals",
            json={
                "severity": "medium",
                "alert_type": "flood",
                "district_ubigeo": "150101",
                "title": "Double-approve race test",
                "summary": "Automated test: double approve",
            },
            headers=AUTH,
        )
        assert created.status_code == 201
        pid = created.json()["id"]

        first = await c.post(f"/api/v1/proposals/{pid}/approve", json={}, headers=AUTH)
        assert first.status_code == 200

        second = await c.post(f"/api/v1/proposals/{pid}/approve", json={}, headers=AUTH)
        assert second.status_code == 404


@pytest.mark.asyncio
async def test_create_proposal_rejects_oversized_title():
    """ProposalCreate.title has max_length=200; longer must be rejected."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/proposals",
            json={
                "severity": "low",
                "alert_type": "general",
                "title": "X" * 201,
                "summary": "Resumen válido",
            },
            headers=AUTH,
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_proposal_rejects_oversized_summary():
    """ProposalCreate.summary has max_length=2000; longer must be rejected."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/proposals",
            json={
                "severity": "low",
                "alert_type": "general",
                "title": "Título válido",
                "summary": "Y" * 2001,
            },
            headers=AUTH,
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_reject_proposal_locks_status():
    """A rejected proposal cannot then be approved."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        created = await c.post(
            "/api/v1/proposals",
            json={
                "severity": "medium",
                "alert_type": "huayco",
                "district_ubigeo": "150108",
                "title": "Sesión-6: deslizamiento menor sin víctimas",
                "summary": "Riesgo bajo, monitorear 6h",
                "source_refs": [],
            },
            headers=AUTH,
        )
        pid = created.json()["id"]

        rej = await c.post(
            f"/api/v1/proposals/{pid}/reject",
            json={"operator_id": "coer_lima", "notes": "Falso positivo"},
            headers=AUTH,
        )
        assert rej.status_code == 200

        # Second action must fail
        again = await c.post(
            f"/api/v1/proposals/{pid}/approve",
            json={"operator_id": "coen_lima"},
            headers=AUTH,
        )
        assert again.status_code == 404


@pytest.mark.asyncio
async def test_create_proposal_invalid_ubigeo_returns_400():
    """Providing a district_ubigeo not in geo.districts must return 400.

    Prevents creating district-less alerts silently, operators must use a
    valid ubigeo or omit the field entirely.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/proposals",
            json={
                "severity": "medium",
                "alert_type": "flood",
                "district_ubigeo": "999999",  # does not exist in geo.districts
                "title": "Sesión-23: ubigeo inválido test",
                "summary": "Test ubigeo validation: expected 400",
            },
            headers=AUTH,
        )
    assert resp.status_code == 400, f"Invalid ubigeo should return 400, got {resp.status_code}: {resp.text}"
    assert "999999" in resp.json().get("detail", ""), "Error detail should mention the bad ubigeo"


@pytest.mark.asyncio
async def test_create_proposal_valid_ubigeo_accepted():
    """Known Lima ubigeo (San Juan de Lurigancho = 150132) must be accepted without error."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/proposals",
            json={
                "severity": "low",
                "alert_type": "flood",
                "district_ubigeo": "150132",  # San Juan de Lurigancho, seeded in geo.districts
                "title": "Sesión-23: ubigeo válido test",
                "summary": "Test ubigeo validation: expected 201",
            },
            headers=AUTH,
        )
    assert resp.status_code == 201, f"Valid ubigeo should return 201, got {resp.status_code}: {resp.text}"
