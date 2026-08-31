"""Weather interpretation and the /layers/weather endpoint.

The organiser deliverable list requires the console to display current weather
conditions alongside precipitation, plus responder-relevant warnings (heat,
cold, fog, wind, thunderstorm). These tests pin the thresholds and the warning
vocabulary so a later tweak cannot quietly stop a warning from firing.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport

from costa_api.main import app
from costa_api.weather import (
    COLD_WARNING_C,
    GUST_WARNING_KMH,
    HEAT_WARNING_C,
    WIND_WARNING_KMH,
    derive_warnings,
    describe_weather_code,
    worst_severity,
)

BASE = "http://test"


class TestDescribeWeatherCode:
    def test_known_code_is_bilingual(self):
        label = describe_weather_code(45)
        assert label["es"] == "Niebla"
        assert label["en"] == "Fog"

    def test_missing_code_does_not_raise(self):
        assert describe_weather_code(None)["es"] == "Sin dato"

    def test_unmapped_code_degrades_to_the_number(self):
        assert "4677" in describe_weather_code(4677)["es"]

    def test_non_numeric_code_is_tolerated(self):
        # MapLibre and JSON round-trips can hand back strings.
        assert describe_weather_code("not-a-code")["en"] == "No data"

    def test_numeric_string_is_still_resolved(self):
        assert describe_weather_code("95")["en"] == "Thunderstorm"


class TestDeriveWarnings:
    def test_benign_conditions_produce_nothing(self):
        # Typical Lima afternoon: mild, breezy, mainly clear.
        assert derive_warnings({
            "temperature_c": 20.1, "wind_speed_kmh": 17.2,
            "wind_gusts_kmh": 42.1, "weather_code": 1,
        }) == []

    def test_heat_fires_at_threshold(self):
        kinds = [w["kind"] for w in derive_warnings({"temperature_c": HEAT_WARNING_C})]
        assert "heat" in kinds

    def test_cold_fires_at_threshold(self):
        kinds = [w["kind"] for w in derive_warnings({"temperature_c": COLD_WARNING_C})]
        assert "cold" in kinds

    def test_heat_and_cold_are_mutually_exclusive(self):
        kinds = [w["kind"] for w in derive_warnings({"temperature_c": 22.0})]
        assert "heat" not in kinds and "cold" not in kinds

    def test_gusts_outrank_sustained_wind(self):
        warnings = derive_warnings({
            "wind_speed_kmh": WIND_WARNING_KMH + 5,
            "wind_gusts_kmh": GUST_WARNING_KMH + 5,
        })
        wind = [w for w in warnings if w["kind"] == "wind"]
        assert len(wind) == 1, "one wind warning, not both bands"
        assert wind[0]["severity"] == "danger"

    def test_sustained_wind_alone_is_a_warn(self):
        warnings = derive_warnings({"wind_speed_kmh": WIND_WARNING_KMH, "wind_gusts_kmh": 10.0})
        assert warnings[0]["kind"] == "wind"
        assert warnings[0]["severity"] == "warn"

    @pytest.mark.parametrize("code,kind", [
        (95, "thunderstorm"), (96, "thunderstorm"), (99, "thunderstorm"),
        (45, "fog"), (48, "fog"),
        (65, "heavy_rain"), (67, "heavy_rain"), (82, "heavy_rain"),
    ])
    def test_weather_codes_map_to_warnings(self, code, kind):
        assert [w["kind"] for w in derive_warnings({"weather_code": code})] == [kind]

    def test_heavy_rain_is_flagged_as_a_huayco_trigger(self):
        # The rainfall-to-huayco link is the whole scenario; losing it in a
        # refactor would strip the warning of its operational meaning.
        detail = derive_warnings({"weather_code": 82})[0]["detail_es"]
        assert "huayco" in detail.lower()

    def test_every_warning_is_fully_bilingual(self):
        warnings = derive_warnings({
            "temperature_c": 33.0, "wind_gusts_kmh": 80.0, "weather_code": 95,
        })
        assert warnings, "expected warnings for extreme inputs"
        for w in warnings:
            for field in ("label_es", "label_en", "detail_es", "detail_en"):
                assert w[field], f"{w['kind']} missing {field}"
            assert w["severity"] in {"warn", "danger"}

    def test_empty_observation_is_safe(self):
        assert derive_warnings({}) == []

    def test_none_values_do_not_raise(self):
        assert derive_warnings({
            "temperature_c": None, "wind_speed_kmh": None,
            "wind_gusts_kmh": None, "weather_code": None,
        }) == []


class TestWorstSeverity:
    def test_danger_wins(self):
        assert worst_severity([{"severity": "warn"}, {"severity": "danger"}]) == "danger"

    def test_warn_when_no_danger(self):
        assert worst_severity([{"severity": "warn"}]) == "warn"

    def test_none_when_empty(self):
        assert worst_severity([]) is None


class TestWeatherEndpoint:
    @pytest.mark.asyncio
    async def test_returns_feature_collection(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
            resp = await client.get("/api/v1/layers/weather")
        assert resp.status_code == 200
        body = resp.json()
        assert body["type"] == "FeatureCollection"
        assert isinstance(body["features"], list)

    @pytest.mark.asyncio
    async def test_carries_open_meteo_attribution(self):
        # CC BY 4.0 obliges attribution, and the data-sources panel reads it.
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
            resp = await client.get("/api/v1/layers/weather")
        assert "Open-Meteo" in resp.json()["attribution"]

    @pytest.mark.asyncio
    async def test_summary_warnings_are_deduplicated_by_kind(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
            resp = await client.get("/api/v1/layers/weather")
        kinds = [w["kind"] for w in resp.json()["warnings"]]
        assert len(kinds) == len(set(kinds)), "same warning kind repeated across points"

    @pytest.mark.asyncio
    async def test_each_feature_exposes_condition_and_warnings(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
            resp = await client.get("/api/v1/layers/weather")
        for feature in resp.json()["features"]:
            props = feature["properties"]
            assert "es" in props["condition"] and "en" in props["condition"]
            assert isinstance(props["warnings"], list)

    @pytest.mark.asyncio
    async def test_max_severity_agrees_with_warning_list(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
            resp = await client.get("/api/v1/layers/weather")
        body = resp.json()
        assert body["max_severity"] == worst_severity(body["warnings"])
