"""Contract tests for store_flood_polygons — no DB required.

Validates the geom-None guard (skip polygons without geometry), correct
INSERT SQL shape, and the ON CONFLICT (scene_id) DO NOTHING path.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


FAKE_SCENE_ID = "S1A_IW_SLC__1SDV_TEST-SCENE-001"
FAKE_ACQUIRED_AT = datetime(2026, 3, 15, 6, 0, tzinfo=timezone.utc)

VALID_POLY = {
    "geometry": {"type": "Polygon", "coordinates": [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 0.0]]]},
    "area_m2": 9_000_000.0,
    "confidence": 0.87,
}

NO_GEOM_POLY = {
    "geometry": None,
    "area_m2": 5_000.0,
    "confidence": 0.55,
}

EMPTY_GEOM_POLY = {
    "geometry": {},
    "area_m2": 5_000.0,
    "confidence": 0.55,
}


def _make_pool(execute_calls: list):
    """Build an asyncpg pool mock that records execute() calls."""
    pool = MagicMock()
    pool.__aenter__ = AsyncMock(return_value=pool)
    pool.__aexit__ = AsyncMock(return_value=None)

    async def fake_execute(sql, *args, **kwargs):
        execute_calls.append({"sql": sql, "args": args})

    pool.execute = fake_execute
    return pool


class TestStoreFloodPolygons:
    """store_flood_polygons() contract — geometry guard and INSERT shape."""

    @pytest.mark.asyncio
    async def test_skips_polygon_with_none_geometry(self):
        """A polygon dict where geometry is None must not produce a DB call."""
        from costa_workers.ingest.flood_pipeline import store_flood_polygons

        calls: list = []
        pool = _make_pool(calls)

        with patch("asyncpg.create_pool", return_value=pool):
            result = await store_flood_polygons(
                scene_id=FAKE_SCENE_ID,
                polygons=[NO_GEOM_POLY],
                acquired_at=FAKE_ACQUIRED_AT,
            )

        assert result == 0, "No insert should happen for polygon without geometry"
        assert calls == [], "execute() must not be called when geom is None"

    @pytest.mark.asyncio
    async def test_skips_polygon_with_empty_geometry(self):
        """A polygon dict where geometry is falsy (empty dict) must be skipped."""
        from costa_workers.ingest.flood_pipeline import store_flood_polygons

        calls: list = []
        pool = _make_pool(calls)

        with patch("asyncpg.create_pool", return_value=pool):
            result = await store_flood_polygons(
                scene_id=FAKE_SCENE_ID,
                polygons=[EMPTY_GEOM_POLY],
                acquired_at=FAKE_ACQUIRED_AT,
            )

        assert result == 0
        assert calls == []

    @pytest.mark.asyncio
    async def test_inserts_valid_polygon(self):
        """A polygon with valid geometry must produce exactly one execute() call."""
        from costa_workers.ingest.flood_pipeline import store_flood_polygons

        calls: list = []
        pool = _make_pool(calls)

        with patch("asyncpg.create_pool", return_value=pool):
            result = await store_flood_polygons(
                scene_id=FAKE_SCENE_ID,
                polygons=[VALID_POLY],
                acquired_at=FAKE_ACQUIRED_AT,
            )

        assert result == 1
        assert len(calls) == 1

    @pytest.mark.asyncio
    async def test_insert_sql_contains_on_conflict_scene_id(self):
        """INSERT SQL must use ON CONFLICT (scene_id) DO NOTHING — not the old partial-index form."""
        from costa_workers.ingest.flood_pipeline import store_flood_polygons

        calls: list = []
        pool = _make_pool(calls)

        with patch("asyncpg.create_pool", return_value=pool):
            await store_flood_polygons(
                scene_id=FAKE_SCENE_ID,
                polygons=[VALID_POLY],
                acquired_at=FAKE_ACQUIRED_AT,
            )

        sql = calls[0]["sql"].upper()
        assert "ON CONFLICT" in sql
        assert "SCENE_ID" in sql
        assert "DO NOTHING" in sql
        # Must NOT contain the old partial-index clause
        assert "WHERE GEOM IS NULL" not in sql

    @pytest.mark.asyncio
    async def test_geom_json_passed_as_string(self):
        """The geometry is serialised as a JSON string before being passed to asyncpg."""
        from costa_workers.ingest.flood_pipeline import store_flood_polygons

        calls: list = []
        pool = _make_pool(calls)

        with patch("asyncpg.create_pool", return_value=pool):
            await store_flood_polygons(
                scene_id=FAKE_SCENE_ID,
                polygons=[VALID_POLY],
                acquired_at=FAKE_ACQUIRED_AT,
            )

        args = calls[0]["args"]
        # $6 (index 5) is geom_json — now a MultiPolygon aggregating all detected polygons
        geom_arg = args[5]
        assert isinstance(geom_arg, str)
        parsed = json.loads(geom_arg)
        assert parsed["type"] == "MultiPolygon"
        # coordinates are wrapped one level deeper than Polygon
        assert len(parsed["coordinates"]) >= 1

    @pytest.mark.asyncio
    async def test_area_converted_from_m2_to_km2(self):
        """area_m2 from vectorize_mask must be converted to km² (÷ 1_000_000) for the DB."""
        from costa_workers.ingest.flood_pipeline import store_flood_polygons

        calls: list = []
        pool = _make_pool(calls)

        with patch("asyncpg.create_pool", return_value=pool):
            await store_flood_polygons(
                scene_id=FAKE_SCENE_ID,
                polygons=[VALID_POLY],  # area_m2 = 9_000_000
                acquired_at=FAKE_ACQUIRED_AT,
            )

        args = calls[0]["args"]
        # $5 (index 4) is area_km2
        area_km2 = args[4]
        assert abs(area_km2 - 9.0) < 1e-6

    @pytest.mark.asyncio
    async def test_empty_polygons_inserts_dry_scene_sentinel(self):
        """Empty polygon list must insert a MULTIPOLYGON EMPTY sentinel, not skip everything."""
        from costa_workers.ingest.flood_pipeline import store_flood_polygons

        calls: list = []
        pool = _make_pool(calls)

        with patch("asyncpg.create_pool", return_value=pool):
            result = await store_flood_polygons(
                scene_id=FAKE_SCENE_ID,
                polygons=[],
                acquired_at=FAKE_ACQUIRED_AT,
            )

        assert result == 0, "Dry scene returns 0 flood polygons inserted"
        assert len(calls) == 1, "Exactly one execute() for the sentinel row"

    @pytest.mark.asyncio
    async def test_dry_scene_sentinel_uses_multipolygon_empty(self):
        """Sentinel SQL must use ST_GeomFromText('MULTIPOLYGON EMPTY', 4326) — valid PostGIS empty geometry."""
        from costa_workers.ingest.flood_pipeline import store_flood_polygons

        calls: list = []
        pool = _make_pool(calls)

        with patch("asyncpg.create_pool", return_value=pool):
            await store_flood_polygons(
                scene_id=FAKE_SCENE_ID,
                polygons=[],
                acquired_at=FAKE_ACQUIRED_AT,
            )

        sql = calls[0]["sql"].upper()
        assert "MULTIPOLYGON EMPTY" in sql
        assert "ON CONFLICT" in sql
        assert "DO NOTHING" in sql
        # scene_id is $1 — verify it was passed as first positional arg
        assert calls[0]["args"][0] == FAKE_SCENE_ID

    @pytest.mark.asyncio
    async def test_mixed_valid_and_invalid_polygons(self):
        """Only valid polygons generate INSERT calls; None-geometry ones are skipped."""
        from costa_workers.ingest.flood_pipeline import store_flood_polygons

        calls: list = []
        pool = _make_pool(calls)

        polys = [NO_GEOM_POLY, VALID_POLY, EMPTY_GEOM_POLY]

        with patch("asyncpg.create_pool", return_value=pool):
            result = await store_flood_polygons(
                scene_id=FAKE_SCENE_ID,
                polygons=polys,
                acquired_at=FAKE_ACQUIRED_AT,
            )

        assert result == 1
        assert len(calls) == 1
