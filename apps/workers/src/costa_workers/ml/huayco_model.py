"""XGBoost huayco susceptibility model.

Methodology: Castro-Cabrera et al. (2024), "A Comparative Study of Susceptibility
and Hazard for Mass Movements ... Northern Lima Commonwealth, Peru",
Geosciences 14(6):168. DOI:10.3390/geosciences14060168

Features (9 total. Castro-Cabrera Table 2 + IMERG rainfall):
  slope_deg: terrain slope in degrees (DEM-derived)
  aspect_deg: slope aspect in degrees (0-360, 0=North)
  lithology_class: integer code 0-5 (INGEMMET 100k map)
  distance_to_stream_m: Euclidean distance to nearest stream (m)
  ndvi: Normalized Difference Vegetation Index (Sentinel-2)
  soil_moisture: SMAP L3 volumetric (m³/m³)
  rain_24h_mm: IMERG 24h accumulation (mm)
  rain_72h_mm: IMERG 72h accumulation (mm)
  rain_7d_mm: IMERG 7d accumulation (mm)

Risk levels (matching Castro-Cabrera susceptibility classes):
  < 0.2  → very_low
  < 0.4  → low
  < 0.6  → medium
  < 0.8  → high
  ≥ 0.8  → very_high

Training data priority:
  1. CENEPRED SIGRID historical events (points + polygons for Lima quebradas)
  2. Castro-Cabrera synthetic labels (fallback for initial training)

Model persistence:
  - Saved as XGBoost native binary at WEIGHTS_PATH
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np

logger = logging.getLogger(__name__)

WEIGHTS_PATH = Path(__file__).parent.parent.parent.parent / "weights" / "huayco_xgb.ubj"

# ─── XGBoost hyperparameters (tuned on Castro-Cabrera feature distributions) ──
XGB_PARAMS = {
    "objective": "binary:logistic",
    "eval_metric": ["auc", "logloss"],
    "max_depth": 6,
    "learning_rate": 0.05,
    "n_estimators": 400,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 3,
    "scale_pos_weight": 4.0,   # huayco events are rare (~1:4 ratio)
    "seed": 42,
    "tree_method": "hist",     # CPU-efficient
    "device": "cpu",
}

FEATURE_NAMES = [
    "slope_deg",
    "aspect_deg",
    "lithology_class",
    "distance_to_stream_m",
    "ndvi",
    "soil_moisture",
    "rain_24h_mm",
    "rain_72h_mm",
    "rain_7d_mm",
]

# ─── Risk thresholds (Castro-Cabrera Table 5 equivalent) ──────────────────────
RISK_THRESHOLDS = [
    (0.20, "very_low"),
    (0.40, "low"),
    (0.60, "medium"),
    (0.80, "high"),
]


def risk_level(probability: float) -> str:
    """Map [0,1] susceptibility probability to categorical risk level."""
    for threshold, level in RISK_THRESHOLDS:
        if probability < threshold:
            return level
    return "very_high"


# ─── Feature dataclass ─────────────────────────────────────────────────────────

@dataclass
class HuaycoFeatures:
    slope_deg: float
    aspect_deg: float
    lithology_class: int
    distance_to_stream_m: float
    ndvi: float
    soil_moisture: float
    rain_24h_mm: float
    rain_72h_mm: float
    rain_7d_mm: float

    def to_array(self) -> np.ndarray:
        return np.array([
            self.slope_deg,
            self.aspect_deg,
            self.lithology_class,
            self.distance_to_stream_m,
            self.ndvi,
            self.soil_moisture,
            self.rain_24h_mm,
            self.rain_72h_mm,
            self.rain_7d_mm,
        ], dtype=np.float32)

    def validate(self) -> None:
        """Raise ValueError on physically impossible values."""
        if not 0.0 <= self.slope_deg <= 90.0:
            raise ValueError(f"slope_deg must be in [0,90], got {self.slope_deg}")
        if not 0.0 <= self.aspect_deg <= 360.0:
            raise ValueError(f"aspect_deg must be in [0,360], got {self.aspect_deg}")
        if not 0 <= self.lithology_class <= 5:
            raise ValueError(f"lithology_class must be in [0,5], got {self.lithology_class}")
        if self.distance_to_stream_m < 0:
            raise ValueError(f"distance_to_stream_m must be ≥ 0, got {self.distance_to_stream_m}")
        if not -1.0 <= self.ndvi <= 1.0:
            raise ValueError(f"ndvi must be in [-1,1], got {self.ndvi}")
        if not 0.0 <= self.soil_moisture <= 1.0:
            raise ValueError(f"soil_moisture must be in [0,1], got {self.soil_moisture}")
        for name, val in [("rain_24h_mm", self.rain_24h_mm),
                           ("rain_72h_mm", self.rain_72h_mm),
                           ("rain_7d_mm", self.rain_7d_mm)]:
            if val < 0:
                raise ValueError(f"{name} must be ≥ 0, got {val}")


def features_to_matrix(samples: Sequence[HuaycoFeatures]) -> np.ndarray:
    """Stack a list of HuaycoFeatures into (N, 9) float32 matrix."""
    return np.stack([f.to_array() for f in samples], axis=0)


# ─── Heuristic fallback (no model weights) ────────────────────────────────────

def _slope_heuristic(X: np.ndarray) -> np.ndarray:
    """
    Slope+rainfall heuristic used when model weights are absent.
    slope_deg (col 0), rain_24h_mm (col 6): jointly drive susceptibility.
    Not calibrated: development/smoke-testing only.
    """
    slope_norm = np.clip(X[:, 0] / 45.0, 0, 1)
    rain_norm  = np.clip(X[:, 6] / 50.0, 0, 1)
    return (0.6 * slope_norm + 0.4 * rain_norm).astype(np.float32)


# ─── Model class ───────────────────────────────────────────────────────────────

class HuaycoModel:
    """
    XGBoost huayco susceptibility classifier.

    Usage:
        model = HuaycoModel()
        model.load()
        probabilities = model.predict_proba([feat1, feat2, ...])
    """

    def __init__(self, weights_path: Path = WEIGHTS_PATH):
        self.weights_path = weights_path
        self._booster = None

    def load(self) -> None:
        """Load pre-trained XGBoost Booster from disk."""
        import xgboost as xgb

        if not self.weights_path.exists():
            logger.warning(
                "Huayco weights not found at %s: using slope heuristic fallback",
                self.weights_path,
            )
            return

        self._booster = xgb.Booster()
        self._booster.load_model(str(self.weights_path))
        logger.info("Huayco XGBoost loaded from %s", self.weights_path)

    def train(
        self,
        X: np.ndarray,
        y: np.ndarray,
        X_val: np.ndarray | None = None,
        y_val: np.ndarray | None = None,
    ) -> dict:
        """
        Train on feature matrix X (N×9) and binary labels y (1=huayco event).
        Saves model to WEIGHTS_PATH. Returns final eval metrics dict.
        """
        import xgboost as xgb

        dtrain = xgb.DMatrix(X, label=y, feature_names=FEATURE_NAMES)
        evals = [(dtrain, "train")]
        evals_result: dict = {}

        params = {k: v for k, v in XGB_PARAMS.items() if k != "n_estimators"}
        n = XGB_PARAMS["n_estimators"]

        if X_val is not None and y_val is not None:
            dval = xgb.DMatrix(X_val, label=y_val, feature_names=FEATURE_NAMES)
            evals.append((dval, "val"))

        self._booster = xgb.train(
            params,
            dtrain,
            num_boost_round=n,
            evals=evals,
            evals_result=evals_result,
            early_stopping_rounds=30,
            verbose_eval=False,
        )

        self.weights_path.parent.mkdir(parents=True, exist_ok=True)
        self._booster.save_model(str(self.weights_path))
        logger.info("Huayco model saved to %s", self.weights_path)

        metrics: dict = {}
        if evals_result:
            last_key = list(evals_result.keys())[-1]
            for metric, values in evals_result[last_key].items():
                metrics[f"{last_key}_{metric}"] = values[-1]
        return metrics

    def predict_proba(self, features: Sequence[HuaycoFeatures]) -> np.ndarray:
        """
        Return susceptibility probability in [0, 1] for each feature set.
        Falls back to slope heuristic if weights not loaded.
        """
        if not features:
            return np.array([], dtype=np.float32)

        X = features_to_matrix(features)
        # Clamp to physically valid ranges: guards against DEM / sensor noise in DB.
        # Order must match FEATURE_NAMES: slope, aspect, lithology, dist_stream,
        # ndvi, soil_moisture, rain_24h, rain_72h, rain_7d
        _MINS = np.array([ 0.0,   0.0, 0,    0.0, -1.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        _MAXS = np.array([90.0, 360.0, 5, 1e6,  1.0, 1.0, 1e4, 1e4, 1e4], dtype=np.float32)
        X = np.clip(X, _MINS, _MAXS)

        if self._booster is None:
            logger.warning("Using slope-heuristic fallback (no model loaded)")
            return _slope_heuristic(X)

        import xgboost as xgb
        dmatrix = xgb.DMatrix(X, feature_names=FEATURE_NAMES)
        return self._booster.predict(dmatrix)

    def predict_quebrada(self, quebrada_id: int, features: HuaycoFeatures) -> dict:
        """Predict for a single quebrada; returns a DB-ready result dict."""
        proba = float(self.predict_proba([features])[0])
        return {
            "quebrada_id": quebrada_id,
            "probability": proba,
            "risk_level": risk_level(proba),
            "features": {n: getattr(features, n) for n in FEATURE_NAMES},
        }


# ─── DB pipeline ───────────────────────────────────────────────────────────────

async def run_huayco_susceptibility(db_dsn: str, model: HuaycoModel) -> list[dict]:
    """
    Pull current features for all quebradas from DB, run inference,
    and upsert results into ml.huayco_susceptibility.

    Feature sources:
      slope/aspect/lithology/distance: geo.quebradas static columns
      ndvi/soil_moisture: geo.quebradas (updated by Sentinel-2 worker)
      rain_*: hydro.imerg_accumulations LATERAL join
    """
    import asyncpg
    import json
    from datetime import datetime, timezone

    async with asyncpg.create_pool(db_dsn, min_size=1, max_size=3) as pool:
        rows = await pool.fetch(
            """
            SELECT
                q.id,
                q.name,
                COALESCE(q.slope_deg, 15.0)            AS slope_deg,
                COALESCE(q.aspect_deg, 180.0)          AS aspect_deg,
                COALESCE(q.lithology_class, 2)         AS lithology_class,
                COALESCE(q.distance_to_stream_m, 100.0) AS distance_to_stream_m,
                COALESCE(q.ndvi, 0.30)                 AS ndvi,
                COALESCE(q.soil_moisture, 0.25)        AS soil_moisture,
                COALESCE(ia24.acc_24h_mm, 0.0)         AS rain_24h_mm,
                COALESCE(ia72.acc_72h_mm, 0.0)         AS rain_72h_mm,
                COALESCE(ia7d.acc_168h_mm, 0.0)        AS rain_7d_mm
            FROM geo.quebradas q
            LEFT JOIN LATERAL (
                SELECT ia.acc_24h_mm
                FROM hydro.imerg_accumulations ia
                WHERE ia.watershed_id = q.watershed_id
                ORDER BY ia.time DESC LIMIT 1
            ) ia24 ON TRUE
            LEFT JOIN LATERAL (
                SELECT ia.acc_72h_mm
                FROM hydro.imerg_accumulations ia
                WHERE ia.watershed_id = q.watershed_id
                ORDER BY ia.time DESC LIMIT 1
            ) ia72 ON TRUE
            LEFT JOIN LATERAL (
                SELECT ia.acc_168h_mm
                FROM hydro.imerg_accumulations ia
                WHERE ia.watershed_id = q.watershed_id
                ORDER BY ia.time DESC LIMIT 1
            ) ia7d ON TRUE
            ORDER BY q.priority
            """
        )

        if not rows:
            return []

        features = [
            HuaycoFeatures(
                slope_deg=float(r["slope_deg"]),
                aspect_deg=float(r["aspect_deg"]),
                lithology_class=int(r["lithology_class"]),
                distance_to_stream_m=float(r["distance_to_stream_m"]),
                ndvi=float(r["ndvi"]),
                soil_moisture=float(r["soil_moisture"]),
                rain_24h_mm=float(r["rain_24h_mm"]),
                rain_72h_mm=float(r["rain_72h_mm"]),
                rain_7d_mm=float(r["rain_7d_mm"]),
            )
            for r in rows
        ]

        probs = model.predict_proba(features)
        now = datetime.now(timezone.utc)
        results = []

        for row, feat, prob in zip(rows, features, probs):
            level = risk_level(float(prob))
            feat_json = json.dumps({n: getattr(feat, n) for n in FEATURE_NAMES})
            await pool.execute(
                """
                INSERT INTO ml.huayco_susceptibility
                    (quebrada_id, probability, risk_level, computed_at,
                     trigger_rain_24h_mm, features_json)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                ON CONFLICT (quebrada_id, computed_at) DO UPDATE SET
                    probability = EXCLUDED.probability,
                    risk_level  = EXCLUDED.risk_level,
                    trigger_rain_24h_mm = EXCLUDED.trigger_rain_24h_mm,
                    features_json = EXCLUDED.features_json
                """,
                row["id"], float(prob), level, now,
                feat.rain_24h_mm, feat_json,
            )
            results.append({
                "quebrada_id": row["id"],
                "name": row["name"],
                "probability": float(prob),
                "risk_level": level,
            })

    return results
