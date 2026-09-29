"""Trained mass-movement model: P(huayco / landslide / rockfall event) per district-day.

What it predicts: the probability that SINPAD records at least one mass-movement
emergency (HUAYCO, DESLIZAMIENTO, DERRUMBE DE CERRO, ALUD) in a district within
the next 72 hours (the day itself and the two after), from the rain observed up
to that day. Rainy season only (Dec-Apr).

Hyperparameters and the 72 h target were chosen on a validation split inside
the training seasons (train 2003-2012, validate 2013-2016); the 2017-2020 test
seasons were not looked at until the final fit.

Features (all available both historically and live):
  r1, r3, r7, r14, r30   rain in the cell over the last 1/3/7/14/30 days (mm)
  rmax3                  wettest single day in the last 3 days (mm)
  susceptibility         CENEPRED mass-movement susceptibility, ordinal 1-4
  log_area               log10 of district area (km2): big districts report more
  hist_rate              the district's past event rate, leave-one-season-out
  doy_sin, doy_cos       position in the season

Validation is temporal: trained on 2003-2016, tested on 2017-2020, so the 2017
coastal El Niño, the event this product exists for, is never seen in training.
The rain-free baseline (susceptibility + history + season only) is trained on
the same split, so the report shows what the rainfall actually adds.

Usage (worker container):
    python -m costa_workers.ml.mass_movement fetch      # ERA5 seasons, cached in DB
    python -m costa_workers.ml.mass_movement train      # fit, evaluate, register
    python -m costa_workers.ml.mass_movement live       # today + tomorrow
    python -m costa_workers.ml.mass_movement replay 2017-03-14
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import asyncpg
import numpy as np

from costa_workers.ml import mass_movement_data as data

log = logging.getLogger(__name__)

MODEL_NAME = "mass_movement"
MODEL_VERSION = "xgb-fitted-sinpad-era5-v1"
TARGET_WINDOW_DAYS = 2   # label: event on day d, d+1 or d+2
FIRST_YEAR, LAST_YEAR = 2003, 2020
TEST_FROM_YEAR = 2017
FEATURES = ["r1", "r3", "r7", "r14", "r30", "rmax3", "susceptibility", "log_area",
            "hist_rate", "doy_sin", "doy_cos"]
RAIN_FREE = ["susceptibility", "log_area", "hist_rate", "doy_sin", "doy_cos"]
SUSCEPTIBILITY = {"bajo": 1, "medio": 2, "alto": 3, "muy_alto": 4}
XGB_PARAMS = {
    "objective": "binary:logistic", "eval_metric": "aucpr", "max_depth": 2,
    "learning_rate": 0.05, "subsample": 0.8, "colsample_bytree": 0.9,
    "min_child_weight": 20, "reg_lambda": 2.0, "tree_method": "hist", "seed": 42,
}
NUM_ROUNDS = 150


def _dsn() -> str:
    from costa_workers.ingest.social import _db_dsn
    return _db_dsn()


def _season_of(d: date) -> int:
    """Season label: Dec 2016 belongs to the 2017 season."""
    return d.year + 1 if d.month == 12 else d.year


def season_days(first_year: int, last_year: int) -> list[date]:
    out = []
    d = date(first_year, 1, 1)
    while d <= date(last_year, 12, 31):
        if d.month in data.SEASON_MONTHS and _season_of(d) <= last_year:
            out.append(d)
        d += timedelta(days=1)
    return out


def rain_features(series: dict[tuple[str, date], float], cell: str, day: date) -> dict[str, float]:
    window = [series.get((cell, day - timedelta(days=k)), 0.0) for k in range(data.ANTECEDENT_DAYS)]
    return {
        "r1": window[0], "r3": sum(window[:3]), "r7": sum(window[:7]),
        "r14": sum(window[:14]), "r30": sum(window), "rmax3": max(window[:3]),
    }


def static_features(district: dict, day: date, hist_rate: float) -> dict[str, float]:
    doy = day.timetuple().tm_yday
    return {
        "susceptibility": SUSCEPTIBILITY.get(district["susceptibility"] or "", 2),
        "log_area": math.log10(max(district["area_km2"] or 1.0, 1.0)),
        "hist_rate": hist_rate,
        "doy_sin": math.sin(2 * math.pi * doy / 366), "doy_cos": math.cos(2 * math.pi * doy / 366),
    }


def within_window(events: set[tuple[str, date]]) -> set[tuple[str, date]]:
    """Label set for the 72 h target: day d is positive if an event falls on d..d+2."""
    return {(u, d - timedelta(days=k)) for (u, d) in events for k in range(TARGET_WINDOW_DAYS + 1)}


def history_rates(events: set[tuple[str, date]], seasons: list[int]) -> dict[str, dict[int, float]]:
    """Per district, events-per-season over the given seasons, leaving each season out in turn."""
    per = defaultdict(lambda: defaultdict(int))
    for ub, d in events:
        s = _season_of(d)
        if s in seasons and d.month in data.SEASON_MONTHS:
            per[ub][s] += 1
    out: dict[str, dict[int, float]] = {}
    n = len(seasons)
    for ub, counts in per.items():
        total = sum(counts.values())
        out[ub] = {s: (total - counts.get(s, 0)) / max(n - 1, 1) for s in seasons}
        out[ub]["all"] = total / n
    return out


def build_matrix(districts, events, rain, days, rates, rate_key):
    """X, y, (ubigeo, day) index. rate_key(season) picks the history value per row."""
    X, y, idx = [], [], []
    for d in districts:
        r = rates.get(d["ubigeo"], {})
        for day in days:
            f = rain_features(rain, d["cell_id"], day)
            f.update(static_features(d, day, r.get(rate_key(_season_of(day)), r.get("all", 0.0))))
            X.append([f[k] for k in FEATURES])
            y.append(1 if (d["ubigeo"], day) in events else 0)
            idx.append((d["ubigeo"], day))
    return np.asarray(X, dtype=np.float32), np.asarray(y, dtype=np.int8), idx


def _fit(X, y, cols):
    import xgboost as xgb
    sel = [FEATURES.index(c) for c in cols]
    booster = xgb.train(XGB_PARAMS, xgb.DMatrix(X[:, sel], label=y, feature_names=cols), NUM_ROUNDS)
    return booster, sel


def _predict(booster, X, sel, cols):
    import xgboost as xgb
    return booster.predict(xgb.DMatrix(X[:, sel], feature_names=cols))


def evaluate(y, p, base_rate: float) -> dict:
    from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
    order = np.argsort(-p)
    top = order[: max(1, len(p) // 10)]
    return {
        "n": int(len(y)), "events": int(y.sum()),
        "roc_auc": round(float(roc_auc_score(y, p)), 4),
        "pr_auc": round(float(average_precision_score(y, p)), 4),
        "pr_auc_random": round(float(y.mean()), 5),
        "brier": round(float(brier_score_loss(y, p)), 6),
        "events_in_top_decile": round(float(y[top].sum() / max(y.sum(), 1)), 3),
        "base_rate_train": round(base_rate, 6),
    }


async def train() -> dict:
    conn = await asyncpg.connect(_dsn())
    try:
        districts = await data.load_districts(conn)
        events = within_window(await data.load_events(conn))
        rain = await data.load_rain(conn, "era5", date(FIRST_YEAR - 1, 11, 1), date(LAST_YEAR, 12, 31))
        if not rain:
            raise RuntimeError("no ERA5 rain cached: run `fetch` first")
        train_days = [d for d in season_days(FIRST_YEAR, LAST_YEAR) if _season_of(d) < TEST_FROM_YEAR]
        test_days = [d for d in season_days(FIRST_YEAR, LAST_YEAR) if _season_of(d) >= TEST_FROM_YEAR]
        train_seasons = sorted({_season_of(d) for d in train_days})
        rates = history_rates(events, train_seasons)

        # Train rows use leave-one-season-out history; test rows use all training seasons.
        Xtr, ytr, _ = build_matrix(districts, events, rain, train_days, rates, lambda s: s)
        Xte, yte, idx_te = build_matrix(districts, events, rain, test_days, rates, lambda s: "all")
        base_rate = float(ytr.mean())
        log.info("train %s rows (%d events), test %s rows (%d events)", len(ytr), ytr.sum(), len(yte), yte.sum())

        model, sel = _fit(Xtr, ytr, FEATURES)
        baseline, bsel = _fit(Xtr, ytr, RAIN_FREE)
        p_te = _predict(model, Xte, sel, FEATURES)
        p_base = _predict(baseline, Xte, bsel, RAIN_FREE)

        in_2017 = np.array([_season_of(d) == 2017 for _, d in idx_te])
        metrics = {
            "test_2017_2020": evaluate(yte, p_te, base_rate),
            "baseline_no_rain_2017_2020": evaluate(yte, p_base, base_rate),
            "test_2017_only": evaluate(yte[in_2017], p_te[in_2017], base_rate),
            "train_seasons": f"{FIRST_YEAR}-{TEST_FROM_YEAR - 1}",
            "test_seasons": f"{TEST_FROM_YEAR}-{LAST_YEAR}",
            "unit": "district-day, Dec-Apr",
            "target": "at least one event in the next 72 h (day d to d+2)",
            "selection": "depth/rounds/target chosen on validation 2013-2016 inside training",
            "districts": len(districts),
            "rain_source": "ERA5 (Open-Meteo archive), 0.5-degree cells",
            "labels": "SINPAD/INDECI 2003-2020: huayco, deslizamiento, derrumbe de cerro, alud",
        }
        gain = model.get_score(importance_type="gain")
        metrics["feature_gain"] = {k: round(v, 2) for k, v in sorted(gain.items(), key=lambda kv: -kv[1])}

        # Risk levels are multiples of the training base rate, so they mean the
        # same thing in the dry season as in an El Niño.
        thresholds = {"medium": 2.0, "high": 5.0, "very_high": 10.0, "base_rate": base_rate}
        await conn.execute(
            """
            INSERT INTO ml.models (name, version, feature_names, metrics, thresholds, artifact)
            VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6)
            ON CONFLICT (name, version) DO UPDATE SET trained_at = NOW(),
                feature_names = EXCLUDED.feature_names, metrics = EXCLUDED.metrics,
                thresholds = EXCLUDED.thresholds, artifact = EXCLUDED.artifact
            """,
            MODEL_NAME, MODEL_VERSION, json.dumps(FEATURES), json.dumps(metrics),
            json.dumps(thresholds), model.save_raw("json").decode(),
        )
        return metrics
    finally:
        await conn.close()


def risk_level(relative: float, thresholds: dict) -> str:
    if relative >= thresholds["very_high"]:
        return "very_high"
    if relative >= thresholds["high"]:
        return "high"
    if relative >= thresholds["medium"]:
        return "medium"
    return "low"


async def _load_model(conn):
    import xgboost as xgb
    row = await conn.fetchrow(
        "SELECT artifact, thresholds FROM ml.models WHERE name=$1 AND version=$2", MODEL_NAME, MODEL_VERSION
    )
    if row is None:
        raise RuntimeError("model not trained: run `train` first")
    booster = xgb.Booster()
    booster.load_model(bytearray(row["artifact"].encode()))
    return booster, json.loads(row["thresholds"])


async def score(days: list[date], mode: str, source: str) -> int:
    """Score every district on the given days and store the results."""
    conn = await asyncpg.connect(_dsn())
    try:
        districts = await data.load_districts(conn)
        if source == "open-meteo":
            await data.fetch_live(conn, districts)
        else:
            # Replays inside the cached training seasons need no network at all.
            cached = await conn.fetchval(
                "SELECT COUNT(DISTINCT day) FROM hydro.rain_cells_daily WHERE source='era5' "
                "AND day BETWEEN $1 AND $2",
                min(days) - timedelta(days=data.ANTECEDENT_DAYS), max(days),
            )
            if cached < (max(days) - min(days)).days + data.ANTECEDENT_DAYS:
                for d in days:
                    await data.fetch_era5_window(conn, districts, d)
        rain = await data.load_rain(conn, source, min(days) - timedelta(days=data.ANTECEDENT_DAYS), max(days))
        events = await data.load_events(conn)
        rates = history_rates(events, list(range(FIRST_YEAR, TEST_FROM_YEAR)))
        booster, thr = await _load_model(conn)
        X, _, idx = build_matrix(districts, set(), rain, days, rates, lambda s: "all")
        p = _predict(booster, X, list(range(len(FEATURES))), FEATURES)
        rows = []
        for (ub, day), prob, feats in zip(idx, p, X):
            rel = float(prob) / thr["base_rate"]
            rows.append((ub, day, mode, float(prob), rel, risk_level(rel, thr), MODEL_VERSION,
                         json.dumps({k: round(float(v), 2) for k, v in zip(FEATURES, feats)})))
        await conn.executemany(
            """
            INSERT INTO ml.mass_movement_risk
                (ubigeo, valid_date, mode, probability, relative_risk, risk_level, model_version, features)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
            ON CONFLICT (ubigeo, valid_date, mode, model_version) DO UPDATE SET
                probability = EXCLUDED.probability, relative_risk = EXCLUDED.relative_risk,
                risk_level = EXCLUDED.risk_level, features = EXCLUDED.features, computed_at = NOW()
            """,
            rows,
        )
        return len(rows)
    finally:
        await conn.close()


async def _fetch() -> int:
    conn = await asyncpg.connect(_dsn())
    try:
        districts = await data.load_districts(conn)
        return await data.fetch_era5_seasons(conn, districts, FIRST_YEAR, LAST_YEAR)
    finally:
        await conn.close()


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "fetch":
        print("cell-days stored:", asyncio.run(_fetch()))
    elif cmd == "train":
        print(json.dumps(asyncio.run(train()), indent=2))
    elif cmd == "live":
        today = datetime.now(ZoneInfo("America/Lima")).date()
        print("rows:", asyncio.run(score([today, today + timedelta(days=1)], "live", "open-meteo")))
    elif cmd == "replay":
        # replay 2017-03-14            one day
        # replay 2017-01-01 2017-04-30 every day in a range
        first = date.fromisoformat(argv[2])
        last = date.fromisoformat(argv[3]) if len(argv) > 3 else first
        days = [first + timedelta(days=i) for i in range((last - first).days + 1)]
        print("rows:", asyncio.run(score(days, "replay", "era5")))
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
