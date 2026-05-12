# Architecture — Costa Resiliente

> Full architecture doc — Sprint 7 deliverable. This is the live working draft.

See [ADR-0001](decisions/0001-project-charter.md) for technology choices and rationale.

## System Diagram

```
┌───────────────────────────────────────────────────────────────┐
│                         Browser / PWA                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────┐ │
│  │ Scenario │ │   Map    │ │  Alerts  │ │  Ask   │ │ Log  │ │
│  │  Panel   │ │  View    │ │   Feed   │ │ Panel  │ │Panel │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ └──────┘ │
└───────────────────────┬───────────────────────────────────────┘
                        │ HTTP REST / WebSocket / SSE
┌───────────────────────▼───────────────────────────────────────┐
│                      FastAPI (port 8000)                       │
│  /api/v1/health  /districts  /layers  /alerts  /copilot  /ws  │
└──────────┬────────────────────────────┬───────────────────────┘
           │                            │
┌──────────▼──────────┐     ┌───────────▼─────────────────────┐
│  PostgreSQL 16       │     │      Prefect Worker              │
│  PostGIS + TS        │     │  ingest/sentinel1.py             │
│  pgstac schema       │     │  ingest/imerg.py                 │
│  (port 5432)         │     │  ingest/social.py                │
└──────────┬──────────┘     │  ml/flood_segmentation.py        │
           │                │  ml/huayco_model.py              │
           │                │  ml/triage.py                    │
           │                └───────────┬─────────────────────┘
           │                            │
┌──────────▼────────────────────────────▼─────────────────────┐
│  Redis (cache + pub/sub)  │  MinIO (raster object storage)   │
│  (port 6379)               │  (port 9000)                     │
└────────────────────────────────────────────────────────────┘
                             │
                 ┌───────────▼──────────────┐
                 │  Ollama (LLM serving)     │
                 │  Gemma 3 12B-IT Q4_K_M   │
                 │  (port 11434)             │
                 └──────────────────────────┘
```

## Data Flow

1. **Ingest** (Prefect workers, scheduled):
   - Sentinel-1 → MinIO rasters → pgstac catalog
   - IMERG granules → TimescaleDB hypertable
   - ANA/SENAMHI scrapes → TimescaleDB
   - Social signals → PII redaction → social.signals table

2. **ML** (triggered by ingest events via Redis pub/sub):
   - New Sentinel-1 scene → flood segmentation → ml.flood_polygons
   - New IMERG accumulation → huayco susceptibility → ml.huayco_susceptibility
   - New social signals → LLM triage → triage_label updated in DB

3. **API** (FastAPI, on-demand):
   - /layers endpoints query PostGIS + TimescaleDB, return GeoJSON
   - /alerts aggregates ops.alerts, filtered by scenario context
   - /copilot/ask runs RAG pipeline: intent → SQL → summarize

4. **Dashboard** (Next.js, reactive):
   - WebSocket subscription to live layer updates
   - SSE for alerts ticker
   - TanStack Query for cached layer data
