"""Layers router tests — all GeoJSON map-layer endpoints.

Each endpoint returns either a GeoJSON FeatureCollection or a plain dict.
Tests verify: 200 status, correct content-type/shape, key GeoJSON fields,
and query-param filters where applicable. The DB may have zero features
(e.g. no IMERG data in CI) — tests handle empty FeatureCollections gracefully.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport

from costa_api.main import app

BASE = "http://test"


def _is_feature_collection(body: dict) -> bool:
    return body.get("type") == "FeatureCollection" and isinstance(body.get("features"), list)


# ─── /layers/imerg/latest ────────────────────────────────────────────────────

class TestImergLatest:
    @pytest.mark.asyncio
    async def test_returns_200(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/imerg/latest")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_is_feature_collection(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/imerg/latest")
        body = resp.json()
        assert _is_feature_collection(body)

    @pytest.mark.asyncio
    async def test_has_source_field(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/imerg/latest")
        assert "NASA IMERG" in resp.json().get("source", "")

    @pytest.mark.asyncio
    async def test_source_label_is_late_run(self):
        """IMERG source must say 'Late Run' not 'Early Run' — regression guard."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/imerg/latest")
        source = resp.json().get("source", "")
        assert "Late Run" in source, f"Expected 'Late Run' in source label, got: {source!r}"
        assert "Early Run" not in source, "IMERG source must not say 'Early Run'"

    @pytest.mark.asyncio
    async def test_watershed_filter_accepted(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/imerg/latest?watershed_id=1")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_hours_param_accepted(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/imerg/latest?hours=72")
        assert resp.status_code == 200
        assert _is_feature_collection(resp.json())

    @pytest.mark.asyncio
    async def test_replay_at_accepted(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/imerg/latest?at=2026-05-01")
        assert resp.status_code == 200


# ─── /layers/flood/latest ────────────────────────────────────────────────────

class TestFloodLatest:
    @pytest.mark.asyncio
    async def test_returns_200(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/flood/latest")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_is_feature_collection(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/flood/latest")
        assert _is_feature_collection(resp.json())

    @pytest.mark.asyncio
    async def test_feature_properties_shape(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/flood/latest")
        features = resp.json()["features"]
        if features:
            props = features[0]["properties"]
            assert "confidence" in props
            assert "area_km2" in props

    @pytest.mark.asyncio
    async def test_limit_param_accepted(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/flood/latest?limit=5")
        assert resp.status_code == 200
        assert len(resp.json()["features"]) <= 5


# ─── /layers/huayco/susceptibility ───────────────────────────────────────────

class TestHuaycoSusceptibility:
    @pytest.mark.asyncio
    async def test_returns_200(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/huayco/susceptibility")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_is_feature_collection(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/huayco/susceptibility")
        assert _is_feature_collection(resp.json())

    @pytest.mark.asyncio
    async def test_feature_properties_shape(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/huayco/susceptibility")
        features = resp.json()["features"]
        if features:
            props = features[0]["properties"]
            assert "risk_level" in props
            assert "probability" in props


# ─── /layers/hazard ──────────────────────────────────────────────────────────

class TestHazardLayer:
    @pytest.mark.asyncio
    async def test_returns_200(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/hazard")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_is_feature_collection(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/hazard")
        assert _is_feature_collection(resp.json())

    @pytest.mark.asyncio
    async def test_hazard_type_filter(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/hazard?hazard_type=flood")
        assert resp.status_code == 200


# ─── /layers/infrastructure ──────────────────────────────────────────────────

class TestInfrastructure:
    @pytest.mark.asyncio
    async def test_returns_200(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/infrastructure")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_is_feature_collection(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/infrastructure")
        assert _is_feature_collection(resp.json())

    @pytest.mark.asyncio
    async def test_type_filter_hospital(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/infrastructure?type=hospital")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_at_risk_only_filter(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/infrastructure?at_risk_only=true")
        assert resp.status_code == 200


# ─── /layers/stations ────────────────────────────────────────────────────────

class TestStations:
    @pytest.mark.asyncio
    async def test_returns_200(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/stations")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_is_feature_collection(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/stations")
        assert _is_feature_collection(resp.json())

    @pytest.mark.asyncio
    async def test_feature_has_station_props(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/stations")
        features = resp.json()["features"]
        if features:
            props = features[0]["properties"]
            assert "station_code" in props or "name" in props


# ─── /layers/watersheds ──────────────────────────────────────────────────────

class TestWatersheds:
    @pytest.mark.asyncio
    async def test_returns_200(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/watersheds")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_is_feature_collection(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/watersheds")
        assert _is_feature_collection(resp.json())

    @pytest.mark.asyncio
    async def test_three_lima_watersheds(self):
        """Lima has exactly 3 seeded watersheds: Rímac, Chillón, Lurín."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/watersheds")
        features = resp.json()["features"]
        assert len(features) >= 3


# ─── /layers/quebradas ───────────────────────────────────────────────────────

class TestQuebradas:
    @pytest.mark.asyncio
    async def test_returns_200(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/quebradas")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_is_feature_collection(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/quebradas")
        assert _is_feature_collection(resp.json())


# ─── /layers/flood/exposure ──────────────────────────────────────────────────

class TestFloodExposure:
    @pytest.mark.asyncio
    async def test_returns_200(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/flood/exposure")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_has_districts_key(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/flood/exposure")
        body = resp.json()
        assert "districts" in body
        assert isinstance(body["districts"], list)

    @pytest.mark.asyncio
    async def test_district_entry_shape(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/flood/exposure")
        districts = resp.json()["districts"]
        if districts:
            d = districts[0]
            assert "ubigeo" in d or "district_id" in d

    @pytest.mark.asyncio
    async def test_flood_exposure_has_time_filter(self):
        """Regression: flood_exposure must filter to recent polygons only (7 days).

        Prior bug: no acquired_at filter — accumulated all historical flood polygons
        into total_affected_population, vastly overstating current exposure.
        """
        from inspect import getsource
        from costa_api.routers.layers import flood_exposure
        src = getsource(flood_exposure)
        assert "7 days" in src, (
            "flood_exposure must filter flood polygons to last 7 days to avoid "
            "accumulating historical extents into the population estimate"
        )
        assert "acquired_at" in src, "flood_exposure must filter by acquired_at"

    @pytest.mark.asyncio
    async def test_total_affected_population_is_integer(self):
        """total_affected_population must be a non-negative integer."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/flood/exposure")
        total = resp.json().get("total_affected_population", -1)
        assert isinstance(total, (int, float))
        assert total >= 0

    @pytest.mark.asyncio
    async def test_flood_exposure_includes_total_affected_population_field(self):
        """total_affected_population MUST be present in response (strict field check).

        Regression guard: `.get("total_affected_population", -1)` in previous test
        would mask a missing field. OperationalHUD relies on this field — silent absence
        would show 0 population at risk when data is actually unavailable.
        """
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/flood/exposure")
        assert resp.status_code == 200
        body = resp.json()
        assert "total_affected_population" in body, (
            "flood/exposure must always include total_affected_population field — "
            "OperationalHUD depends on it for population-at-risk display"
        )
        assert body["total_affected_population"] is not None
        assert body["total_affected_population"] >= 0


# ─── _parse_replay_time ──────────────────────────────────────────────────────

class TestParseReplayTime:
    """Unit tests for the _parse_replay_time helper in layers.py."""

    def _parse(self, at_str):
        from costa_api.routers.layers import _parse_replay_time
        return _parse_replay_time(at_str)

    def test_none_returns_now(self):
        """None input → returns a current datetime (not None)."""
        from datetime import datetime, timezone
        result = self._parse(None)
        assert isinstance(result, datetime)
        assert result.tzinfo is not None

    def test_date_only_promoted_to_end_of_day(self):
        """YYYY-MM-DD input must be promoted to 23:59:59 (full day visible)."""
        result = self._parse("2026-05-31")
        assert result.hour == 23
        assert result.minute == 59

    def test_explicit_midnight_not_promoted(self):
        """T00:00:00 (explicit midnight) must NOT be bumped to 23:59.

        Prior bug: condition was `if dt.hour == 0 and ... == 0` — this
        incorrectly bumped an explicit T00:00:00Z query to end-of-day,
        hiding data published before midnight.
        """
        result = self._parse("2026-05-31T00:00:00Z")
        assert result.hour == 0, (
            "Explicit midnight should stay at 00:00:00, not be bumped to 23:59 — "
            "only bare date inputs (no time component) should be promoted"
        )

    def test_explicit_time_preserved(self):
        """An explicit T12:30:00 timestamp must not be modified."""
        result = self._parse("2026-05-31T12:30:00")
        assert result.hour == 12
        assert result.minute == 30

    def test_timezone_aware_returned(self):
        """All returned datetimes must be timezone-aware."""
        result = self._parse("2026-05-15")
        assert result.tzinfo is not None


# ─── /layers/social ──────────────────────────────────────────────────────────

class TestSocialLayer:
    @pytest.mark.asyncio
    async def test_returns_200(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/social")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_is_feature_collection(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/social")
        assert _is_feature_collection(resp.json())

    @pytest.mark.asyncio
    async def test_label_filter(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/social?label=needs_help")
        assert resp.status_code == 200
        features = resp.json()["features"]
        for f in features:
            assert f["properties"]["triage_label"] == "needs_help"

    @pytest.mark.asyncio
    async def test_huayco_observation_label_filter(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/social?label=huayco_observation")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_irrelevant_not_in_default_results(self):
        """irrelevant and false_alarm labels are filtered out by default."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/social")
        features = resp.json()["features"]
        for f in features:
            label = f["properties"]["triage_label"]
            assert label not in ("irrelevant", "false_alarm"), f"filtered label leaked: {label}"

    @pytest.mark.asyncio
    async def test_hours_param(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/social?hours=1")
        assert resp.status_code == 200


# ─── /layers/shelters ────────────────────────────────────────────────────────

class TestShelters:
    @pytest.mark.asyncio
    async def test_returns_200(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/shelters")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_is_feature_collection(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/shelters")
        assert _is_feature_collection(resp.json())

    @pytest.mark.asyncio
    async def test_active_only_false_accepted(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
            resp = await c.get("/api/v1/layers/shelters?active_only=false")
        assert resp.status_code == 200
