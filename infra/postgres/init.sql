-- Costa Resiliente — PostGIS + TimescaleDB + pgstac schema bootstrap
-- Runs once on first container start via docker-entrypoint-initdb.d

-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- trigram search for social signals
CREATE EXTENSION IF NOT EXISTS unaccent; -- accent-insensitive Spanish search
CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector for RAG embeddings
-- pg_cron not available in timescaledb-ha image; retention handled by Prefect flow

-- ─── Schemas ──────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS geo;       -- spatial reference data
CREATE SCHEMA IF NOT EXISTS hydro;     -- hydrometeorological time-series
CREATE SCHEMA IF NOT EXISTS social;    -- ingested social signals
CREATE SCHEMA IF NOT EXISTS ml;        -- ML output tables
CREATE SCHEMA IF NOT EXISTS ops;       -- operator decision log, alerts
CREATE SCHEMA IF NOT EXISTS rag;       -- protocol documents + embeddings

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
CREATE UNIQUE INDEX IF NOT EXISTS flood_polygons_scene_id_uniq ON ml.flood_polygons (scene_id);

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
                        'huayco_observation','flood_observation',
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
CREATE UNIQUE INDEX IF NOT EXISTS signals_content_hash_uniq ON social.signals (content_hash);
-- Partial index for triage worker: scans untriaged rows ordered by ingested_at ASC
CREATE INDEX IF NOT EXISTS signals_triage_pending_idx ON social.signals (ingested_at ASC)
    WHERE triage_at IS NULL;

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
-- Alert generator runs every 5 min with 8 per-type queries (dedup + auto-resolve).
-- Without this index each query scans the full table.
CREATE INDEX IF NOT EXISTS alerts_type_status_time_idx ON ops.alerts (type, status, created_at DESC);
-- District-filtered reads from copilot/api tools and social dedup.
CREATE INDEX IF NOT EXISTS alerts_district_status_idx ON ops.alerts (district_id, status, created_at DESC);
-- GIN index for JSONB containment queries on source_refs (flood_polygon_id, watershed_id, etc.)
CREATE INDEX IF NOT EXISTS alerts_source_refs_gin_idx ON ops.alerts USING GIN (source_refs);

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
CREATE INDEX IF NOT EXISTS decision_log_ts_idx    ON ops.decision_log (logged_at DESC);
CREATE INDEX IF NOT EXISTS decision_log_op_ts_idx ON ops.decision_log (operator_id, logged_at DESC);

-- ─── ops: Share tokens ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.share_tokens (
    id          BIGSERIAL PRIMARY KEY,
    token       TEXT UNIQUE NOT NULL,
    scenario    JSONB NOT NULL,           -- {districtUbigeo, districtName, timeWindowHours, isReplayMode, replayDate, activeLayers}
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
    accessed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS share_tokens_token_idx ON ops.share_tokens (token);
CREATE INDEX IF NOT EXISTS share_tokens_expires_idx ON ops.share_tokens (expires_at);

-- ─── Retention ────────────────────────────────────────────────────────────────
-- Signal expiry is handled by the Prefect retention flow (social.signals.expires_at)
-- Share tokens expire automatically; expired tokens rejected at query time

-- ─── ops: Security Events ────────────────────────────────────────────────────
-- Append-only log of guardrail triggers (input blocks, output redactions)
CREATE TABLE IF NOT EXISTS ops.security_events (
    id          BIGSERIAL PRIMARY KEY,
    operator_id TEXT NOT NULL,
    event_type  TEXT NOT NULL,          -- input_blocked | output_redacted
    detail      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS security_events_op_idx ON ops.security_events (operator_id);
CREATE INDEX IF NOT EXISTS security_events_ts_idx  ON ops.security_events (created_at DESC);

-- ─── ops: Alert Proposals (HITL gate) ───────────────────────────────────────
-- AI can only propose alerts; a human must approve before insertion into ops.alerts
CREATE TABLE IF NOT EXISTS ops.alert_proposals (
    id              BIGSERIAL PRIMARY KEY,
    proposed_by     TEXT NOT NULL DEFAULT 'copilot',
    severity        TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
    alert_type      TEXT NOT NULL,
    district_ubigeo CHAR(6),
    title           TEXT NOT NULL,
    summary         TEXT NOT NULL,
    source_refs     JSONB,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected')),
    reviewed_by     TEXT,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS alert_proposals_status_idx ON ops.alert_proposals (status);

-- ─── ops: Operators (SINAGERD tiers) ────────────────────────────────────────
-- Three tiers: coen (national), coer (regional), coel (district).
-- COEL operators are scoped to a single district_ubigeo.
CREATE TABLE IF NOT EXISTS ops.operators (
    id              BIGSERIAL PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    full_name       TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('coen','coer','coel')),
    district_ubigeo CHAR(6),       -- required for coel, ignored for coen/coer
    password_hash   TEXT NOT NULL, -- argon2/bcrypt via passlib
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS operators_username_idx ON ops.operators (username);

-- ─── ops: Notification Subscribers + Delivery Log ───────────────────────────
-- Operators register webhook/email endpoints. Fan-out fires on escalated alerts
-- and on new alerts with severity in (critical, high).
CREATE TABLE IF NOT EXISTS ops.notification_subscribers (
    id              BIGSERIAL PRIMARY KEY,
    channel         TEXT NOT NULL CHECK (channel IN ('webhook', 'email', 'sms_stub')),
    target          TEXT NOT NULL,          -- URL for webhook; address for email/sms
    label           TEXT NOT NULL,          -- human-readable name
    severity_min    TEXT NOT NULL DEFAULT 'high'
                        CHECK (severity_min IN ('critical','high','medium','low')),
    district_filter TEXT,                   -- ubigeo prefix filter; NULL = all districts
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      TEXT NOT NULL DEFAULT 'system',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notif_sub_active_idx ON ops.notification_subscribers (active, severity_min);

CREATE TABLE IF NOT EXISTS ops.notification_deliveries (
    id              BIGSERIAL PRIMARY KEY,
    subscriber_id   BIGINT NOT NULL REFERENCES ops.notification_subscribers(id),
    alert_id        BIGINT REFERENCES ops.alerts(id),
    trigger_event   TEXT NOT NULL,          -- 'new_alert' | 'alert_escalated' | 'dispatch'
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','delivered','failed','skipped')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    delivered_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notif_del_sub_idx   ON ops.notification_deliveries (subscriber_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notif_del_alert_idx ON ops.notification_deliveries (alert_id);

-- ─── rag: Protocol Documents ─────────────────────────────────────────────────
-- Stores chunked text from INDECI/CENEPRED/MINSA manuals + their embeddings
-- nomic-embed-text produces 768-dim vectors; bge-m3 produces 1024-dim.
-- Default: 768 (nomic-embed-text). Change LLM_EMBED_MODEL + vector(dim) together.
CREATE TABLE IF NOT EXISTS rag.documents (
    id          BIGSERIAL PRIMARY KEY,
    source      TEXT NOT NULL,          -- e.g. "INDECI_Plan_Familiar_2024"
    title       TEXT NOT NULL,
    lang        CHAR(2) NOT NULL DEFAULT 'es',
    chunk_index INTEGER NOT NULL DEFAULT 0,
    chunk       TEXT NOT NULL,
    embedding   vector(768),            -- nomic-embed-text dimension
    content_hash CHAR(64),              -- SHA-256 for idempotent upsert
    meta        JSONB,                  -- page, section, url, etc.
    indexed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rag_documents_source_idx    ON rag.documents (source);
CREATE UNIQUE INDEX IF NOT EXISTS rag_documents_content_hash_unique ON rag.documents (content_hash);
-- HNSW index for fast ANN search (safe to create on empty table)
CREATE INDEX IF NOT EXISTS rag_documents_embedding_hnsw ON rag.documents
    USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);

-- ─── Read-Only AI Database Role ──────────────────────────────────────────────
-- Used by the agentic copilot. SELECT-only on data schemas, no write access.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'costa_ai_ro') THEN
        CREATE ROLE costa_ai_ro LOGIN PASSWORD 'change_me_in_production';
    END IF;
END
$$;

-- Grant connect + usage
GRANT CONNECT ON DATABASE costa_resiliente TO costa_ai_ro;
GRANT USAGE ON SCHEMA geo, hydro, social, ml, ops, rag TO costa_ai_ro;

-- Grant SELECT on all current + future tables in each schema
GRANT SELECT ON ALL TABLES IN SCHEMA geo     TO costa_ai_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA hydro   TO costa_ai_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA ml      TO costa_ai_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA rag     TO costa_ai_ro;

-- social: read only the redacted view (no raw handles / URLs)
GRANT SELECT ON ALL TABLES IN SCHEMA social TO costa_ai_ro;
-- ops: alerts + decision_log read-only; NO write access whatsoever
GRANT SELECT ON ops.alerts, ops.decision_log, ops.alert_proposals TO costa_ai_ro;

-- Future tables auto-granted (run after each migration)
ALTER DEFAULT PRIVILEGES IN SCHEMA geo     GRANT SELECT ON TABLES TO costa_ai_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA hydro   GRANT SELECT ON TABLES TO costa_ai_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA social  GRANT SELECT ON TABLES TO costa_ai_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA ml      GRANT SELECT ON TABLES TO costa_ai_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA rag     GRANT SELECT ON TABLES TO costa_ai_ro;

-- ─── Spatial Reference Helpers ────────────────────────────────────────────────
-- Lima Metropolitana bounding box as a helper function
CREATE OR REPLACE FUNCTION geo.lima_bbox()
RETURNS GEOMETRY AS $$
    SELECT ST_MakeEnvelope(-77.2, -12.5, -76.7, -11.7, 4326)
$$ LANGUAGE SQL IMMUTABLE;
