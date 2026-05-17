# Sprint Log — Costa Resiliente

> Append-only log. Each sprint entry is a permanent record of what was built,
> what was decided, and what was deferred. Working branch: `develop`.

---

## Sprint 0 — Scaffolding (repo initialization)

**Commit:** initial scaffold  
**Status:** ✅ Complete

- Initialized repo with `develop` branch
- Created full directory layout per BRIEF.md spec
- Docker Compose: PostGIS 16 + TimescaleDB, MinIO, Redis, Prefect
- `infra/postgres/init.sql` with all schema DDL (geo, hydro, social, ml, ops)
- `.env.example`, `.gitignore`, `.pre-commit-config.yaml`
- ADR-0001: project charter and single-VM single-Postgres rationale

---

## Sprint 1 — Foundation Ingestion

**Commit:** `feat(ingest): Sprint 1 — Sentinel-1, IMERG, Lima geodata, wired API endpoints`  
**Status:** ✅ Complete

- `apps/workers/src/costa_workers/ingest/sentinel1.py` — Sentinel-1 GRD via MS Planetary Computer STAC; stores raw GRD in MinIO, registers scene in pgstac
- `apps/workers/src/costa_workers/ingest/imerg.py` — NASA IMERG Early Run V07B via EarthData OPeNDAP; 1h/3h/6h/12h/24h/72h accumulations per Lima watershed into TimescaleDB
- `scripts/load_lima_geodata.py` — loaded 43 Lima districts, 3 watersheds (Rímac, Chillón, Lurín), 10 priority quebradas, OSM critical infrastructure (hospitals, schools, bridges, substations, fire stations)
- `apps/api/src/costa_api/` — FastAPI skeleton, `/api/v1/districts`, `/layers/imerg`, `/layers/flood`, `/layers/huayco`, `/layers/infrastructure`, `/layers/hazard`, `/layers/stations`, `/layers/watersheds`, `/layers/quebradas`
- All 8 Prefect flows registered with schedules in `apps/workers/src/costa_workers/flows/schedules.py`

---

## Sprint 2 — Dashboard Skeleton

**Commit:** `feat(sprint2): dashboard skeleton — live map layers + typed API client`  
**Status:** ✅ Complete

- Next.js 14 App Router + MapLibre GL + PMTiles basemap of Lima Metropolitana
- Zustand UI store (`src/store/ui.ts`): activeLayers Set, scenario (district/time window), panel open states
- TanStack Query hooks for all API layer endpoints (`src/lib/queries.ts`)
- Typed API client (`src/lib/api.ts`) with all layer interfaces
- `MapView.tsx`: district boundaries, IMERG heatmap with accumulation window switcher, flood polygons, huayco circles, infrastructure points
- `ScenarioPanel.tsx`: district selector, time window buttons (1h–72h), layer toggles
- `LeftRail.tsx`: navigation icons for all panels
- Tailwind dark theme (`surface-panel`, `surface-raised`, `costa-*` palette)

---

## Sprint 3 — Flood Segmentation

**Commit:** `feat(sprint3): SAR flood segmentation — Sen1Floods11 U-Net + Prefect pipeline`  
**Status:** ✅ Complete

- U-Net flood segmentation model (`apps/workers/src/costa_workers/ml/flood_pipeline.py`) initialized from Sen1Floods11 open weights
- Inference on full Sentinel-1 GRD scene: <5 min CPU, outputs `ml.flood_polygons` with confidence scores and `area_km2`
- Prefect flow: `sentinel1-ingest` → `flood-segmentation` via Redis pub/sub trigger
- `MapView.tsx`: flood fill layer (blue, 50% opacity)

---

## Sprint 4 — Huayco Model + ANA + Social

**Commit:** `feat(sprint4): huayco XGBoost model, ANA/SENAMHI scraper, social ingestion`  
**Status:** ✅ Complete

- XGBoost huayco susceptibility (`apps/workers/src/costa_workers/ml/huayco_model.py`): inputs = slope, aspect, lithology, distance-to-stream, NDVI, soil moisture, IMERG 24h/72h; outputs probability + risk_level per quebrada
- ANA Observatorio Chirilu + SENAMHI scraper (`apps/workers/src/costa_workers/ingest/hydro.py`); river level + flow + rainfall into `hydro.station_observations`
- Social signal ingestion (`apps/workers/src/costa_workers/ingest/social.py`):
  - Bluesky Jetstream v2 WebSocket (public firehose, no credentials)
  - RSS: RPP, Andina, Canal N, El Comercio, La República, Peru21
  - Reddit: r/Peru, r/Lima, r/Chosica (public JSON API, no OAuth required)
  - Telegram: SENAMHI_Peru channel via Telethon (TELEGRAM_SESSION_STRING)
- PII redaction via presidio-analyzer + es_core_news_sm before any signal stored
- Disaster keyword vocabulary: 60+ terms covering flood/huayco/landslide/institution/district vocabulary
- `MapView.tsx`: huayco circles colored by risk_level (green→red)

---

## Sprint 5 — LLM Integration

**Commit:** `feat(sprint5): LLM triage pipeline and Operator Copilot RAG`  
**Status:** ✅ Complete

- Ollama serving: `gemma4:e4b` (9.6GB, 128K ctx, multimodal) as primary; `qwen3:14b` as fallback
- LLM triage (`apps/workers/src/costa_workers/ml/triage.py`): classifies each social signal into `{needs_help, infrastructure_damage, road_blocked, weather_observation, false_alarm, irrelevant}` with confidence and location entity; strict Pydantic-validated JSON output with re-prompt on schema violation
- Operator Copilot RAG (`apps/api/src/costa_api/routers/copilot.py`): Spanish NL → intent classification → whitelisted parameterized PostGIS query → Spanish prose summary with source citations and timestamps; anti-fabrication guarantee (all numerical claims trace to DB row); prompt-injection hardening via `<SEÑAL>...</SEÑAL>` XML sandbox
- 113 tests passing

---

## Sprint 6 — Alerts + Decision Log + UI Polish

**Commit:** `feat(sprint6): alerts feed, alert generator, decision log CSV export`  
**Status:** ✅ Complete

- `ops.alerts` auto-generation: flood polygon → alert, huayco probability spike → alert, social signal cluster → alert
- `AlertsPanel.tsx`: color-coded by severity, acknowledge/escalate/false-positive actions
- `DecisionLogPanel.tsx`: immutable append-only log with CSV export for EDAN-Perú workflows
- `AskPanel.tsx`: Spanish natural-language input → copilot RAG → prose + map overlay
- `DataFreshnessBar.tsx`: shows last-updated timestamps for all data layers
- `docs/architecture.md`, `docs/responsible-data-handling.md`, `docs/operator-runbook.md` written
- ADR-0002: ML architecture decisions

---

## Sprint 7 — Hardening + Data Loading + Submission Prep (current)

**Commits:** `fix(config): sync model names`, `feat(sprint7): UI fix, submission gap analysis`  
**Status:** 🔄 In progress

### Completed in Sprint 7

**Infrastructure + deployment:**
- `docker-compose.prod.yml`: production compose with Caddy reverse proxy, no exposed ports
- `infra/caddy/Caddyfile`: HTTPS termination, HTTP→HTTPS redirect
- `scripts/deploy.sh`: zero-downtime deploy script (pull → build → compose up)
- `.env.production.example`: production environment template
- Web `Dockerfile` updated for production build stage

**Frontend responsive + freshness:**
- Full responsive layout (mobile 375px, tablet 768px, desktop 1440px) across all panels
- `DataFreshnessBar` wired to real API `data_updated_at` fields
- `MapView.tsx`: SIGRID/hazard layer added (fill + outline, level-based color ramp)
- `ScenarioPanel.tsx`: "Peligro Histórico" layer toggle added
- `src/lib/api.ts`: `HazardCollection`, `HazardFeature`, `HazardProperties` types + `fetchHazard()`
- `src/lib/queries.ts`: `useHazard()` hook (60-min stale time, static government data)

**Data loading:**
- `scripts/load_sinpad.py`: loads INDECI SINPAD 2003–2020 Excel → `historical.sinpad_events`; 2,063 Lima flood/huayco events loaded; top types: LLUVIA INTENSA (762), HUAYCO (590), DESLIZAMIENTO (304), INUNDACIÓN (254)
- `scripts/load_sigrid.py`: ArcGIS REST loader (for future use when SIGRID credentials available)
- `geo.hazard_zones` populated from SINPAD historical event density: 50 district-level zones, flood + landslide, classified muy_alto/alto/medio/bajo from 18-year event frequency and severity score

**Social ingest:**
- All 4 sources now active in `asyncio.gather()`: Bluesky + RSS + Reddit + Telegram
- `TELEGRAM_CHANNELS = ["Senamhi_Peru"]` — SENAMHI official weather/hydro alerts channel
- `TELEGRAM_SESSION_STRING` configured in `.env`
- Reddit runs without OAuth credentials (public JSON API)

**API:**
- `layers.py` `/hazard` endpoint: dynamic source attribution based on loaded `source_layer` values

### Deferred from Sprint 7 (remaining)

See `docs/SUBMISSION_GAPS.md` for full rubric-mapped gap analysis.

| Item | Rubric | Effort estimate |
|------|--------|----------------|
| Population exposure per flood polygon | C2, C3, C5 | 2–3h |
| Social signal pins on map (clustered) | C3, C4 | 2–3h |
| 2017 El Niño replay fixture + tutorial UI | C4, C5 | 1 day |
| PWA: manifest + service worker verification | C4 | 2h |
| i18n Spanish/English toggle (`next-intl`) | C4 | 4h |
| WCAG AA full Lighthouse pass | C4 | 2h |
| Public VPS deployment (judges must access) | ALL | 1 day |

---

## Sprint 10 — EOC Operational UX (2026-05-16)

**Status:** ✅ Complete

### Completed in Sprint 10

**AlertsPanel — operational workflows:**
- `QuickDispatch` component: 4 one-click resource dispatch buttons (Rescue Boat, USAR Alpha, Ambulance, Fire Brigade); active only when critical alerts present; writes `resource_dispatch` entries to decision log cache
- `ResponseProtocol` component: collapsible INDECI 4-step checklist (COEN notification → evacuation → shelter verification → EDAN form); each step writes `protocol_step` to decision log cache; progress % shown

**SocialFeedPanel — field reporting:**
- `FieldReport` component: collapsible form behind PlusCircle button; 4-label selector + 140-char textarea; on submit injects new "campo" (field) source signal into TanStack Query cache and logs `map_pin` to decision log — no API required in demo mode
- Added `campo` (emerald) source badge to source legend and `SOURCE_BADGE` lookup

**DemoLiveSimulator:**
- Reduced first signal injection delay: 20 s → 4 s — live activity hits immediately on demo load; subsequent injections unchanged (28–45 s cadence)

**DecisionLogPanel:**
- Added `resource_dispatch` and `protocol_step` action labels with preview text showing dispatched resource name and protocol step label respectively

**demoData.ts:**
- 6 additional pre-seeded decision log entries (ids 13–18): USAR dispatch, Boat dispatch, COEN notification, social signal bluesky/needs_help, evacuation step, social signal telegram/road_blocked
- 4 additional infrastructure POIs (ids 12–15): Coliseo Lurigancho shelter, IE San Luis Gonzaga shelter, Loza Deportiva Huachipa, Compañía Bomberos SJL

**MapView.tsx:**
- Social signal popups now include message text (first 80 chars) from signal properties
- Infrastructure popups: emoji type icons (🏥 🏫 🌉 ⚡ 🚒 🏠) + district ID field
- Infrastructure circle-color: added `fire_station` (#fb923c) and `shelter` (#34d399) colors

**MapLegend:**
- Added `INFRA_ITEMS` with all 5 infrastructure types (hospital, shelter, fire station, bridge, school)
- Infrastructure section shown when `infrastructure` layer active

**SharePanel:**
- Fixed position overlap: moved from `sm:left-4` to `sm:right-4` to stop covering ScenarioPanel

### Score estimate after Sprint 10
| Criterion | Sprint 9 | Sprint 10 |
|-----------|----------|-----------|
| C1 Timeliness | 4.3 | 4.3 |
| C2 Comprehensiveness | 4.8 | 4.8 |
| C3 Integration | 5.0 | 5.0 |
| C4 Usability | 4.8 | 4.9 |
| C5 Scenario Fit | 4.8 | 4.8 |
| **Total** | **~23.7** | **~23.8** |

VPS deployment remains the primary blocker for full rubric scoring.
