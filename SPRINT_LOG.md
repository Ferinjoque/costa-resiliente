# Sprint Log — Costa Resiliente

> Machine-maintained. Update at the end of each sprint or major commit.
> Load this + BRIEF.md at the start of every session.

---

## Sprint 0 — Scaffolding ✅
**Dates:** 2026-05-11  
**Commit:** `20273ae`

### Done
- git repo init, `develop` branch (git email `github@injoque.dev`)
- Full repo layout per BRIEF.md spec
- `docker-compose.yml`: PostGIS+TimescaleDB (timescale/timescaledb-ha:pg16-latest), MinIO, Redis, Prefect server+worker, Ollama, stac-fastapi, FastAPI API, Next.js — all healthchecks
- `infra/postgres/init.sql`: full schema — geo, hydro, social, ml, ops schemas; pg_cron retention; append-only decision log trigger
- `apps/api`: FastAPI skeleton — /health, /districts, /layers, /alerts, /copilot stubs
- `apps/workers`: Prefect flow stubs — sentinel1, imerg, social; ML stubs — flood seg, huayco XGBoost, Spanish triage (Pydantic schema + XML injection hardening)
- `apps/web`: Next.js 14 App Router — MapLibre + PMTiles MapView, ScenarioPanel, AlertsPanel, AskPanel, DecisionLogPanel, LeftRail, Zustand store
- Docs: ADR-0001, architecture, data-sources, responsible-data-handling, operator-runbook

### Key decisions
- `timescale/timescaledb-ha:pg16` includes PostGIS + TS in one image
- pgstac migrations auto-run via stac-fastapi container
- Triage XML sandboxing coded from day 0 (prompt injection hardening)
- MapLibre dark fallback prevents crash pre-PMTiles

### Open items for Sprint 1
- None blocking — proceed to Sprint 1

---

## Sprint 1 — Foundation Ingestion 🔄
**Target:** Days 4–10 from project start  
**Status:** IN PROGRESS

### Goals
1. Load Lima 43-district polygons → `geo.districts` (GADM/INEI shapefiles)
2. Load watershed polygons → `geo.watersheds` (Rímac, Chillón, Lurín)
3. Load OSM critical infrastructure → `geo.infrastructure` (Overpass API)
4. Implement `sentinel1.py` fully: PC STAC search → MinIO download → pgstac register
5. Implement `imerg.py` fully: NASA GES DISC OPeNDAP → zonal stats → TimescaleDB
6. Wire `/api/v1/districts` to real PostGIS query (returns GeoJSON FeatureCollection)
7. `docker compose up` stays green throughout

### End-state acceptance criteria
- `GET /api/v1/districts` returns 43 Lima district polygons as GeoJSON
- TimescaleDB has IMERG accumulations for at least 3 watersheds over last 24h
- At least 1 Sentinel-1 scene registered in pgstac
- All services healthcheck green

---

## Sprint 2 — Dashboard Skeleton (pending)
### Goals
- Stand up Next.js + MapLibre + PMTiles basemap of Lima
- Wire FastAPI to frontend — render district boundaries + IMERG heatmap
- Implement Scenario Panel district dropdown from real API data

---

## Sprint 3 — Flood Segmentation (pending)
### Goals
- Sen1Floods11 weights loaded and inference running
- Test scene over Lima → polygons in PostGIS → rendered on dashboard

---

## Sprint 4 — Huayco + ANA + Social (pending)
### Goals
- XGBoost huayco model trained and running per quebrada
- ANA/SENAMHI scraper feeding hydro.station_observations
- Bluesky + Reddit + RSS ingest with PII redaction active
- Social signal pins on map (clustered)

---

## Sprint 5 — LLM Integration (pending)
### Goals
- Ollama serving Gemma 3 12B-IT
- Triage pipeline live (social signals get labels)
- Operator Copilot RAG: Spanish NL → PostGIS → Spanish summary

---

## Sprint 6 — Polish (pending)
### Goals
- Alerts Feed wired to real ops.alerts data
- Decision Log exportable to CSV
- PWA offline mode
- Onboarding tutorial (2017 El Niño replay)
- WCAG AA audit pass

---

## Sprint 7 — Submission (pending)
### Goals
- README, architecture doc, data-sources doc, responsible-data-handling, operator-runbook — all complete
- 2–5 minute demo video
- Performance hardening
- Submit by 2026-10-09
