-- Costa Resiliente — PostGIS + TimescaleDB + pgstac schema bootstrap
-- Runs once on first container start via docker-entrypoint-initdb.d

-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- trigram search for social signals
CREATE EXTENSION IF NOT EXISTS unaccent; -- accent-insensitive Spanish search
-- pg_cron not available in timescaledb-ha image; retention handled by Prefect flow

-- ─── Schemas ──────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS geo;       -- spatial reference data
CREATE SCHEMA IF NOT EXISTS hydro;     -- hydrometeorological time-series
CREATE SCHEMA IF NOT EXISTS social;    -- ingested social signals
CREATE SCHEMA IF NOT EXISTS ml;        -- ML output tables
CREATE SCHEMA IF NOT EXISTS ops;       -- operator decision log, alerts

-- ─── geo: Lima Administrative Boundaries ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo.districts (
    id          SERIAL PRIMARY KEY,
    ubigeo      CHAR(6) UNIQUE NOT NULL,         -- INEI district code
    name        TEXT NOT NULL,
    province    TEXT NOT NULL DEFAULT 'Lima',
    region      TEXT NOT NULL DEFAULT 'Lima',
    geom        GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
    area_km2    DOUBLE PRECISION,
    population  INTEGER,                          -- INEI 2017
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS districts_geom_idx ON geo.districts USING GIST (geom);
CREATE INDEX IF NOT EXISTS districts_ubigeo_idx ON geo.districts (ubigeo);

-- ─── geo: Lima Watersheds ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo.watersheds (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    river       TEXT NOT NULL,  -- Rímac, Chillón, Lurín
    geom        GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
    area_km2    DOUBLE PRECISION,
    outlet_lat  DOUBLE PRECISION,
    outlet_lon  DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS watersheds_geom_idx ON geo.watersheds USING GIST (geom);

-- ─── geo: Quebradas (huayco-prone gullies) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo.quebradas (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    watershed_id    INTEGER REFERENCES geo.watersheds(id),
    geom            GEOMETRY(MULTILINESTRING, 4326),
    priority        INTEGER DEFAULT 5,  -- 1-10; top-10 get r.avaflow simulations
    threshold_24h_mm DOUBLE PRECISION,  -- IMERG 24h threshold to trigger avaflow
    -- XGBoost feature columns (static terrain — filled at geodata load time)
    slope_deg       DOUBLE PRECISION,
    aspect_deg      DOUBLE PRECISION,
    lithology_class INTEGER,            -- 0-5 per INGEMMET 1:100k map
    distance_to_stream_m DOUBLE PRECISION,
    ndvi            DOUBLE PRECISION,   -- updated periodically from Sentinel-2
    soil_moisture   DOUBLE PRECISION    -- updated from SMAP L3
);
CREATE INDEX IF NOT EXISTS quebradas_geom_idx ON geo.quebradas USING GIST (geom);

-- ─── geo: Critical Infrastructure ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo.infrastructure (
    id          BIGSERIAL PRIMARY KEY,
    osm_id      BIGINT,
    type        TEXT NOT NULL,  -- hospital, school, fire_station, substation, bridge, shelter
    name        TEXT,
    district_id INTEGER REFERENCES geo.districts(id),
    geom        GEOMETRY(POINT, 4326) NOT NULL,
    properties  JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS infra_geom_idx ON geo.infrastructure USING GIST (geom);
CREATE INDEX IF NOT EXISTS infra_type_idx ON geo.infrastructure (type);

-- ─── geo: CENEPRED SIGRID Hazard Zones ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo.hazard_zones (
    id           BIGSERIAL PRIMARY KEY,
    name         TEXT,
    hazard_type  TEXT NOT NULL,   -- flood | landslide | huayco | earthquake | tsunami
    level        TEXT NOT NULL,   -- muy_alto | alto | medio | bajo
    source_layer TEXT,            -- original SIGRID WFS layer name
    geom         GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
    loaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hazard_zones_geom_idx  ON geo.hazard_zones USING GIST (geom);
CREATE INDEX IF NOT EXISTS hazard_zones_type_idx  ON geo.hazard_zones (hazard_type);
CREATE INDEX IF NOT EXISTS hazard_zones_level_idx ON geo.hazard_zones (level);

-- ─── hydro: IMERG Rainfall Accumulations ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS hydro.imerg_accumulations (
    time            TIMESTAMPTZ NOT NULL,
    watershed_id    INTEGER NOT NULL REFERENCES geo.watersheds(id),
    acc_1h_mm       DOUBLE PRECISION,
    acc_3h_mm       DOUBLE PRECISION,
    acc_6h_mm       DOUBLE PRECISION,
    acc_12h_mm      DOUBLE PRECISION,
    acc_24h_mm      DOUBLE PRECISION,
    acc_72h_mm      DOUBLE PRECISION,
    source_scenes   TEXT[],   -- IMERG file names used
    PRIMARY KEY (time, watershed_id)
);
SELECT create_hypertable(
    'hydro.imerg_accumulations',
    'time',
    if_not_exists => TRUE
);
CREATE INDEX IF NOT EXISTS imerg_watershed_time_idx
    ON hydro.imerg_accumulations (watershed_id, time DESC);

-- ─── hydro: ANA / SENAMHI River Stations ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS hydro.stations (
    id          SERIAL PRIMARY KEY,
    code        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    source      TEXT NOT NULL,  -- ana, senamhi
    river       TEXT,
    geom        GEOMETRY(POINT, 4326),
    elevation_m DOUBLE PRECISION,
    active      BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS stations_geom_idx ON hydro.stations USING GIST (geom);

CREATE TABLE IF NOT EXISTS hydro.station_observations (
    time        TIMESTAMPTZ NOT NULL,
    station_id  INTEGER NOT NULL REFERENCES hydro.stations(id),
    level_m     DOUBLE PRECISION,
    flow_m3s    DOUBLE PRECISION,
    rain_mm     DOUBLE PRECISION,
    raw         JSONB,
    PRIMARY KEY (time, station_id)
);
SELECT create_hypertable(
    'hydro.station_observations',
    'time',
    if_not_exists => TRUE
);

-- ─── ml: SAR Flood Polygons ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ml.flood_polygons (
    id              BIGSERIAL PRIMARY KEY,
    scene_id        TEXT NOT NULL,   -- Sentinel-1 scene identifier
    acquired_at     TIMESTAMPTZ NOT NULL,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model_version   TEXT NOT NULL,
    confidence      DOUBLE PRECISION CHECK (confidence BETWEEN 0 AND 1),
    area_km2        DOUBLE PRECISION,
    geom            GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
    affected_districts INTEGER[],  -- district IDs intersecting flood
    stac_item_id    TEXT
);
CREATE INDEX IF NOT EXISTS flood_geom_idx ON ml.flood_polygons USING GIST (geom);
CREATE INDEX IF NOT EXISTS flood_acquired_idx ON ml.flood_polygons (acquired_at DESC);

-- ─── ml: Huayco Susceptibility ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ml.huayco_susceptibility (
    id              BIGSERIAL PRIMARY KEY,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    quebrada_id     INTEGER NOT NULL REFERENCES geo.quebradas(id),
    probability     DOUBLE PRECISION CHECK (probability BETWEEN 0 AND 1),
    risk_level      TEXT CHECK (risk_level IN ('very_low','low','medium','high','very_high')),
    trigger_rain_24h_mm DOUBLE PRECISION,
    model_version   TEXT,
    features_json   JSONB  -- input feature snapshot for audit/reproducibility
);
CREATE UNIQUE INDEX IF NOT EXISTS huayco_quebrada_time_uniq
    ON ml.huayco_susceptibility (quebrada_id, computed_at);
CREATE INDEX IF NOT EXISTS huayco_quebrada_time_idx
    ON ml.huayco_susceptibility (quebrada_id, computed_at DESC);

-- ─── social: Ingested Signals ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social.signals (
    id              BIGSERIAL PRIMARY KEY,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source          TEXT NOT NULL,  -- bluesky, reddit, rss_rpp, rss_andina, telegram, ...
    source_id       TEXT,           -- platform-native ID
    content_hash    TEXT NOT NULL,  -- SHA-256 of redacted content, for dedup
    published_at    TIMESTAMPTZ,
    content_redacted TEXT NOT NULL, -- PII-stripped text
    location_raw    TEXT,           -- extracted location entity before geocoding
    district_id     INTEGER REFERENCES geo.districts(id),
    geom            GEOMETRY(POINT, 4326),  -- coarsened to manzana centroid
    triage_label    TEXT CHECK (triage_label IN (
                        'needs_help','infrastructure_damage','road_blocked',
                        'weather_observation','false_alarm','irrelevant')),
    triage_confidence DOUBLE PRECISION,
    triage_model    TEXT,
    triage_at       TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL  -- 7 days from ingested_at
);
CREATE INDEX IF NOT EXISTS signals_geom_idx ON social.signals USING GIST (geom);
CREATE INDEX IF NOT EXISTS signals_source_idx ON social.signals (source, ingested_at DESC);
CREATE INDEX IF NOT EXISTS signals_label_idx ON social.signals (triage_label, ingested_at DESC);
CREATE INDEX IF NOT EXISTS signals_district_idx ON social.signals (district_id, ingested_at DESC);
CREATE INDEX IF NOT EXISTS signals_content_hash_idx ON social.signals (content_hash);

-- ─── ops: Alerts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.alerts (
    id          BIGSERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    type        TEXT NOT NULL,  -- flood, huayco, river_level, social_cluster, ...
    severity    TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
    status      TEXT NOT NULL CHECK (status IN ('active','acknowledged','escalated','closed','false_positive')),
    title       TEXT NOT NULL,
    description TEXT,
    district_id INTEGER REFERENCES geo.districts(id),
    geom        GEOMETRY(POINT, 4326),
    source_refs JSONB,  -- references to flood_polygon_id, signal_ids, etc.
    metadata    JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS alerts_geom_idx ON ops.alerts USING GIST (geom);
CREATE INDEX IF NOT EXISTS alerts_status_severity_idx ON ops.alerts (status, severity, created_at DESC);

-- ─── ops: Operator Decision Log (append-only, immutable) ─────────────────────
CREATE TABLE IF NOT EXISTS ops.decision_log (
    id              BIGSERIAL PRIMARY KEY,
    logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    operator_id     TEXT NOT NULL,  -- user identifier
    action_type     TEXT NOT NULL,  -- query, alert_ack, alert_escalate, alert_fp, map_pin, export
    alert_id        BIGINT REFERENCES ops.alerts(id),
    payload         JSONB NOT NULL, -- full action payload for EDAN-Perú export
    session_id      TEXT
);
-- Prevent updates/deletes — append-only enforced via application + trigger
CREATE OR REPLACE FUNCTION ops.prevent_decision_log_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'decision_log is append-only — DELETE and UPDATE are forbidden';
END;
$$;
CREATE TRIGGER decision_log_no_update
    BEFORE UPDATE OR DELETE ON ops.decision_log
    FOR EACH ROW EXECUTE FUNCTION ops.prevent_decision_log_mutation();

-- ─── Retention ────────────────────────────────────────────────────────────────
-- Signal expiry is handled by the Prefect retention flow (social.signals.expires_at)

-- ─── Spatial Reference Helpers ────────────────────────────────────────────────
-- Lima Metropolitana bounding box as a helper function
CREATE OR REPLACE FUNCTION geo.lima_bbox()
RETURNS GEOMETRY AS $$
    SELECT ST_MakeEnvelope(-77.2, -12.5, -76.7, -11.7, 4326)
$$ LANGUAGE SQL IMMUTABLE;
