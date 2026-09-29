-- Trained mass-movement (huayco / landslide / rockfall) model: inputs, artefact, outputs.
-- Written by costa_workers.ml.mass_movement (train + live + replay).
SET client_encoding = 'UTF8';

-- Daily rainfall on a 0.5-degree cell grid covering Lima and Callao.
-- source: 'era5' (Open-Meteo archive, training and replay) or
--         'open-meteo' (forecast API: recent past + forecast, live inference).
CREATE TABLE IF NOT EXISTS hydro.rain_cells_daily (
    cell_id    TEXT             NOT NULL,   -- "<lon>_<lat>" of the cell centre
    lon        DOUBLE PRECISION NOT NULL,
    lat        DOUBLE PRECISION NOT NULL,
    day        DATE             NOT NULL,
    precip_mm  DOUBLE PRECISION,
    source     TEXT             NOT NULL,
    PRIMARY KEY (cell_id, day, source)
);

-- Model registry: artefact (XGBoost JSON), features, and held-out metrics.
CREATE TABLE IF NOT EXISTS ml.models (
    name          TEXT        NOT NULL,
    version       TEXT        NOT NULL,
    trained_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    feature_names JSONB       NOT NULL,
    metrics       JSONB       NOT NULL,
    thresholds    JSONB       NOT NULL,
    artifact      TEXT        NOT NULL,
    PRIMARY KEY (name, version)
);

-- Per-district daily probability of a mass-movement event.
-- mode: 'live' (today / tomorrow from the forecast) or 'replay' (a past date).
CREATE TABLE IF NOT EXISTS ml.mass_movement_risk (
    ubigeo        CHAR(6)          NOT NULL,
    valid_date    DATE             NOT NULL,
    mode          TEXT             NOT NULL CHECK (mode IN ('live', 'replay')),
    probability   DOUBLE PRECISION NOT NULL,
    relative_risk DOUBLE PRECISION NOT NULL,   -- probability / training base rate
    risk_level    TEXT             NOT NULL,   -- low | medium | high | very_high
    model_version TEXT             NOT NULL,
    features      JSONB            NOT NULL,
    computed_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ubigeo, valid_date, mode, model_version)
);
CREATE INDEX IF NOT EXISTS mass_movement_risk_date_idx ON ml.mass_movement_risk (valid_date, mode);
