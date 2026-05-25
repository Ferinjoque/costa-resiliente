"""Share token tests — mint + resolve scenario snapshots.

Covers: valid mint, invalid layer, invalid timeWindow, resolve by token,
404 for unknown token, 404 for malformed token.
Tokens created here are cleaned up by conftest.py (ops.share_tokens DELETE).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport

from costa_api.main import app

BASE = "http://test"
AUTH = {"X-Testing-Operator": "1:test-op:coer"}

VALID_SCENARIO = {
    "scenario": {
        "districtUbigeo": "150118",
        "districtName": "Lurigancho",
        "timeWindowHours": 24,
        "isReplayMode": False,
        "replayDate": None,
        "activeLayers": ["districts", "flood", "social"],
    }
}


class TestMintShareToken:
    @pytest.mark.asyncio
    async def test_mint_returns_201(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post("/api/v1/share", json=VALID_SCENARIO, headers=AUTH)
        assert resp.status_code == 201

    @pytest.mark.asyncio
    async def test_mint_unauthenticated_returns_401(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post("/api/v1/share", json=VALID_SCENARIO)
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_mint_response_shape(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post("/api/v1/share", json=VALID_SCENARIO, headers=AUTH)
        body = resp.json()
        assert "token" in body
        assert "url" in body
        assert "expires_at" in body
        assert len(body["token"]) >= 20

    @pytest.mark.asyncio
    async def test_mint_url_contains_token(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post("/api/v1/share", json=VALID_SCENARIO, headers=AUTH)
        body = resp.json()
        assert body["token"] in body["url"]

    @pytest.mark.asyncio
    async def test_reject_unknown_layer(self):
        body = {
            "scenario": {**VALID_SCENARIO["scenario"], "activeLayers": ["districts", "bogus_layer"]}
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post("/api/v1/share", json=body, headers=AUTH)
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_reject_invalid_time_window(self):
        body = {
            "scenario": {**VALID_SCENARIO["scenario"], "timeWindowHours": 99}
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post("/api/v1/share", json=body, headers=AUTH)
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_all_valid_time_windows(self):
        for hours in (1, 3, 6, 12, 24, 72, 168):
            body = {"scenario": {**VALID_SCENARIO["scenario"], "timeWindowHours": hours}}
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
                resp = await c.post("/api/v1/share", json=body, headers=AUTH)
            assert resp.status_code == 201, f"timeWindowHours={hours} rejected"

    @pytest.mark.asyncio
    async def test_replay_mode_scenario(self):
        body = {
            "scenario": {
                **VALID_SCENARIO["scenario"],
                "isReplayMode": True,
                "replayDate": "2026-05-01",
            }
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post("/api/v1/share", json=body, headers=AUTH)
        assert resp.status_code == 201


class TestResolveShareToken:
    @pytest.mark.asyncio
    async def test_resolve_valid_token(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            mint = await c.post("/api/v1/share", json=VALID_SCENARIO, headers=AUTH)
            token = mint.json()["token"]
            resolve = await c.get(f"/api/v1/share/{token}")
        assert resolve.status_code == 200

    @pytest.mark.asyncio
    async def test_resolve_returns_scenario(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            mint = await c.post("/api/v1/share", json=VALID_SCENARIO, headers=AUTH)
            token = mint.json()["token"]
            resolve = await c.get(f"/api/v1/share/{token}")
        body = resolve.json()
        assert "scenario" in body
        assert "expires_at" in body
        assert "created_at" in body

    @pytest.mark.asyncio
    async def test_resolve_scenario_matches_minted(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            mint = await c.post("/api/v1/share", json=VALID_SCENARIO, headers=AUTH)
            token = mint.json()["token"]
            resolve = await c.get(f"/api/v1/share/{token}")
        scenario = resolve.json()["scenario"]
        assert scenario["districtUbigeo"] == VALID_SCENARIO["scenario"]["districtUbigeo"]
        assert scenario["timeWindowHours"] == VALID_SCENARIO["scenario"]["timeWindowHours"]

    @pytest.mark.asyncio
    async def test_404_for_unknown_token(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/share/nonexistenttoken99999")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_404_for_malformed_token(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/share/!@#$%^&*()")
        assert resp.status_code == 404


class TestScenarioSnapshotConstraints:
    """ScenarioSnapshot field-level Pydantic constraints."""

    @pytest.mark.asyncio
    async def test_district_ubigeo_over_12_chars_rejected(self):
        body = {"scenario": {**VALID_SCENARIO["scenario"], "districtUbigeo": "1" * 13}}
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post("/api/v1/share", json=body, headers=AUTH)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_district_name_over_200_chars_rejected(self):
        body = {"scenario": {**VALID_SCENARIO["scenario"], "districtName": "N" * 201}}
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post("/api/v1/share", json=body, headers=AUTH)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_replay_date_over_32_chars_rejected(self):
        body = {"scenario": {**VALID_SCENARIO["scenario"], "replayDate": "D" * 33}}
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post("/api/v1/share", json=body, headers=AUTH)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_too_many_active_layers_rejected(self):
        """activeLayers has max_length=20 items."""
        body = {"scenario": {**VALID_SCENARIO["scenario"], "activeLayers": ["districts"] * 21}}
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.post("/api/v1/share", json=body, headers=AUTH)
        assert resp.status_code == 422
