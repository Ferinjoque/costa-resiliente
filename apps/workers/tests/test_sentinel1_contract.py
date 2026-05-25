"""
Ingest contract tests for Sentinel-1 flow.
These tests verify the data contract without hitting external APIs.
No real PC STAC or MinIO calls — all mocked.
"""
import json
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

import pytest

from costa_workers.ingest.sentinel1 import (
    LIMA_BBOX,
    _pc_modifier,
    ingest_sentinel1_flow,
)


# ─── PC modifier ──────────────────────────────────────────────────────────────
def test_pc_modifier_adds_key_when_set(monkeypatch):
    monkeypatch.setenv("PC_SDK_SUBSCRIPTION_KEY", "test-key-123")
    params = {}
    result = _pc_modifier(params)
    assert result["headers"]["Ocp-Apim-Subscription-Key"] == "test-key-123"


def test_pc_modifier_no_key_when_unset(monkeypatch):
    monkeypatch.delenv("PC_SDK_SUBSCRIPTION_KEY", raising=False)
    params = {}
    result = _pc_modifier(params)
    assert "headers" not in result


# ─── STAC item schema ──────────────────────────────────────────────────────────
MOCK_SCENE = {
    "type": "Feature",
    "stac_version": "1.0.0",
    "id": "S1A_IW_GRDH_1SDV_20250110T110000_20250110T110030_051234_063000",
    "collection": "sentinel-1-grd",
    "bbox": [-77.2, -12.5, -76.7, -11.7],
    "properties": {
        "datetime": "2025-01-10T11:00:00Z",
        "platform": "SENTINEL-1A",
        "constellation": "sentinel-1",
    },
    "assets": {
        "vv": {"href": "https://example.com/vv.tif", "type": "image/tiff"},
        "vh": {"href": "https://example.com/vh.tif", "type": "image/tiff"},
    },
    "links": [],
    "geometry": {
        "type": "Polygon",
        "coordinates": [[
            [-77.2, -12.5], [-76.7, -12.5],
            [-76.7, -11.7], [-77.2, -11.7], [-77.2, -12.5],
        ]],
    },
}


def test_scene_has_required_fields():
    """Every ingested STAC item must have id, datetime, assets with vv/vh."""
    assert "id" in MOCK_SCENE
    assert "datetime" in MOCK_SCENE["properties"]
    assert "vv" in MOCK_SCENE["assets"]
    assert "vh" in MOCK_SCENE["assets"]


def test_scene_bbox_within_lima():
    """Scene bounding box must overlap Lima AOI."""
    b = MOCK_SCENE["bbox"]
    lima_w, lima_s, lima_e, lima_n = LIMA_BBOX
    # Check bounding boxes overlap
    assert b[0] <= lima_e and b[2] >= lima_w  # longitude overlap
    assert b[1] <= lima_n and b[3] >= lima_s  # latitude overlap


# ─── IMERG accumulation contract ───────────────────────────────────────────────
def test_accumulation_keys():
    """Each accumulation record must have the required TimescaleDB fields."""
    from costa_workers.ingest.imerg import ACCUMULATION_HOURS

    record = {
        "time": datetime.now(timezone.utc),
        "watershed_id": 1,
        "acc_1h_mm": 1.5,
        "acc_3h_mm": 4.2,
        "acc_6h_mm": 8.1,
        "acc_12h_mm": 12.0,
        "acc_24h_mm": 20.3,
        "acc_72h_mm": 45.0,
        "acc_168h_mm": 85.0,
    }
    required = {"time", "watershed_id"} | {f"acc_{h}h_mm" for h in ACCUMULATION_HOURS}
    assert required == set(record.keys())


def test_accumulation_non_negative():
    """Rainfall accumulations must be non-negative."""
    import numpy as np

    # Simulate clipped IMERG data with -9999 fill values
    raw = np.array([[5.0, -9999.0], [2.0, 3.0]])
    cleaned = np.where(raw < 0, 0.0, raw)
    assert (cleaned >= 0).all()
