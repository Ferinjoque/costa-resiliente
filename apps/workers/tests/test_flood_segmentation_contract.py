"""
Flood segmentation contract tests — pure math, no model weights, no GPU.
Validates preprocessing, normalization, and vectorization logic.
"""
import math

import numpy as np
import pytest


# ─── Preprocessing ────────────────────────────────────────────────────────────

def test_linear_to_db_basic():
    """10 * log10(100) = 20 dB."""
    from costa_workers.ml.flood_segmentation import linear_to_db
    result = linear_to_db(np.array([100.0]))
    assert math.isclose(result[0], 20.0, abs_tol=1e-4)


def test_linear_to_db_near_zero_no_inf():
    """Near-zero linear values must not produce -inf."""
    from costa_workers.ml.flood_segmentation import linear_to_db
    result = linear_to_db(np.array([0.0, 1e-15, 1e-10]))
    assert np.all(np.isfinite(result))
    assert np.all(result > -200)


def test_normalize_band_zero_mean():
    """After normalization, mean should be ~0."""
    from costa_workers.ml.flood_segmentation import normalize_band, VV_MEAN, VV_STD
    arr = np.array([VV_MEAN] * 100, dtype=np.float32)
    result = normalize_band(arr, VV_MEAN, VV_STD)
    assert np.allclose(result, 0.0, atol=1e-6)


def test_normalize_band_unit_variance():
    """Values at ±1 std should normalize to ±1."""
    from costa_workers.ml.flood_segmentation import normalize_band, VH_MEAN, VH_STD
    arr = np.array([VH_MEAN + VH_STD, VH_MEAN - VH_STD])
    result = normalize_band(arr, VH_MEAN, VH_STD)
    assert math.isclose(result[0], 1.0, abs_tol=1e-5)
    assert math.isclose(result[1], -1.0, abs_tol=1e-5)


def test_preprocess_scene_shape():
    """preprocess_scene must return (2, H, W) float32."""
    from costa_workers.ml.flood_segmentation import preprocess_scene
    H, W = 64, 64
    vv = np.random.uniform(0.001, 0.5, (H, W)).astype(np.float32)
    vh = np.random.uniform(0.0001, 0.1, (H, W)).astype(np.float32)
    out = preprocess_scene(vv, vh)
    assert out.shape == (2, H, W)
    assert out.dtype == np.float32


def test_preprocess_scene_finite():
    """All preprocessed values must be finite."""
    from costa_workers.ml.flood_segmentation import preprocess_scene
    vv = np.random.uniform(0.001, 1.0, (32, 32)).astype(np.float32)
    vh = np.random.uniform(0.0001, 0.5, (32, 32)).astype(np.float32)
    out = preprocess_scene(vv, vh)
    assert np.all(np.isfinite(out))


def test_preprocess_scene_shape_mismatch_raises():
    """VV/VH shape mismatch must raise ValueError."""
    from costa_workers.ml.flood_segmentation import preprocess_scene
    with pytest.raises(ValueError, match="shape mismatch"):
        preprocess_scene(np.ones((32, 32)), np.ones((16, 16)))


def test_preprocess_clipping():
    """Values that convert to < -50 dB should be clipped to -50 dB before normalization."""
    from costa_workers.ml.flood_segmentation import (
        preprocess_scene, DB_CLIP_MIN, VV_MEAN, VV_STD,
    )
    # 1e-20 linear → dB ≈ -200 dB → clipped to -50 → normalized
    vv = np.full((4, 4), 1e-20, dtype=np.float32)
    vh = np.full((4, 4), 1e-20, dtype=np.float32)
    out = preprocess_scene(vv, vh)
    expected_vv_norm = (DB_CLIP_MIN - VV_MEAN) / VV_STD
    assert np.allclose(out[0], expected_vv_norm, atol=1e-4)


# ─── Shoelace area ─────────────────────────────────────────────────────────────

def test_shoelace_area_unit_square():
    """Unit square at origin should have area 1.0."""
    from costa_workers.ml.flood_segmentation import _shoelace_area
    square = [(0, 0), (1, 0), (1, 1), (0, 1), (0, 0)]
    assert math.isclose(_shoelace_area(square), 1.0, abs_tol=1e-6)


def test_shoelace_area_rectangle():
    """3×4 rectangle → area 12."""
    from costa_workers.ml.flood_segmentation import _shoelace_area
    rect = [(0, 0), (3, 0), (3, 4), (0, 4), (0, 0)]
    assert math.isclose(_shoelace_area(rect), 12.0, abs_tol=1e-6)


def test_shoelace_area_clockwise_equals_ccw():
    """Area formula is orientation-independent (abs value)."""
    from costa_workers.ml.flood_segmentation import _shoelace_area
    ccw = [(0, 0), (2, 0), (2, 2), (0, 2), (0, 0)]
    cw  = [(0, 0), (0, 2), (2, 2), (2, 0), (0, 0)]
    assert math.isclose(_shoelace_area(ccw), _shoelace_area(cw), abs_tol=1e-6)


# ─── Small region removal ──────────────────────────────────────────────────────

def test_remove_small_regions_keeps_large():
    """Connected region of 100 pixels (> min_pixels=9) must survive."""
    from costa_workers.ml.flood_segmentation import _remove_small_regions
    mask = np.zeros((20, 20), dtype=np.uint8)
    mask[5:15, 5:15] = 1  # 10×10 = 100 pixel region
    result = _remove_small_regions(mask, min_pixels=9)
    assert result[10, 10] == 1


def test_remove_small_regions_removes_noise():
    """Single isolated pixel (area=1 < min_pixels=9) must be removed."""
    from costa_workers.ml.flood_segmentation import _remove_small_regions
    mask = np.zeros((20, 20), dtype=np.uint8)
    mask[3, 3] = 1  # 1 pixel
    result = _remove_small_regions(mask, min_pixels=9)
    assert result[3, 3] == 0


def test_remove_small_regions_all_zeros_noop():
    """Empty mask should return empty mask."""
    from costa_workers.ml.flood_segmentation import _remove_small_regions
    mask = np.zeros((10, 10), dtype=np.uint8)
    result = _remove_small_regions(mask, min_pixels=5)
    assert result.sum() == 0


# ─── Full pipeline (no model) ──────────────────────────────────────────────────

def test_vectorize_mask_bad_crs_returns_empty():
    """Invalid CRS string must return [] without raising."""
    from costa_workers.ml.flood_segmentation import vectorize_mask
    import rasterio.transform as rt
    mask = np.zeros((8, 8), dtype=np.uint8)
    mask[2:6, 2:6] = 1
    transform = rt.from_bounds(0, 0, 1, 1, 8, 8)
    result = vectorize_mask(mask, transform, crs_wkt="NOT_A_REAL_CRS", min_pixels=1)
    assert result == []


def test_sar_to_flood_polygons_empty_mask():
    """If the model returns an all-zero mask, sar_to_flood_polygons returns []."""
    from unittest.mock import MagicMock, patch
    from costa_workers.ml.flood_segmentation import sar_to_flood_polygons

    H, W = 32, 32
    mock_model = MagicMock()
    mock_model.predict.return_value = (np.zeros((H, W), dtype=np.uint8), 0.0)

    vv = np.random.uniform(0.01, 0.5, (H, W)).astype(np.float32)
    vh = np.random.uniform(0.001, 0.1, (H, W)).astype(np.float32)

    # vectorize_mask is tested separately; patch it here to avoid rasterio/pyproj
    with patch(
        "costa_workers.ml.flood_segmentation.vectorize_mask", return_value=[]
    ):
        result = sar_to_flood_polygons(
            scene_id="TEST_SCENE",
            vv_linear=vv,
            vh_linear=vh,
            transform=object(),  # opaque — passed through to vectorize_mask
            crs_wkt="EPSG:4326",
            model=mock_model,
        )
    assert result == []
    mock_model.predict.assert_called_once()


def test_sar_to_flood_polygons_result_has_scene_id():
    """Each returned dict must include the scene_id and confidence from the model."""
    from unittest.mock import MagicMock, patch
    from costa_workers.ml.flood_segmentation import sar_to_flood_polygons

    H, W = 32, 32
    mask = np.zeros((H, W), dtype=np.uint8)
    mask[10:20, 10:20] = 1

    mock_model = MagicMock()
    mock_model.predict.return_value = (mask, 0.85)

    vv = np.random.uniform(0.01, 0.5, (H, W)).astype(np.float32)
    vh = np.random.uniform(0.001, 0.1, (H, W)).astype(np.float32)

    fake_polys = [
        {"geometry": {"type": "Polygon", "coordinates": [[[0, 0]]]}, "area_m2": 10000.0},
    ]

    with patch(
        "costa_workers.ml.flood_segmentation.vectorize_mask", return_value=fake_polys
    ):
        results = sar_to_flood_polygons(
            scene_id="S1A_TEST_001",
            vv_linear=vv,
            vh_linear=vh,
            transform=object(),
            crs_wkt="EPSG:32718",
            model=mock_model,
        )

    assert len(results) == 1
    r = results[0]
    assert r["scene_id"] == "S1A_TEST_001"
    assert "geometry" in r
    assert "confidence" in r
    assert r["confidence"] == pytest.approx(0.85, abs=1e-4)
