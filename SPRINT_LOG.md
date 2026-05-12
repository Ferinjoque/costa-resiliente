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
- Watersheds fixture committed as `data/fixtures/lima_watersheds.geojson`
- Overpass rate limit: 1.5s sleep between queries

---

## Sprint 2 — Dashboard Skeleton ✅
**Dates:** 2026-05-11
**Commit:** `eb6e3fb`

### Done
- `apps/web/src/lib/api.ts`: Typed fetch client for all API endpoints; shapes verified against actual FastAPI routes
- `apps/web/src/lib/queries.ts`: TanStack Query hooks with tuned stale times (districts 1h, IMERG 2min, alerts 30s)
- `apps/web/src/lib/providers.tsx`: QueryClient provider wired into `layout.tsx`
- `MapView.tsx`: Full rewrite — district boundaries, IMERG per-watershed colour ramp (acc field from time window), flood polygons, huayco circles, infrastructure points — all live from API; layer visibility reactive to Zustand store
- `ScenarioPanel.tsx`: District dropdown from real `/api/v1/districts`, layer toggle checkboxes, time window selector
- `store/ui.ts`: `districtId: number|null` → `districtUbigeo: string|null` (INEI UBIGEO key)
- `pyproject.toml`: `--import-mode=importlib` — fixes `ModuleNotFoundError: tests.*` across all test modules
- `apps/api/tests/test_districts_contract.py`: 6 contract tests; all pass
- `conftest.py`: root conftest adds src paths + mocks heavy deps for test venv

### Key decisions
- Districts use `ubigeo` (INEI 6-digit code) as primary key everywhere
- IMERG colour ramp rebuilt on each time-window change via `setPaintProperty`
- `.gitignore` lib/ entry scoped to `.venv/lib/` — was blocking `apps/web/src/lib/`

---

## Sprint 3 — Flood Segmentation ✅
**Dates:** 2026-05-11
**Commit:** TBD

### Done
- `apps/workers/src/costa_workers/ml/flood_segmentation.py`: full implementation
  - `preprocess_scene()`: linear → dB clip → Sen1Floods11 normalization (VV µ=-14.41 σ=5.24, VH µ=-20.68 σ=5.43)
  - `FloodSegmentationModel`: PyTorch U-Net (4-level encoder-decoder + skip connections + BN), overlapping 512px patch inference (64px overlap), HuggingFace hub weight download with graceful dev fallback
  - `vectorize_mask()`: rasterio.features.shapes → pyproj reproject to WGS84 → shoelace area → MIN_FLOOD_PIXELS=9 noise filter
  - `sar_to_flood_polygons()`: full pipeline returning PostGIS-ready dicts
- `apps/workers/src/costa_workers/ingest/flood_pipeline.py`: Prefect flow
  - `list_unprocessed_scenes()`: asyncpg pgstac.items × ml.flood_polygons anti-join
  - `load_scene_from_minio()`: boto3 VV/VH GeoTIFF → rasterio MemoryFile → arrays + CRS
  - `run_flood_inference()`: loads model, runs pipeline per scene
  - `store_flood_polygons()`: asyncpg upsert; sentinel row (geom=NULL) for no-flood scenes prevents re-processing
  - `flood_segmentation_flow()`: async Prefect flow capped at MAX_SCENES_PER_RUN=5
- `apps/workers/tests/test_flood_segmentation_contract.py`: 16 contract tests (preprocessing math, shoelace, noise removal, full pipeline)
- `scripts/generate_pmtiles.sh` + `scripts/generate_pmtiles.ps1`: Planetiler Docker scripts — OSM Peru extract → Lima bbox clip (zoom 6–14) → PMTiles → MinIO upload
- `data/pmtiles/.gitkeep`, `weights/.gitkeep`: placeholders committed

### Key decisions
- Patch inference (512×512, 64px overlap) bounds VRAM — safe on 8GB GPU
- Graceful weight fallback: HuggingFace failure → random weights for dev, logs WARNING
- Sentinel no-flood row prevents repeated scene reprocessing
- scipy.ndimage for connected-component labeling (avoids torch dependency for morphology)
- PMTiles generation is a one-time manual step (`scripts/generate_pmtiles.sh --upload`)

### Total tests after Sprint 3: **39 passing**

### Open items for Sprint 4
- XGBoost huayco model (Castro-Cabrera et al. 2024)
- ANA/SENAMHI scraper → hydro.station_observations
- Bluesky + Reddit + RSS + Telegram social ingest (PII redaction)

---

## Sprint 4 — Huayco + ANA + Social ✅
**Dates:** 2026-05-11
**Commit:** TBD

### Done
- `apps/workers/src/costa_workers/ml/huayco_model.py`: full XGBoost implementation
  - `HuaycoFeatures` dataclass with `to_array()` and range-checking `validate()`
  - `HuaycoModel.load()` / `train()` / `predict_proba()` / `predict_quebrada()`
  - `_slope_heuristic()` fallback (0.6×slope_norm + 0.4×rain_norm) when no weights
  - `run_huayco_susceptibility()`: async asyncpg pipeline pulling features from DB
    with LATERAL IMERG joins, upserts to ml.huayco_susceptibility
  - Castro-Cabrera 2024 risk thresholds: <0.2 very_low / <0.4 low / <0.6 medium / <0.8 high / ≥0.8 very_high
- `infra/postgres/init.sql`: added quebradas feature columns
  (slope_deg, aspect_deg, lithology_class, distance_to_stream_m, ndvi, soil_moisture);
  fixed huayco_susceptibility schema (features → features_json, optional model_version,
  UNIQUE INDEX on quebrada_id+computed_at)
- `apps/workers/src/costa_workers/ingest/ana_scraper.py`: ANA SNIRH + SENAMHI scraper
  - 8 ANA hydro stations (Rímac, Chillón, Lurín) + 4 SENAMHI meteorological stations
  - `_parse_ana_table()`: regex DD/MM/YYYY nivel/caudal/lluvia extraction
  - `_parse_senamhi_csv()`: semicolon-delimited CSV with comma decimal support
  - `upsert_observations()`: asyncpg ON CONFLICT DO NOTHING per (station_id, time)
  - `ingest_hydro_stations_flow()`: Prefect flow, 2s rate limit per source
- `apps/workers/src/costa_workers/ingest/social.py`: full social ingestion
  - `DISASTER_KEYWORDS` frozenset (43 terms: event types, institutions, Lima quebradas)
  - `RawSignal` NamedTuple (source, source_id, content, published_at, location_hint, url)
  - `ingest_bluesky_firehose()`: Jetstream v2 WebSocket, 30s collection window, no auth
  - `ingest_reddit()`: public JSON API (no OAuth) — r/Peru, r/Lima, r/Chosica; 48h cutoff
  - `ingest_rss_feeds()`: feedparser for RPP, Andina, Canal N; 48h cutoff
  - `ingest_telegram()`: telethon read-only — INDECI/COER Lima (requires TELEGRAM_API_ID/HASH)
  - `redact_pii()`: presidio-analyzer with es_core_news_sm; graceful fallback
  - `upsert_signals()`: SHA-256 content_hash dedup, asyncpg ON CONFLICT DO NOTHING
  - `ingest_social_flow()`: async Prefect flow, all sources in asyncio.gather
- `apps/workers/tests/test_sprint4_contract.py`: 46 contract tests
  - Huayco: risk_level thresholds (all 5 classes), HuaycoFeatures validation (9 fields),
    features_to_matrix shape, slope heuristic math, model fallback behavior
  - ANA: table parser (valid rows, dash→None, multi-row), SENAMHI CSV (decimal, empty)
  - Social: keyword matching (case-insensitive), RawSignal construction,
    PII redaction exception fallback, content_hash determinism

### Key decisions
- `tenacity` import removed from ana_scraper.py — Prefect native retries used instead
- Reddit ingest uses public `/new.json` API — no OAuth required for read-only access
- Telegram ingest is opt-in (skipped when TELEGRAM_API_ID unset) — privacy by default
- presidio `if not results: return text` early-exit avoids anonymize on no-entity text
- `asyncio.gather(return_exceptions=True)` in flow — one source failure doesn't abort others

### Total tests after Sprint 4: **85 passing**

### Open items for Sprint 5
- Ollama serving Gemma 3 12B-IT
- Triage pipeline: social signals → triage_label + confidence
- Operator Copilot RAG: Spanish NL → PostGIS → Spanish summary

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
