"""Fusion router tests — district multi-hazard join endpoint.

Verifies the GET /api/v1/fusion/{ubigeo} endpoint returns the correct shape,
validates input (ubigeo format), and returns 404 for unknown districts.
Also unit-tests the pure risk/prose helper functions without DB.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport

from costa_api.main import app

BASE = "http://test"

# Lurigancho — seeded district with full geodata and SAR/huayco/social data
LURIGANCHO_UBIGEO = "150118"
# Lima district — also seeded
LIMA_UBIGEO = "150101"


# ─── GET /api/v1/fusion/{ubigeo} ─────────────────────────────────────────────

class TestDistrictFusion:
    @pytest.mark.asyncio
    async def test_valid_district_returns_200(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(f"/api/v1/fusion/{LURIGANCHO_UBIGEO}")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_response_shape(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(f"/api/v1/fusion/{LURIGANCHO_UBIGEO}")
        body = resp.json()
        assert "retrieved_at" in body
        assert "district" in body
        assert "risk_level" in body
        assert "prose_es" in body
        assert "flood" in body
        assert "huayco" in body
        assert "social" in body
        assert "rainfall" in body  # Session 20: rainfall added to fusion

    @pytest.mark.asyncio
    async def test_rainfall_subkeys(self):
        """Rainfall block must have watershed, acc_72h_mm, acc_24h_mm, level."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(f"/api/v1/fusion/{LURIGANCHO_UBIGEO}")
        rain = resp.json().get("rainfall", {})
        assert "watershed" in rain
        assert "acc_72h_mm" in rain
        assert "acc_24h_mm" in rain
        assert "level" in rain
        if rain["level"] is not None:
            assert rain["level"] in ("emergencia", "alerta", "aviso", "normal")

    @pytest.mark.asyncio
    async def test_district_subkeys(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(f"/api/v1/fusion/{LURIGANCHO_UBIGEO}")
        d = resp.json()["district"]
        assert d["ubigeo"] == LURIGANCHO_UBIGEO
        assert isinstance(d["name"], str)
        assert len(d["name"]) > 0

    @pytest.mark.asyncio
    async def test_risk_level_is_valid(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(f"/api/v1/fusion/{LURIGANCHO_UBIGEO}")
        assert resp.json()["risk_level"] in ("alto", "moderado", "bajo")

    @pytest.mark.asyncio
    async def test_flood_subkeys(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(f"/api/v1/fusion/{LURIGANCHO_UBIGEO}")
        flood = resp.json()["flood"]
        assert "active_polygon_count" in flood
        assert "overlap_km2" in flood
        assert isinstance(flood["active_polygon_count"], int)
        assert isinstance(flood["overlap_km2"], (int, float))

    @pytest.mark.asyncio
    async def test_huayco_subkeys(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(f"/api/v1/fusion/{LURIGANCHO_UBIGEO}")
        huayco = resp.json()["huayco"]
        assert "highest_risk_level" in huayco
        assert "highest_probability" in huayco
        assert "quebrada_name" in huayco

    @pytest.mark.asyncio
    async def test_social_subkeys(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(f"/api/v1/fusion/{LURIGANCHO_UBIGEO}")
        social = resp.json()["social"]
        assert "total_signals_3h" in social
        assert "urgent_signals_3h" in social
        assert isinstance(social["total_signals_3h"], int)
        assert isinstance(social["urgent_signals_3h"], int)
        assert social["urgent_signals_3h"] <= social["total_signals_3h"]

    @pytest.mark.asyncio
    async def test_prose_is_string_and_nonempty(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(f"/api/v1/fusion/{LURIGANCHO_UBIGEO}")
        prose = resp.json()["prose_es"]
        assert isinstance(prose, str)
        assert len(prose) > 20

    @pytest.mark.asyncio
    async def test_prose_contains_district_name(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(f"/api/v1/fusion/{LURIGANCHO_UBIGEO}")
        body = resp.json()
        assert body["district"]["name"] in body["prose_es"]

    @pytest.mark.asyncio
    async def test_second_district_lima(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get(f"/api/v1/fusion/{LIMA_UBIGEO}")
        assert resp.status_code == 200
        assert resp.json()["district"]["ubigeo"] == LIMA_UBIGEO

    @pytest.mark.asyncio
    async def test_invalid_ubigeo_format_5digits(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/fusion/15013")
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_invalid_ubigeo_format_letters(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/fusion/ABCDEF")
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_unknown_ubigeo_returns_404(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/fusion/999999")
        assert resp.status_code == 404


# ─── Pure unit tests for helper functions (no DB) ────────────────────────────

class TestOverallRisk:
    def _risk(self, flood_km2=0.0, huayco=None, social=0):
        from costa_api.routers.fusion import _overall_risk
        return _overall_risk(flood_km2, huayco, social)

    def test_alto_on_large_flood(self):
        assert self._risk(flood_km2=1.5) == "alto"

    def test_alto_on_high_huayco(self):
        assert self._risk(huayco="high") == "alto"

    def test_alto_on_very_high_huayco(self):
        assert self._risk(huayco="very_high") == "alto"

    def test_alto_on_5_urgent_signals(self):
        assert self._risk(social=5) == "alto"

    def test_moderado_on_small_flood(self):
        assert self._risk(flood_km2=0.1) == "moderado"

    def test_moderado_on_medium_huayco(self):
        assert self._risk(huayco="medium") == "moderado"

    def test_moderado_on_2_urgent_signals(self):
        assert self._risk(social=2) == "moderado"

    def test_bajo_when_no_hazards(self):
        assert self._risk() == "bajo"

    def test_under_5_urgent_not_alto_if_no_flood_or_huayco(self):
        assert self._risk(social=4) == "moderado"


class TestRiskProse:
    def _prose(self, **kw):
        from costa_api.routers.fusion import _risk_prose_es
        defaults = dict(
            population=None, flood_area_km2=0.0, flood_polygon_count=0,
            huayco_risk=None, huayco_prob=None,
            social_urgent=0, social_total=0,
            district_name="TestDistrict",
        )
        defaults.update(kw)
        return _risk_prose_es(**defaults)

    def test_starts_with_district_name(self):
        assert self._prose().startswith("TestDistrict:")

    def test_includes_sar_when_flood_present(self):
        prose = self._prose(flood_area_km2=2.0, flood_polygon_count=2)
        assert "SAR" in prose
        assert "2.0" in prose

    def test_includes_huayco_when_present(self):
        prose = self._prose(huayco_risk="high", huayco_prob=0.85)
        assert "huayco" in prose.lower()
        assert "85%" in prose

    def test_includes_social_when_present(self):
        prose = self._prose(social_urgent=3, social_total=5)
        assert "3" in prose
        assert "5" in prose

    def test_no_flood_text_says_sin_inundaciones(self):
        prose = self._prose()
        assert "Sin inundaciones" in prose

    def test_includes_rainfall_emergencia_when_above_50mm(self):
        """Rainfall >= 50mm/72h → EMERGENCIA tag in prose."""
        prose = self._prose(
            flood_area_km2=0.0, flood_polygon_count=0,
            rainfall_72h=63.2, rainfall_ws="Rímac", rainfall_level="emergencia",
        )
        assert "EMERGENCIA" in prose
        assert "63" in prose
        assert "Rímac" in prose

    def test_rainfall_below_threshold_not_in_prose(self):
        """Rainfall at normal level → not mentioned in prose."""
        prose = self._prose(
            flood_area_km2=0.0, flood_polygon_count=0,
            rainfall_72h=10.0, rainfall_ws="Lurín", rainfall_level="normal",
        )
        assert "EMERGENCIA" not in prose
        assert "ALERTA" not in prose
        assert "Lurín" not in prose
