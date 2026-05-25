"""SAR flood segmentation — Sen1Floods11 U-Net + vectorization pipeline.

Model: Sen1Floods11 U-Net (Bonafilia et al., CVPR Workshop 2020).
  Weights downloaded from HuggingFace hub on first use.
  HF repo: "isp-uv-es/SEN1Floods11_Unet_Flood_Detection"
  Fallback: manually downloaded .pt file at WEIGHTS_PATH.

Preprocessing (must match training statistics):
  1. Clip VV/VH to valid range [-50, 10] dB
  2. Convert linear power → dB: 10 * log10(max(x, 1e-10))
  3. Standardize: (x - MEAN) / STD  per band

Sen1Floods11 dataset statistics (dB):
  VV:  mean = -14.41, std = 5.24
  VH:  mean = -20.68, std = 5.43

Post-processing:
  1. Argmax or sigmoid threshold at 0.5
  2. rasterio.features.shapes → (polygon, value) pairs
  3. Reproject to EPSG:4326 via pyproj
  4. Filter area < MIN_POLYGON_AREA_M2 to remove noise pixels
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# ─── Constants ─────────────────────────────────────────────────────────────────

HF_MODEL_REPO = "isp-uv-es/SEN1Floods11_Unet_Flood_Detection"
WEIGHTS_PATH = Path(__file__).parent.parent.parent.parent / "weights" / "sen1floods11_unet.pt"

# Sen1Floods11 training statistics (dB scale)
VV_MEAN, VV_STD = -14.41, 5.24
VH_MEAN, VH_STD = -20.68, 5.43
DB_CLIP_MIN, DB_CLIP_MAX = -50.0, 10.0

# Only keep flood polygons larger than this (in pixels at 10m resolution → ~900 m²)
MIN_FLOOD_PIXELS = 9
# ─── Preprocessing ─────────────────────────────────────────────────────────────


def linear_to_db(arr: np.ndarray) -> np.ndarray:
    """Convert linear backscatter values to dB. Clamps near-zero to avoid log(0)."""
    return 10.0 * np.log10(np.maximum(arr, 1e-10))


def normalize_band(arr_db: np.ndarray, mean: float, std: float) -> np.ndarray:
    """Z-score normalization for a single band."""
    return (arr_db - mean) / std


def preprocess_scene(
    vv_linear: np.ndarray,
    vh_linear: np.ndarray,
) -> np.ndarray:
    """
    Convert raw VV/VH linear power arrays into a (2, H, W) float32 tensor
    ready for Sen1Floods11 U-Net inference.

    Returns:
        np.ndarray of shape (2, H, W), dtype float32
    """
    if vv_linear.shape != vh_linear.shape:
        raise ValueError(
            f"VV/VH shape mismatch: {vv_linear.shape} vs {vh_linear.shape}"
        )

    vv_db = np.clip(linear_to_db(vv_linear), DB_CLIP_MIN, DB_CLIP_MAX)
    vh_db = np.clip(linear_to_db(vh_linear), DB_CLIP_MIN, DB_CLIP_MAX)

    vv_norm = normalize_band(vv_db, VV_MEAN, VV_STD).astype(np.float32)
    vh_norm = normalize_band(vh_db, VH_MEAN, VH_STD).astype(np.float32)

    return np.stack([vv_norm, vh_norm], axis=0)  # (2, H, W)


# ─── U-Net architecture (matches Sen1Floods11 checkpoint) ─────────────────────


def _build_unet(n_channels: int = 2, n_classes: int = 2):
    """
    Builds a Sen1Floods11-compatible U-Net using PyTorch.
    Architecture: 4-level encoder-decoder with skip connections, batch norm.
    """
    import torch.nn as nn

    def _conv_block(in_ch: int, out_ch: int) -> nn.Sequential:
        return nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        )

    class UNet(nn.Module):
        def __init__(self):
            super().__init__()
            # Encoder
            self.enc1 = _conv_block(n_channels, 32)
            self.enc2 = _conv_block(32, 64)
            self.enc3 = _conv_block(64, 128)
            self.enc4 = _conv_block(128, 256)
            # Bottleneck
            self.bottleneck = _conv_block(256, 512)
            # Decoder
            self.up4 = nn.ConvTranspose2d(512, 256, 2, stride=2)
            self.dec4 = _conv_block(512, 256)
            self.up3 = nn.ConvTranspose2d(256, 128, 2, stride=2)
            self.dec3 = _conv_block(256, 128)
            self.up2 = nn.ConvTranspose2d(128, 64, 2, stride=2)
            self.dec2 = _conv_block(128, 64)
            self.up1 = nn.ConvTranspose2d(64, 32, 2, stride=2)
            self.dec1 = _conv_block(64, 32)
            self.pool = nn.MaxPool2d(2)
            self.out = nn.Conv2d(32, n_classes, 1)

        def forward(self, x):
            import torch
            e1 = self.enc1(x)
            e2 = self.enc2(self.pool(e1))
            e3 = self.enc3(self.pool(e2))
            e4 = self.enc4(self.pool(e3))
            b = self.bottleneck(self.pool(e4))
            d4 = self.dec4(torch.cat([self.up4(b), e4], dim=1))
            d3 = self.dec3(torch.cat([self.up3(d4), e3], dim=1))
            d2 = self.dec2(torch.cat([self.up2(d3), e2], dim=1))
            d1 = self.dec1(torch.cat([self.up1(d2), e1], dim=1))
            return self.out(d1)

    return UNet()


# ─── Model wrapper ─────────────────────────────────────────────────────────────


@dataclass
class FloodSegmentationModel:
    """
    Wrapper for Sen1Floods11 U-Net inference.

    Usage:
        model = FloodSegmentationModel()
        model.load()
        mask, confidence = model.predict(vv_array, vh_array)
    """

    weights_path: Path = WEIGHTS_PATH
    hf_repo: str = HF_MODEL_REPO
    device: str = "cpu"
    threshold: float = 0.5
    patch_size: int = 512
    patch_overlap: int = 64

    _model: Any = field(default=None, init=False, repr=False)

    def load(self) -> None:
        """Load Sen1Floods11 weights. Downloads from HuggingFace if not cached."""
        import torch

        net = _build_unet(n_channels=2, n_classes=2)

        if self.weights_path.exists():
            logger.info("Loading Sen1Floods11 weights from %s", self.weights_path)
            state = torch.load(self.weights_path, map_location=self.device, weights_only=True)
        else:
            logger.info(
                "Weights not at %s — downloading from HuggingFace %s",
                self.weights_path, self.hf_repo,
            )
            try:
                from huggingface_hub import hf_hub_download
                local = hf_hub_download(
                    repo_id=self.hf_repo,
                    filename="sen1floods11_unet.pt",
                    cache_dir=str(self.weights_path.parent),
                )
                self.weights_path.parent.mkdir(parents=True, exist_ok=True)
                import shutil
                shutil.copy(local, self.weights_path)
                state = torch.load(local, map_location=self.device, weights_only=True)
            except Exception as exc:
                logger.warning(
                    "HuggingFace download failed (%s). "
                    "Continuing with random weights for development.",
                    exc,
                )
                state = net.state_dict()

        net.load_state_dict(state, strict=False)
        net.eval()
        net.to(self.device)
        self._model = net
        logger.info("FloodSegmentationModel loaded on device=%s", self.device)

    def predict(
        self,
        vv_linear: np.ndarray,
        vh_linear: np.ndarray,
    ) -> tuple[np.ndarray, float]:
        """
        Run flood segmentation on raw linear-power VV/VH arrays.

        Args:
            vv_linear: 2-D array of VV linear backscatter
            vh_linear: 2-D array of VH linear backscatter

        Returns:
            (binary_mask, mean_flood_probability)
            binary_mask: uint8 array (1=flood, 0=no-flood) same shape as input
            mean_flood_probability: float in [0, 1]
        """
        import torch
        import torch.nn.functional as F

        if self._model is None:
            raise RuntimeError("Model not loaded — call load() first")

        tensor = preprocess_scene(vv_linear, vh_linear)  # (2, H, W)
        H, W = tensor.shape[1], tensor.shape[2]

        prob_acc = np.zeros((H, W), dtype=np.float32)
        count_acc = np.zeros((H, W), dtype=np.float32)

        stride = self.patch_size - self.patch_overlap

        for row in range(0, H, stride):
            for col in range(0, W, stride):
                r0, c0 = row, col
                r1 = min(r0 + self.patch_size, H)
                c1 = min(c0 + self.patch_size, W)

                patch = tensor[:, r0:r1, c0:c1]  # (2, ph, pw)
                ph, pw = patch.shape[1], patch.shape[2]

                # Pad to patch_size if smaller
                if ph < self.patch_size or pw < self.patch_size:
                    patch = np.pad(
                        patch,
                        ((0, 0), (0, self.patch_size - ph), (0, self.patch_size - pw)),
                    )

                inp = torch.from_numpy(patch[None]).to(self.device)  # (1, 2, ps, ps)
                with torch.no_grad():
                    logits = self._model(inp)  # (1, 2, ps, ps)
                    probs = F.softmax(logits, dim=1)[0, 1]  # flood channel

                prob_patch = probs.cpu().numpy()[:ph, :pw]
                prob_acc[r0:r1, c0:c1] += prob_patch
                count_acc[r0:r1, c0:c1] += 1.0

        prob_map = prob_acc / np.maximum(count_acc, 1.0)
        binary_mask = (prob_map >= self.threshold).astype(np.uint8)
        mean_confidence = float(prob_map[binary_mask == 1].mean()) if binary_mask.any() else 0.0

        return binary_mask, mean_confidence


# ─── Vectorization ─────────────────────────────────────────────────────────────


def _remove_small_regions(mask: np.ndarray, min_pixels: int) -> np.ndarray:
    """Zero out connected components smaller than min_pixels."""
    from scipy import ndimage  # type: ignore[import]
    labeled, n = ndimage.label(mask)
    counts = np.bincount(labeled.ravel())
    small = np.where(counts < min_pixels)[0]
    clean = mask.copy()
    for idx in small:
        if idx == 0:
            continue
        clean[labeled == idx] = 0
    return clean


def vectorize_mask(
    binary_mask: np.ndarray,
    transform,
    crs_wkt: str,
    min_pixels: int = MIN_FLOOD_PIXELS,
) -> list[dict]:
    """
    Convert binary flood mask to a list of GeoJSON-like polygon dicts
    reprojected to EPSG:4326.

    Args:
        binary_mask: 2-D uint8 array (1=flood)
        transform: rasterio Affine transform for the mask
        crs_wkt: WKT string of the native CRS (e.g. UTM zone 18S)

    Returns:
        List of dicts with keys: geometry (GeoJSON), area_m2, confidence
    """
    from rasterio.features import shapes as rasterio_shapes
    from pyproj import Transformer

    clean = _remove_small_regions(binary_mask, min_pixels)

    polygons = []
    for geom, value in rasterio_shapes(clean, mask=clean, transform=transform):
        if value != 1:
            continue

        coords = geom["coordinates"][0]

        # Reproject from native CRS to WGS84
        try:
            transformer = Transformer.from_crs(crs_wkt, "EPSG:4326", always_xy=True)
            coords_wgs = [
                list(transformer.transform(x, y)) for x, y in coords
            ]
        except Exception as exc:
            logger.warning("CRS reprojection failed: %s — skipping polygon", exc)
            continue

        area_m2 = _shoelace_area(coords)

        polygons.append({
            "geometry": {
                "type": "Polygon",
                "coordinates": [coords_wgs],
            },
            "area_m2": area_m2,
        })

    logger.info("Vectorized %d flood polygons", len(polygons))
    return polygons


def _shoelace_area(coords: list) -> float:
    """Approximate polygon area in m² using the shoelace formula (planar coords)."""
    n = len(coords)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += coords[i][0] * coords[j][1]
        area -= coords[j][0] * coords[i][1]
    return abs(area) / 2.0


# ─── Full pipeline ─────────────────────────────────────────────────────────────


def sar_to_flood_polygons(
    scene_id: str,
    vv_linear: np.ndarray,
    vh_linear: np.ndarray,
    transform,
    crs_wkt: str,
    model: FloodSegmentationModel,
    threshold: float = 0.5,
    min_pixels: int = MIN_FLOOD_PIXELS,
) -> list[dict]:
    """
    Full pipeline: raw SAR arrays → flood polygons ready for PostGIS.

    Steps:
      1. Run model inference (patched, overlapping)
      2. Apply threshold → binary mask
      3. Remove small regions
      4. Vectorize + reproject to WGS84
      5. Return Feature dicts with metadata

    Returns:
        List of dicts suitable for INSERT into ml.flood_polygons:
          scene_id, geometry (WKT EPSG:4326), area_m2, confidence
    """
    logger.info("Running flood segmentation for scene %s", scene_id)

    binary_mask, mean_confidence = model.predict(vv_linear, vh_linear)

    polys = vectorize_mask(binary_mask, transform, crs_wkt, min_pixels=min_pixels)

    results = []
    for poly in polys:
        results.append({
            "scene_id": scene_id,
            "geometry": poly["geometry"],
            "area_m2": poly["area_m2"],
            "confidence": mean_confidence,
        })

    logger.info(
        "Scene %s: %d flood polygons, mean_confidence=%.3f",
        scene_id, len(results), mean_confidence,
    )
    return results
