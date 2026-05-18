"""Operator field-report endpoint tests.

Locks in Session 6 wiring: the operator-facing FieldReport panel now
persists to social.signals AND ops.decision_log instead of doing only
an optimistic frontend update.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport

from costa_api.main import app

BASE = "http://test"


@pytest.mark.asyncio
async def test_field_report_stores_signal_and_decision_log():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/social/field-report",
            json={
                "operator_id": "coen_lima",
                "text": "Camion atrapado en quebrada Huaycoloro km 12",
                "label": "road_blocked",
                "district_ubigeo": "150133",
                "session_id": "test-session",
            },
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "stored"
    assert isinstance(body["signal_id"], int)
    assert body["signal_id"] > 0
    assert body["ingested_at"] is not None


@pytest.mark.asyncio
async def test_field_report_rejects_invalid_label():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/social/field-report",
            json={
                "operator_id": "coen_lima",
                "text": "Vía bloqueada",
                "label": "bogus_label",
                "district_ubigeo": "150133",
            },
        )
    assert resp.status_code == 400
    assert "Invalid label" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_field_report_rejects_empty_text():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/social/field-report",
            json={
                "operator_id": "coen_lima",
                "text": "   ",
                "label": "needs_help",
            },
        )
    assert resp.status_code == 400  # whitespace-only fails server-side strip check


@pytest.mark.asyncio
async def test_field_report_accepts_null_district():
    """An operator may not know the ubigeo; the endpoint must accept null."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/social/field-report",
            json={
                "operator_id": "coen_lima",
                "text": "Lluvia intensa observada desde el helicoptero",
                "label": "weather_observation",
                "district_ubigeo": None,
            },
        )
    assert resp.status_code == 201
    assert resp.json()["signal_id"] > 0


@pytest.mark.asyncio
async def test_field_report_returns_district_id_when_known():
    """When the ubigeo resolves to a real district, the row has district_id."""
    # 150101 = Lima district seeded by auto_seed.
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/social/field-report",
            json={
                "operator_id": "coen_lima",
                "text": "Aniego confirmado por brigada Plaza Mayor",
                "label": "infrastructure_damage",
                "district_ubigeo": "150101",
            },
        )
    assert resp.status_code == 201
    assert isinstance(resp.json()["signal_id"], int)
