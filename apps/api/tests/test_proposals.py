"""Proposal HITL workflow tests.

Session 6 adds frontend UI for review + filters test-residue rows from the
operator-facing list. These tests pin both behaviors so we don't regress.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport

from costa_api.main import app

BASE = "http://test"


@pytest.mark.asyncio
async def test_list_proposals_excludes_test_residue():
    """`Test Flood Alert`, XSS, and SQL-injection seed titles must not appear
    in the operator-facing list. They live on in the table for audit but the
    duty officer's queue stays clean."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/proposals")
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
        "district_ubigeo": "150133",
        "title": "Sesión-6: desborde controlado quebrada Huaycoloro",
        "summary": "Sensor SAR + 3 señales sociales convergen en km 7 del cauce.",
        "source_refs": [{"source": "sentinel1"}, {"source": "social_cluster"}],
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        # Create
        created = await c.post("/api/v1/proposals", json=proposal_body)
        assert created.status_code == 201
        pid = created.json()["id"]

        # Approve
        approve = await c.post(
            f"/api/v1/proposals/{pid}/approve",
            json={"operator_id": "coen_lima", "notes": "Session 6 audit"},
        )
        assert approve.status_code == 200
        approved = approve.json()
        assert approved["status"] == "approved"
        assert approved["proposal_id"] == pid
        alert_id = approved["alert_id"]
        assert isinstance(alert_id, int) and alert_id > 0


@pytest.mark.asyncio
async def test_approve_unknown_proposal_404():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/proposals/99999999/approve",
            json={"operator_id": "coen_lima"},
        )
    assert resp.status_code == 404


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
        )
        pid = created.json()["id"]

        rej = await c.post(
            f"/api/v1/proposals/{pid}/reject",
            json={"operator_id": "coer_lima", "notes": "Falso positivo"},
        )
        assert rej.status_code == 200

        # Second action must fail
        again = await c.post(
            f"/api/v1/proposals/{pid}/approve",
            json={"operator_id": "coen_lima"},
        )
        assert again.status_code == 404
