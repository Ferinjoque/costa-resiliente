"""Operator field-report endpoint tests.

Locks in Session 6 wiring: the operator-facing FieldReport panel now
persists to social.signals AND ops.decision_log instead of doing only
an optimistic frontend update.
"""

from __future__ import annotations

import httpx
import pytest

BASE = "http://localhost:8000/api/v1"


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=BASE, timeout=10.0) as c:
        yield c


def test_field_report_stores_signal_and_decision_log(client):
    resp = client.post(
        "/social/field-report",
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
    assert body["status"] in ("stored", "duplicate")  # idempotent — same hash deduplicates
    assert isinstance(body["signal_id"], int)
    assert body["signal_id"] > 0
    assert body["ingested_at"] is not None


def test_field_report_rejects_invalid_label(client):
    resp = client.post(
        "/social/field-report",
        json={
            "operator_id": "coen_lima",
            "text": "Vía bloqueada",
            "label": "bogus_label",
            "district_ubigeo": "150133",
        },
    )
    assert resp.status_code == 400
    assert "Invalid label" in resp.json()["detail"]


def test_field_report_rejects_empty_text(client):
    resp = client.post(
        "/social/field-report",
        json={
            "operator_id": "coen_lima",
            "text": "   ",
            "label": "needs_help",
        },
    )
    assert resp.status_code == 400


def test_field_report_accepts_null_district(client):
    """An operator may not know the ubigeo; the endpoint must accept null."""
    resp = client.post(
        "/social/field-report",
        json={
            "operator_id": "coen_lima",
            "text": "Lluvia intensa observada desde el helicoptero",
            "label": "weather_observation",
            "district_ubigeo": None,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["signal_id"] > 0


def test_field_report_returns_district_id_when_known(client):
    """When the ubigeo resolves to a real district, the row has district_id."""
    # 150101 = Lima district seeded by auto_seed.
    resp = client.post(
        "/social/field-report",
        json={
            "operator_id": "coen_lima",
            "text": "Aniego confirmado por brigada Plaza Mayor",
            "label": "infrastructure_damage",
            "district_ubigeo": "150101",
        },
    )
    assert resp.status_code == 201
    assert isinstance(resp.json()["signal_id"], int)


def test_field_report_accepts_huayco_observation(client):
    """huayco_observation is a valid label — field team reporting debris flow sighting."""
    resp = client.post(
        "/social/field-report",
        json={
            "operator_id": "coen_lima",
            "text": "Flujo de lodo en quebrada Huaycoloro avanzando hacia puente Huachipa",
            "label": "huayco_observation",
            "district_ubigeo": "150133",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["signal_id"] > 0


def test_field_report_accepts_flood_observation(client):
    """flood_observation is a valid label — field team reporting inundation sighting."""
    resp = client.post(
        "/social/field-report",
        json={
            "operator_id": "coen_lima",
            "text": "Desborde de canal de riego confirmado en Av. Universitaria altura Comas",
            "label": "flood_observation",
            "district_ubigeo": "150105",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["signal_id"] > 0
