"""SAR flood segmentation using Sen1Floods11 / UrbanSARFloods weights.

Sprint 3 implementation target:
- Load Sen1Floods11 pretrained weights (Cloud-to-Street, Bonafilia et al. 2020 CVPR)
- Evaluate UrbanSARFloods (Zhu et al. arXiv:2406.04111, 2024) for Lima urban density
- Run inference on Sentinel-1 GRD scene: <5 min CPU, <60s GPU
- Output: flood polygons + confidence → ml.flood_polygons in PostGIS
"""
import logging
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)


class FloodSegmentationModel:
    """Wrapper for Sen1Floods11 / UrbanSARFloods inference."""

    def __init__(self, weights_path: Path, device: str = "cpu"):
        self.weights_path = weights_path
        self.device = device
        self._model = None
        logger.info("FloodSegmentationModel initialized (device=%s)", device)

    def load(self) -> None:
        """Load model weights. Call once at worker startup."""
        # TODO Sprint 3: load Sen1Floods11 or UrbanSARFloods weights via transformers/torch
        logger.info("TODO: load flood segmentation weights from %s", self.weights_path)

    def predict(self, vv_array: np.ndarray, vh_array: np.ndarray) -> tuple[np.ndarray, float]:
        """
        Run flood segmentation on VV/VH band arrays.
        Returns (binary_mask, mean_confidence).
        """
        if self._model is None:
            raise RuntimeError("Model not loaded — call load() first")
        # TODO Sprint 3: run inference
        raise NotImplementedError


def sar_to_flood_polygons(
    scene_id: str,
    vv_array: np.ndarray,
    vh_array: np.ndarray,
    crs: str,
    transform,
    model: FloodSegmentationModel,
) -> list[dict]:
    """
    Full pipeline: SAR arrays → flood binary mask → vectorised polygons (GeoJSON).
    Returns list of GeoJSON Feature dicts for insertion into ml.flood_polygons.
    """
    # TODO Sprint 3:
    # 1. Run model.predict(vv_array, vh_array)
    # 2. Apply threshold (default 0.5)
    # 3. Vectorize with rasterio.features.shapes
    # 4. Reproject to EPSG:4326
    # 5. Return Feature dicts
    logger.info("TODO: vectorize flood mask for scene %s", scene_id)
    return []
