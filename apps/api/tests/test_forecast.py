"""Rainfall forecast per watershed (Open-Meteo).

The district dashboard used to show a hard-coded table labelled "SENAMHI · WRF".
These tests pin the replacement: cumulative sums are computed from the real
hourly series, and when the upstream is down the endpoint says so instead of
inventing numbers.
"""

from __future__ import annotations

from datetime import datetime

import pytest
from httpx import ASGITransport, AsyncClient

from costa_api import forecast
from costa_api.main import app


def _series(start_hour: int, rain: list[float], prob: int = 40) -> dict:
    times = [f"2026-09-28T{h:02d}:00" if h < 24 else f"2026-09-29T{h - 24:02d}:00"
             for h in range(start_hour, start_hour + len(rain))]
    return {"hourly": {"time": times, "precipitation": rain,
                       "precipitation_probability": [prob] * len(rain)}}


def _payload(rain_per_point: dict[str, list[float]]) -> list[dict]:
    out = []
    for basin, pts in forecast.BASIN_POINTS.items():
        out += [_series(0, rain_per_point[basin]) for _ in pts]
    return out


class TestSummarise:
    def test_cumulative_windows_start_at_the_current_hour(self):
        now = datetime(2026, 9, 28, 2, 30, tzinfo=forecast.LIMA_TZ)
        # 1 mm/h for 96 h, but the first two hours are in the past.
        rain = {b: [1.0] * 96 for b in forecast.BASIN_POINTS}
        out = forecast.summarise(_payload(rain), now)
        assert out["Rímac"]["cumulative_mm"] == {"6": 6.0, "12": 12.0, "24": 24.0, "48": 48.0, "72": 72.0}

    @pytest.mark.parametrize("mm_per_h,level", [(0.0, "normal"), (0.4, "alerta"), (0.8, "emergencia")])
    def test_level_uses_ana_72h_thresholds(self, mm_per_h, level):
        now = datetime(2026, 9, 28, 0, 0, tzinfo=forecast.LIMA_TZ)
        rain = {b: [mm_per_h] * 96 for b in forecast.BASIN_POINTS}
        out = forecast.summarise(_payload(rain), now)
        assert out["Lurín"]["level_72h"] == level

    def test_basin_value_is_the_mean_of_its_points(self):
        now = datetime(2026, 9, 28, 0, 0, tzinfo=forecast.LIMA_TZ)
        payload = []
        for basin, pts in forecast.BASIN_POINTS.items():
            for i, _ in enumerate(pts):
                # Rímac: first point 3 mm/h, others dry -> mean 1 mm/h over 3 points.
                rate = 3.0 if basin == "Rímac" and i == 0 else 0.0
                payload.append(_series(0, [rate] * 96))
        out = forecast.summarise(payload, now)
        assert out["Rímac"]["cumulative_mm"]["6"] == pytest.approx(6.0)
        assert out["Chillón"]["cumulative_mm"]["72"] == 0.0

    def test_missing_values_count_as_dry(self):
        now = datetime(2026, 9, 28, 0, 0, tzinfo=forecast.LIMA_TZ)
        rain = {b: [None] * 96 for b in forecast.BASIN_POINTS}
        out = forecast.summarise(_payload(rain), now)
        assert out["Rímac"]["cumulative_mm"]["72"] == 0.0


class TestEndpoint:
    @pytest.mark.asyncio
    async def test_upstream_failure_is_a_503_not_an_invented_forecast(self, monkeypatch):
        async def boom(*_a, **_k):
            raise ConnectionError("upstream down")

        monkeypatch.setattr("costa_api.routers.layers.rain_forecast", boom)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/layers/rain-forecast")
        assert resp.status_code == 503


class TestImergObserved:
    @pytest.mark.asyncio
    async def test_real_observations_are_never_flagged_as_demo(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/layers/imerg/observed")
        assert resp.status_code == 200
        body = resp.json()
        assert body["is_demo_data"] is False
        assert "IMERG" in body["source"]
        for b in body["basins"]:
            assert b["complete_72h"] == (b["granules_72h"] >= 144)
