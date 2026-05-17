-- AI backend migration — run once against existing DB
-- Safe to re-run (all statements are idempotent).
--
--   docker exec -i costa-postgres psql -U costa -d costa_resiliente < infra/postgres/ai_migration.sql

-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Schemas ─────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS rag;

-- ─── Security events ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops.security_events (
    id          BIGSERIAL PRIMARY KEY,
    operator_id TEXT NOT NULL,
    event_type  TEXT NOT NULL,
    detail      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS security_events_op_idx ON ops.security_events (operator_id);
CREATE INDEX IF NOT EXISTS security_events_ts_idx  ON ops.security_events (created_at DESC);

-- ─── HITL alert proposals ────────────────────────────────────────────────────
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

-- ─── RAG documents ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rag.documents (
    id           BIGSERIAL PRIMARY KEY,
    source       TEXT NOT NULL,
    title        TEXT NOT NULL,
    lang         CHAR(2) NOT NULL DEFAULT 'es',
    chunk_index  INTEGER NOT NULL DEFAULT 0,
    chunk        TEXT NOT NULL,
    embedding    vector(768),
    content_hash CHAR(64),
    meta         JSONB,
    indexed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rag_documents_source_idx ON rag.documents (source);
CREATE INDEX IF NOT EXISTS rag_documents_hash_idx   ON rag.documents (content_hash);

-- ─── Read-only AI role ────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'costa_ai_ro') THEN
        -- Password set via ALTER ROLE after container starts with real secret
        CREATE ROLE costa_ai_ro LOGIN PASSWORD 'change_me_in_production';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE costa_resiliente TO costa_ai_ro;
GRANT USAGE ON SCHEMA geo, hydro, social, ml, ops, rag TO costa_ai_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA geo     TO costa_ai_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA hydro   TO costa_ai_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA social  TO costa_ai_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA ml      TO costa_ai_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA rag     TO costa_ai_ro;
GRANT SELECT ON ops.alerts, ops.decision_log, ops.alert_proposals TO costa_ai_ro;

ALTER DEFAULT PRIVILEGES IN SCHEMA geo    GRANT SELECT ON TABLES TO costa_ai_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA hydro  GRANT SELECT ON TABLES TO costa_ai_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA social GRANT SELECT ON TABLES TO costa_ai_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA ml     GRANT SELECT ON TABLES TO costa_ai_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA rag    GRANT SELECT ON TABLES TO costa_ai_ro;

-- Done
SELECT 'AI migration complete' AS status;
