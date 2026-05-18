# Architecture — Costa Resiliente

> Full architecture doc — Sprint 7 deliverable. Last updated: 2026-05-13.

See [ADR-0001](decisions/0001-project-charter.md) for technology choices and rationale.
See [ADR-0002](decisions/0002-ml-architecture.md) for ML model decisions.

---

## System Diagram

```
┌───────────────────────────────────────────────────────────────┐
│                         Browser / PWA                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────┐ │
│  │ Scenario │ │   Map    │ │  Alerts  │ │  Ask   │ │ Log  │ │
│  │  Panel   │ │  View    │ │   Feed   │ │ Panel  │ │Panel │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ └──────┘ │
└───────────────────────┬───────────────────────────────────────┘
                        │ HTTP REST (TanStack Query)
                        │ WebSocket (live layer updates — planned)
                        │ SSE (alerts ticker — planned)
┌───────────────────────▼───────────────────────────────────────┐
│                      FastAPI (port 8000)                       │
│  /api/v1/health  /districts  /layers/*  /alerts  /copilot     │
└──────────┬────────────────────────────┬───────────────────────┘
           │                            │
┌──────────▼──────────┐     ┌───────────▼──────────────────────┐
│  PostgreSQL 16       │     │       Prefect Worker              │
│  PostGIS 3.4         │     │  ingest/sentinel1.py  (daily)    │
│  TimescaleDB 2.x     │     │  ingest/imerg.py      (30 min)   │
│  pgstac schema       │     │  ingest/hydro.py      (15 min)   │
│  (port 5432)         │     │  ingest/social.py     (15 min)   │
└──────────┬──────────┘     │  ml/flood_pipeline.py (on event) │
           │                │  ml/huayco_model.py   (on event) │
           │                │  ml/triage.py         (on ingest)│
┌──────────▼──────────┐     └───────────┬──────────────────────┘
│  Redis (pub/sub +   │                 │
│  Prefect metadata)  │◄────────────────┘
│  (port 6379)        │
└─────────────────────┘
           │
┌──────────▼──────────┐     ┌──────────────────────────────────┐
│  MinIO (object      │     │  Ollama (LLM serving, local-only)│
│  storage for rasters│     │  qwen2.5:7b-instruct-q4_K_M (4.7G)│
│  and model weights) │     │   ↳ copilot + signal triage      │
│  (port 9000)        │     │  gemma2:2b (1.6G)                │
│                     │     │   ↳ input + output guardrails    │
│                     │     │  nomic-embed-text (274M)         │
│                     │     │   ↳ pgvector RAG embeddings      │
│                     │     │  (port 11434)                    │
└─────────────────────┘     └──────────────────────────────────┘
           │
┌──────────▼──────────┐
│  STAC API (pgstac)  │
│  (port 8082)        │
└─────────────────────┘
```

---

## Services

| Service | Image | Port(s) | Purpose |
|---------|-------|---------|---------|
| `costa-postgres` | timescale/timescaledb-ha:pg16 | 5432 | Primary DB: PostGIS + TimescaleDB + pgstac |
| `costa-redis` | redis:7-alpine | 6379 | Pub/sub + Prefect metadata |
| `costa-minio` | minio/minio | 9000, 9001 | Raster + model object storage |
| `costa-stac` | stac-utils/pgstac-api | 8082 | STAC catalog REST API |
| `costa-api` | custom (Python 3.12 + FastAPI) | 8000 | Main REST API |
| `costa-prefect-server` | prefecthq/prefect:3 | 4200 | Prefect orchestration UI + API |
| `costa-prefect-worker` | custom (Python 3.12 + workers) | — | Prefect process worker |
| `costa-web` | custom (Next.js 14) | 3000 | Frontend dashboard |
| `costa-ollama` | ollama/ollama | 11434 | Local LLM inference |

Production adds Caddy (`infra/caddy/Caddyfile`) as reverse proxy for TLS termination.

---

## Database Schema

```
postgres/costa_resiliente
├── geo.*              -- spatial reference data
│   ├── districts      -- 43 Lima province distritos (INEI ubigeo)
│   ├── watersheds     -- Rímac, Chillón, Lurín watersheds
│   ├── quebradas      -- 10 priority quebradas + IMERG thresholds
│   ├── infrastructure -- OSM hospitals, schools, bridges, substations
│   └── hazard_zones   -- Hazard level polygons (SINPAD-derived classification)
│
├── hydro.*            -- hydrometeorological time-series
│   ├── imerg_accumulations  -- TimescaleDB hypertable: 1h-72h rainfall per watershed
│   ├── stations             -- ANA + SENAMHI monitoring stations
│   └── station_observations -- TimescaleDB hypertable: river level/flow/rain
│
├── social.*           -- ingested social signals
│   └── signals        -- PII-redacted posts (7-day TTL, SHA-256 dedup)
│
├── ml.*               -- ML inference outputs
│   ├── flood_polygons       -- SAR flood extents from U-Net
│   └── huayco_susceptibility -- XGBoost risk levels per quebrada
│
├── ops.*              -- operator workflow
│   ├── alerts         -- auto-generated + operator-managed alerts
│   └── decision_log   -- append-only immutable operator action log
│
└── historical.*       -- reference / historical data
    └── sinpad_events  -- INDECI SINPAD 2003–2020 emergency records
```

---

## Data Flow

### 1. Ingest (Prefect workers, scheduled)
```
Sentinel-1 scene → MinIO (raw GRD) → pgstac catalog
                                   → flood segmentation (Redis pub/sub trigger)
                                   → ml.flood_polygons

IMERG granules → hydro.imerg_accumulations (TimescaleDB)
              → huayco susceptibility trigger (if 24h acc > threshold)
              → ml.huayco_susceptibility

ANA/SENAMHI scrape → hydro.station_observations

Social firehose → PII redaction (presidio) → social.signals
                                           → LLM triage → triage_label updated
                                           → alert generator (if cluster ≥ threshold)
                                           → ops.alerts
```

### 2. ML (triggered by ingest events via Redis pub/sub)
```
New S1 scene  → U-Net flood seg → ml.flood_polygons → ops.alerts (auto-generate)
New IMERG acc → XGBoost huayco → ml.huayco_susceptibility → ops.alerts (if risk_level=high)
New signals   → qwen2.5:7b triage (XML sandboxed) → triage_label on social.signals
```

### 3. API (FastAPI, on-demand)
```
GET /layers/imerg/latest      → hydro.imerg_accumulations (latest per watershed)
GET /layers/flood/latest      → ml.flood_polygons (last 10 scenes)
GET /layers/huayco/susceptibility → ml.huayco_susceptibility (latest per quebrada)
GET /layers/hazard            → geo.hazard_zones (static, 60-min cache)
GET /layers/infrastructure    → geo.infrastructure
GET /layers/stations          → hydro.stations + latest observation
GET /layers/watersheds        → geo.watersheds
GET /layers/quebradas         → geo.quebradas
GET /alerts                   → ops.alerts (filtered by scenario context)
POST /copilot/ask             → intent → parameterized PostGIS query → prose summary
```

### 4. Dashboard (Next.js 14, reactive)
```
TanStack Query → poll all /layers/* endpoints (stale times: 5 min IMERG, 60 min hazard)
Zustand store  → activeLayers Set + scenario (district, timeWindow)
MapLibre GL    → render GeoJSON features per active layer
AlertsPanel    → poll /alerts every 30s
AskPanel       → POST /copilot/ask (user-initiated)
DecisionLog    → GET /decisions + POST on operator action
```

---

## LLM Configuration

All inference is local. No cloud API dependency. No data egress for citizen PII signals.

| Role | Model | Tag | Size |
|------|-------|-----|------|
| Copilot + signal triage | Qwen 2.5 7B Instruct (Q4_K_M) | `qwen2.5:7b-instruct-q4_K_M` | 4.7 GB |
| Input + output guardrails | Gemma 2 2B | `gemma2:2b` | 1.6 GB |
| RAG embeddings (pgvector) | Nomic Embed Text | `nomic-embed-text` | 274 MB |

Model selection via env vars: `LLM_PRIMARY_MODEL`, `LLM_GUARDRAIL_MODEL`, `LLM_EMBED_MODEL`. Pydantic `AliasChoices` falls back to legacy `OLLAMA_*` names if set. No code changes needed to swap models.

---

## Security Architecture

- **Secrets**: `.env` only (gitignored). `.env.example` is the committed template.
- **LLM anti-fabrication**: all numerical claims in operator answers must trace to a DB row; copilot says so explicitly if query resolves to no data
- **Prompt-injection hardening**: social signal text sandboxed in `<SEÑAL>...</SEÑAL>` XML tags; never interpolated into system prompt; separate model calls for triage vs. operator context
- **SQL injection**: LLM-generated intent never executes raw SQL; whitelisted parameterized query templates only
- **PII redaction**: presidio-analyzer runs on every social signal before storage; `content_redacted` never contains raw PII
- **Decision log**: append-only PostgreSQL trigger rejects UPDATE/DELETE at DB level
- **Rate limiting**: Bluesky 30s window, RSS 1.5s per feed, Reddit 1.5s per subreddit
