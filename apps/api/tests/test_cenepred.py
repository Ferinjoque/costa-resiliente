"""CENEPRED official district risk, district geometry, and the fusion fixes that
came with it.

Loaded by scripts/load_cenepred_districts.py. Before that load, district
polygons were built by closing every OSM boundary way as its own ring (Villa
El Salvador came out at 3.3 km² against a real 34), San Juan de Lurigancho and
all of Callao were 5-point bounding boxes, and fusion attributed Pedregal's
huayco risk to Miraflores because both sat inside one crude watershed hexagon.
"""

from __future__ import annotations

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient

from costa_api.main import app
from tests.conftest import _db_dsn

BASE = "http://test"
LEVELS = {"muy_alto", "alto", "medio", "bajo"}


async def _scalar(sql: str, *args):
    # A direct connection, not the app's engine: the engine's pool is bound to
    # the event loop of whichever request opened it first.
    conn = await asyncpg.connect(_db_dsn())
    try:
        return await conn.fetchval(sql, *args)
    finally:
        await conn.close()


async def _loaded() -> bool:
    try:
        return (await _scalar("SELECT COUNT(*) FROM geo.cenepred_risk")) > 0
    except Exception:
        return False


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        yield c


class TestCenepredLayerValidation:
    @pytest.mark.asyncio
    async def test_rejects_unknown_hazard(self, client):
        resp = await client.get("/api/v1/layers/cenepred-risk?hazard=earthquake")
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_rejects_unknown_scope(self, client):
        resp = await client.get("/api/v1/layers/cenepred-risk?scope=peru")
        assert resp.status_code == 400


class TestCenepredLayer:
    @pytest.fixture(autouse=True)
    async def _require_load(self):
        if not await _loaded():
            pytest.skip("geo.cenepred_risk not loaded (run scripts/load_cenepred_districts.py)")

    @pytest.mark.asyncio
    @pytest.mark.parametrize("hazard", ["flood", "mass_movement"])
    async def test_metro_scope_is_lima_and_callao(self, client, hazard):
        resp = await client.get(f"/api/v1/layers/cenepred-risk?hazard={hazard}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["hazard"] == hazard
        assert body["is_demo_data"] is False, "official classification is never demo data"
        assert "cenepred" in body["source_url"]
        codes = [f["properties"]["ubigeo"] for f in body["features"]]
        assert len(codes) == 50  # 43 Lima Metropolitana + 7 Callao
        assert all(c.startswith(("1501", "0701")) for c in codes)
        assert {f["properties"]["risk_level"] for f in body["features"]} <= LEVELS

    @pytest.mark.asyncio
    async def test_all_scope_uses_real_inei_codes(self, client):
        resp = await client.get("/api/v1/layers/cenepred-risk?scope=all")
        codes = {f["properties"]["ubigeo"] for f in resp.json()["features"]}
        assert len(codes) == 178
        # Lima department provinces are 1501..1510; invented 1546xx codes are gone.
        assert all(c[:4] in {f"15{p:02d}" for p in range(1, 11)} | {"0701"} for c in codes)


class TestDistrictGeometry:
    @pytest.fixture(autouse=True)
    async def _require_load(self):
        if not await _loaded():
            pytest.skip("geo.cenepred_risk not loaded")

    @pytest.mark.asyncio
    @pytest.mark.parametrize("ubigeo,low,high", [
        ("150132", 120, 160),   # San Juan de Lurigancho ~131 km² (INEI), 140 in CENEPRED
        ("150142", 30, 40),     # Villa El Salvador ~35 km²
        ("150116", 2, 4),       # Lince ~3 km²
        ("070101", 40, 60),     # Callao ~46-50 km²
    ])
    async def test_area_is_realistic(self, ubigeo, low, high):
        area = await _scalar(
            "SELECT ST_Area(geom::geography)/1e6 FROM geo.districts WHERE ubigeo = $1", ubigeo
        )
        assert low <= area <= high

    @pytest.mark.asyncio
    async def test_no_bounding_box_districts_in_scope(self):
        boxes = await _scalar("""
            SELECT COUNT(*) FROM geo.districts
            WHERE (ubigeo LIKE '1501%' OR ubigeo LIKE '0701%') AND ST_NPoints(geom) <= 5
        """)
        assert boxes == 0


class TestFusionOfficialRisk:
    @pytest.fixture(autouse=True)
    async def _require_load(self):
        if not await _loaded():
            pytest.skip("geo.cenepred_risk not loaded")

    @pytest.mark.asyncio
    async def test_fusion_carries_official_risk(self, client):
        body = (await client.get("/api/v1/fusion/150118")).json()
        official = body["official_risk"]
        assert official["flood"]["risk_level"] in LEVELS
        assert official["mass_movement"]["risk_level"] in LEVELS
        assert "cenepred" in official["source_url"]

    @pytest.mark.asyncio
    async def test_dashboard_carries_official_risk(self, client):
        body = (await client.get("/api/v1/districts/150132/dashboard")).json()
        assert body["official_risk"]["mass_movement"]["risk_level"] in LEVELS


class TestFusionHuaycoProximity:
    @pytest.mark.asyncio
    async def test_coastal_district_gets_no_quebrada_risk(self, client):
        # Miraflores has no quebrada. It used to inherit Pedregal (Chosica, 35 km
        # away) through a shared watershed polygon.
        body = (await client.get("/api/v1/fusion/150122")).json()
        assert body["huayco"]["quebrada_name"] is None
        assert "huayco" not in body["prose_es"].lower()

    @pytest.mark.asyncio
    async def test_chosica_district_gets_its_quebradas(self, client):
        body = (await client.get("/api/v1/fusion/150118")).json()
        if body["huayco"]["highest_risk_level"] is None:
            pytest.skip("no huayco susceptibility computed")
        assert body["huayco"]["quebrada_name"] is not None

    @pytest.mark.asyncio
    async def test_scenario_values_are_disclosed_in_prose(self, client):
        body = (await client.get("/api/v1/fusion/150118")).json()
        if body["huayco"]["is_demo_data"]:
            assert "escenario" in body["prose_es"]
            assert "scenario" in body["prose_en"]
        if body["flood"]["is_demo_data"]:
            assert "detectados" not in body["prose_es"]


class TestFloodExposureEstimate:
    @pytest.mark.asyncio
    async def test_population_is_areal_weighted_not_whole_districts(self, client):
        # 3.6 km² of water used to read as "2,120,279 personas en zona inundada",
        # the full census of every district a polygon touched.
        body = (await client.get("/api/v1/layers/flood/exposure")).json()
        assert body["method"] == "areal_weighting"
        for d in body["districts"]:
            if d["population"]:
                assert d["estimated_affected_population"] <= d["population"]
        whole = sum(d["population"] or 0 for d in body["districts"])
        if whole:
            assert body["total_affected_population"] < whole
        assert body["total_affected_population"] == sum(
            d["estimated_affected_population"] for d in body["districts"]
        )

    @pytest.mark.asyncio
    async def test_scenario_extents_are_flagged(self, client):
        body = (await client.get("/api/v1/layers/flood/exposure")).json()
        assert "is_demo_data" in body


class TestTrainedHuaycoModel:
    """The trained district model: genuine output, never labelled as demo data."""

    @pytest.fixture(autouse=True)
    async def _require_model(self):
        try:
            n = await _scalar("SELECT COUNT(*) FROM ml.models WHERE name = 'mass_movement'")
        except Exception:
            n = 0
        if not n:
            pytest.skip("mass-movement model not trained")

    @pytest.mark.asyncio
    async def test_card_reports_held_out_metrics_and_a_baseline(self, client):
        card = (await client.get("/api/v1/layers/huayco/model/card")).json()
        m = card["metrics"]
        assert m["train_seasons"].endswith("2016") and m["test_seasons"].startswith("2017")
        assert 0.5 < m["test_2017_2020"]["roc_auc"] <= 1.0
        assert "baseline_no_rain_2017_2020" in m

    @pytest.mark.asyncio
    async def test_replay_day_returns_model_output(self, client):
        body = (await client.get("/api/v1/layers/huayco/model?date=2017-03-15")).json()
        if not body["features"]:
            pytest.skip("2017 replay not scored")
        assert body["mode"] == "replay" and body["is_demo_data"] is False
        levels = {f["properties"]["risk_level"] for f in body["features"]}
        assert levels <= {"low", "medium", "high", "very_high"}

    @pytest.mark.asyncio
    async def test_bad_date_is_a_400(self, client):
        resp = await client.get("/api/v1/layers/huayco/model?date=15-03-2017")
        assert resp.status_code == 400
