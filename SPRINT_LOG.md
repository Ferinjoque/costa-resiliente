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

## Sprint 1 — Foundation Ingestion ✅
**Dates:** 2026-05-11  
**Commit:** `6f2e5dd`

### Done
- `scripts/load_lima_geodata.py`: GADM→districts (43), watersheds (3), quebradas (10), OSM infrastructure — all idempotent
- `sentinel1.py` full: PC STAC search (signed) → MinIO VV/VH download → pgstac registration, 3-day lookback
- `imerg.py` full: NASA GES DISC OPeNDAP + h5py → Lima clip → watershed zonal stats → TimescaleDB upsert, 1h–72h accumulations
- All API layer endpoints wired to real PostGIS: `/districts`, `/layers/imerg`, `/layers/flood`, `/layers/huayco`, `/layers/infrastructure`, `/layers/stations`, `/watersheds`, `/quebradas`
- `apps/api/src/costa_api/db.py`: async SQLAlchemy session factory
- Contract tests: sentinel1 (PC modifier, STAC schema, bbox), IMERG (fill cleanup, half-hourly math, zonal sum)

### Key decisions
- `h5py` added for IMERG HDF5 parsing in memory (no disk write)
- GADM ADM3 download cached to `data/fixtures/` on first run
- Watersheds fixture committed as `data/fixtures/lima_watersheds.geojson` (approximate bboxes until HydroBASINS sourced)
- Overpass rate limit: 1.5s sleep between queries

### Open items for Sprint 2
- Run `scripts/load_lima_geodata.py` against live docker postgres to verify counts
- Generate Lima PMTiles basemap from OSM extract via Planetiler
- Stand up Next.js dev server and render district boundaries on MapLibre

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
