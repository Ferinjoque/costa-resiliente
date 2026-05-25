"""Operator field-report endpoint tests.

Locks in Session 6 wiring: the operator-facing FieldReport panel now
persists to social.signals AND ops.decision_log instead of doing only
an optimistic frontend update.

Session 16 adds auth guard to /social/field-report; fixture gets a real JWT
using demo credentials (coer_lima:demo1234) for write calls.
"""

from __future__ import annotations

import httpx
import pytest

BASE = "http://localhost:8000/api/v1"


@pytest.fixture(scope="module")
def client():
    """Live httpx client with JWT from demo credentials.  Falls back to no auth
    so Pydantic 422 tests still exercise validation even when server is down.
    """
    auth_headers: dict = {}
    try:
        with httpx.Client(base_url=BASE, timeout=10.0) as boot:
            r = boot.post(
                "/auth/token",
                data={"username": "coer_lima", "password": "demo1234", "grant_type": "password"},
            )
            if r.status_code == 200:
                auth_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    except Exception:
        pass
    with httpx.Client(base_url=BASE, timeout=10.0, headers=auth_headers) as c:
        yield c


def test_field_report_stores_signal_and_decision_log(client):
    resp = client.post(
        "/social/field-report",
        json={
            "operator_id": "coer_lima",
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


def test_field_report_unauthenticated_returns_401():
    """No auth header → 401 before any DB operations."""
    with httpx.Client(base_url=BASE, timeout=10.0) as c:
        resp = c.post(
            "/social/field-report",
            json={
                "operator_id": "coer_lima",
                "text": "Test sin auth",
                "label": "weather_observation",
            },
        )
    assert resp.status_code == 401


def test_field_report_rejects_invalid_label(client):
    resp = client.post(
        "/social/field-report",
        json={
            "operator_id": "coer_lima",
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
            "operator_id": "coer_lima",
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
            "operator_id": "coer_lima",
            "text": "Lluvia intensa observada desde el helicoptero",
            "label": "weather_observation",
            "district_ubigeo": None,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["signal_id"] > 0


def test_field_report_returns_district_id_when_known(client):
    """When the ubigeo resolves to a real district, the row has district_id."""
    resp = client.post(
        "/social/field-report",
        json={
            "operator_id": "coer_lima",
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
            "operator_id": "coer_lima",
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
            "operator_id": "coer_lima",
            "text": "Desborde de canal de riego confirmado en Av. Universitaria altura Comas",
            "label": "flood_observation",
            "district_ubigeo": "150105",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["signal_id"] > 0


# ─── Pydantic constraint enforcement ─────────────────────────────────────────

def test_field_report_rejects_text_over_2000_chars(client):
    """FieldReport.text has max_length=2000; longer should be rejected."""
    resp = client.post(
        "/social/field-report",
        json={
            "operator_id": "coer_lima",
            "text": "X" * 2001,
            "label": "needs_help",
        },
    )
    assert resp.status_code == 422


def test_field_report_rejects_empty_operator_id(client):
    """FieldReport.operator_id has min_length=1; empty should be rejected."""
    resp = client.post(
        "/social/field-report",
        json={
            "operator_id": "",
            "text": "Válido texto de reporte",
            "label": "needs_help",
        },
    )
    assert resp.status_code == 422


def test_field_report_rejects_label_over_40_chars(client):
    """FieldReport.label has max_length=40; longer should be rejected."""
    resp = client.post(
        "/social/field-report",
        json={
            "operator_id": "coer_lima",
            "text": "Reporte válido",
            "label": "x" * 41,
        },
    )
    assert resp.status_code == 422


def test_field_report_rejects_district_ubigeo_over_12_chars(client):
    """FieldReport.district_ubigeo has max_length=12; longer should be rejected."""
    resp = client.post(
        "/social/field-report",
        json={
            "operator_id": "coer_lima",
            "text": "Reporte válido",
            "label": "needs_help",
            "district_ubigeo": "1" * 13,
        },
    )
    assert resp.status_code == 422


def test_field_report_rejects_session_id_over_64_chars(client):
    """FieldReport.session_id has max_length=64; longer should be rejected."""
    resp = client.post(
        "/social/field-report",
        json={
            "operator_id": "coer_lima",
            "text": "Reporte válido",
            "label": "needs_help",
            "session_id": "s" * 65,
        },
    )
    assert resp.status_code == 422


# ─── Idempotent duplicate behavior ────────────────────────────────────────────

def test_field_report_duplicate_returns_existing_signal(client):
    """Submitting identical text from same authenticated operator twice returns existing signal."""
    payload = {
        "operator_id": "coer_lima",
        "text": "Prueba deduplicación de reporte campo exacto",
        "label": "needs_help",
    }
    r1 = client.post("/social/field-report", json=payload)
    r2 = client.post("/social/field-report", json=payload)
    assert r1.status_code == 201
    assert r2.status_code == 201
    b1, b2 = r1.json(), r2.json()
    assert b1["signal_id"] == b2["signal_id"]
    assert b2["status"] == "duplicate"
