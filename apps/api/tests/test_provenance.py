"""Provenance labelling on model-derived layers.

An operator may order an evacuation off a number on this map. Any figure that
did not come out of a trained model has to say so, everywhere it surfaces: the
layer payload, the map popup, the alert text and the copilot.

This suite exists because the huayco layer previously served hand-authored
scenario constants stamped "xgboost-v0.1-demo-refresh", and the alert prose
asserted "Modelo XGBoost: probabilidad 0.91" over a value the model never
produced.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport

from costa_api.main import app
from costa_api.routers.layers import _is_demo_version

BASE = "http://test"


class TestIsDemoVersion:
    @pytest.mark.parametrize("version", [
        "scenario-fixture-v1",
        "legacy-unversioned-fixture",
        "flood-seg-v0.1-demo",
        "elnino2017-fixture-v1",
        "xgboost-v0.1-demo-refresh",
        "SCENARIO-FIXTURE-V1",
    ])
    def test_scenario_stamps_are_demo(self, version):
        assert _is_demo_version(version) is True

    @pytest.mark.parametrize("version", [
        "flood-seg-v1.0",
        "xgboost-v1.0",
        "unet-sen1floods11-v1",
    ])
    def test_genuine_model_stamps_are_not_demo(self, version):
        assert _is_demo_version(version) is False

    def test_unstamped_rows_fail_closed(self):
        # A row that cannot prove its provenance must never be presented as a
        # real detection, so NULL counts as demonstration data.
        assert _is_demo_version(None) is True
        assert _is_demo_version("") is True


class TestHuaycoProvenance:
    @pytest.mark.asyncio
    async def test_layer_exposes_model_version(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
            resp = await client.get("/api/v1/layers/huayco/susceptibility")
        assert resp.status_code == 200
        for feature in resp.json()["features"]:
            assert "model_version" in feature["properties"]
            assert "is_demo_data" in feature["properties"]

    @pytest.mark.asyncio
    async def test_feature_flag_matches_its_version_string(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
            resp = await client.get("/api/v1/layers/huayco/susceptibility")
        for feature in resp.json()["features"]:
            props = feature["properties"]
            assert props["is_demo_data"] == _is_demo_version(props["model_version"])

    @pytest.mark.asyncio
    async def test_collection_source_never_claims_a_model_for_fixtures(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
            resp = await client.get("/api/v1/layers/huayco/susceptibility")
        body = resp.json()
        if body["is_demo_data"]:
            assert "XGBoost" not in body["source"], (
                "fixture values must not be attributed to the model"
            )

    @pytest.mark.asyncio
    async def test_any_demo_feature_marks_the_whole_collection(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
            resp = await client.get("/api/v1/layers/huayco/susceptibility")
        body = resp.json()
        expected = any(f["properties"]["is_demo_data"] for f in body["features"])
        if body["features"]:
            assert body["is_demo_data"] == expected


class TestFloodProvenance:
    @pytest.mark.asyncio
    async def test_layer_flags_demo_polygons(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
            resp = await client.get("/api/v1/layers/flood/latest")
        assert resp.status_code == 200
        for feature in resp.json()["features"]:
            props = feature["properties"]
            assert props["is_demo_data"] == _is_demo_version(props["model_version"])

    @pytest.mark.asyncio
    async def test_source_disclaims_sentinel1_when_polygons_are_fixtures(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
            resp = await client.get("/api/v1/layers/flood/latest")
        body = resp.json()
        if body.get("is_demo_data"):
            assert "demostración" in body["source"]


class TestAlertProseDoesNotOverclaim:
    @pytest.mark.asyncio
    async def test_no_active_alert_attributes_a_figure_to_xgboost(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
            resp = await client.get("/api/v1/alerts")
        rows = resp.json()
        rows = rows if isinstance(rows, list) else rows.get("items", [])
        for alert in rows:
            assert "XGBoost" not in (alert.get("description") or ""), (
                f"alert {alert.get('id')} attributes a scenario value to the model"
            )

    @pytest.mark.asyncio
    async def test_no_alert_claims_a_real_sentinel1_detection(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
            resp = await client.get("/api/v1/alerts")
        rows = resp.json()
        rows = rows if isinstance(rows, list) else rows.get("items", [])
        for alert in rows:
            assert "detectado por Sentinel-1" not in (alert.get("description") or "")
