# SESSION LOG — Costa Resiliente Autonomous Test+Harden Session

**Date:** 2026-05-17  
**Session start:** 02:25 SAPST  
**Session end:** ~10:30 SAPST  
**Branch:** develop  
**Owner:** Fernando Injoque (offline)  
**Operator:** Claude Opus 4.7 (autonomous)  
**Objective:** Comprehensive test + hardening + rubric gap analysis  

---

## Phase 0 — Checkpoint (complete ~02:40)

Two commits created before any testing:
- `feat(ai): AI agent layer — gateway, guardrails, RAG, tools, proposals, protocols corpus` (33 files, 2683 ins)
- `feat(web): impeccable Sprint 12 polish — Lima-coast palette, Fraunces display, bento layout, MapRadar, PWA assets, primitives` (29 files, 3077 ins)

No remote configured — push skipped (local-only repo).  
Deviation from prompt: `compose down -v` skipped — ollama-models 5GB+ re-pull too costly (see plan).

---

## Phase 1 — Audit (complete ~02:55)

### System Status at Session Start

| Service | Container | Status | Port |
|---------|-----------|--------|------|
| postgres+timescale | costa-postgres | healthy | 5432 |
| redis | costa-redis | healthy | 6379 |
| minio | costa-minio | healthy | 9000/9001 |
| stac-api | costa-stac | up | 8080 |
| prefect-server | costa-prefect-server | healthy | 4200 |
| prefect-worker | costa-prefect-worker | up | — |
| ollama | costa-ollama | healthy | 11434 |
| api | costa-api | healthy (7min) | 8000 |
| web | costa-web | up (29min) | 3000 |

### Backend Inventory — Endpoints

| # | Method | Path | Description |
|---|--------|------|-------------|
| 1 | GET | /api/v1/health | Health check |
| 2 | GET | /api/v1/health/seed | Seed status (row counts) |
| 3 | POST | /api/v1/health/seed | Trigger reseed |
| 4 | GET | /api/v1/districts | GeoJSON FeatureCollection all districts |
| 5 | GET | /api/v1/districts/risk-summary | Risk level per district |
| 6 | GET | /api/v1/districts/{ubigeo} | Single district detail |
| 7 | GET | /api/v1/districts/{ubigeo}/dashboard | Dashboard metrics for district |
| 8 | GET | /api/v1/districts/{ubigeo}/watersheds | Watersheds intersecting district |
| 9 | GET | /api/v1/layers/imerg/latest | IMERG rainfall accumulations |
| 10 | GET | /api/v1/layers/flood/latest | Flood polygons (SAR) |
| 11 | GET | /api/v1/layers/flood/exposure | Population exposure per flood polygon |
| 12 | GET | /api/v1/layers/huayco/susceptibility | Huayco risk per quebrada |
| 13 | GET | /api/v1/layers/hazard | Hazard zones (static) |
| 14 | GET | /api/v1/layers/infrastructure | Critical infrastructure GeoJSON |
| 15 | GET | /api/v1/layers/stations | Hydro stations + latest obs |
| 16 | GET | /api/v1/layers/watersheds | Watershed polygons |
| 17 | GET | /api/v1/layers/quebradas | Priority quebradas |
| 18 | GET | /api/v1/layers/social | Social signals GeoJSON |
| 19 | GET | /api/v1/alerts | Active alerts list |
| 20 | POST | /api/v1/alerts/{id}/action | Acknowledge/escalate/false-positive |
| 21 | GET | /api/v1/alerts/stream | SSE stream for live alerts |
| 22 | GET | /api/v1/alerts/decision-log | Decision log entries |
| 23 | GET | /api/v1/alerts/decision-log/export | Decision log CSV export |
| 24 | POST | /api/v1/copilot/ask | Agentic NL copilot query |
| 25 | POST | /api/v1/share | Mint share token |
| 26 | GET | /api/v1/share/{token} | Resolve share token |
| 27 | GET | /api/v1/fusion/{ubigeo} | Multi-hazard fusion for district |
| 28 | GET | /api/v1/proposals | List alert proposals |
| 29 | POST | /api/v1/proposals | Create alert proposal |
| 30 | POST | /api/v1/proposals/{id}/approve | Approve proposal |
| 31 | POST | /api/v1/proposals/{id}/reject | Reject proposal |

### Database Schema — Row Counts

| Schema | Table | Rows | Notes |
|--------|-------|------|-------|
| geo | districts | 159 | 43 Lima + surrounding provinces |
| geo | infrastructure | 43,072 | OSM POIs |
| geo | hazard_zones | 50 | SINPAD-derived |
| geo | quebradas | 10 | Priority quebradas |
| geo | watersheds | 3 | Rímac, Chillón, Lurín |
| hydro | stations | **0** | ⚠ EMPTY — scraper not run |
| hydro | station_observations | **0** | ⚠ EMPTY |
| hydro | imerg_accumulations | **0** | ⚠ EMPTY — no IMERG data |
| social | signals | **0** | ⚠ EMPTY — ingest not run |
| ml | flood_polygons | 4 | From 2026-05-12 (5 days ago) |
| ml | huayco_susceptibility | **0** | ⚠ EMPTY — ML not run |
| ops | alerts | 18 | Active alerts (from auto-seed) |
| ops | decision_log | 19 | Seeded entries |
| ops | share_tokens | 2 | From prior session |
| ops | alert_proposals | 0 | Empty |
| ops | security_events | 2 | From guardrail tests |
| historical | sinpad_events | 2,063 | INDECI 2003-2020 |

### AI / LLM Layer Inventory

| Component | File | Status |
|-----------|------|--------|
| Gateway | `ai/gateway.py` | ✅ Thin facade over Ollama |
| Provider | `ai/providers/ollama.py` | ✅ httpx async, retry, tool_calls |
| Agent | `ai/agent.py` | ✅ Multi-tool agentic loop + keyword fallback |
| Input guardrail | `ai/guardrails/input_filter.py` | ✅ Regex-based + length check |
| Output guardrail | `ai/guardrails/output_filter.py` | ✅ PII + secret redaction |
| DB tools | `ai/tools/db_tools.py` | ✅ 8 whitelisted parameterized tools |
| RAG | `ai/rag.py` | ✅ nomic-embed-text + pgvector |

**Models in use:**
- Primary (copilot): `qwen2.5:7b-instruct-q4_K_M` (4.7GB)
- Fast (guardrails): `gemma2:2b` (1.6GB)
- Embed (RAG): `nomic-embed-text` (274MB)

**Note:** `.env` has conflicting env vars:
- `LLM_PRIMARY_MODEL=qwen2.5:7b-instruct-q4_K_M` (active — wins via AliasChoices)
- `OLLAMA_PRIMARY_MODEL=gemma4:e4b` (overridden — stale)

### Frontend Inventory — Components

| Surface | Component | Notes |
|---------|-----------|-------|
| Layout | `layout.tsx` | Fraunces + Inter + JetBrains Mono fonts |
| Main page | `page.tsx` | MapView + all panels |
| Navigation | `LeftRail.tsx` | Icon rail, keyboard shortcuts |
| Map | `MapView.tsx` | MapLibre GL, 9 layer toggles |
| Map | `MapLegend.tsx` | Layer legend |
| Map | `MapRadar.tsx` | Signature radar sweep (Sprint 12) |
| Map | `LiveTicker.tsx` | aria-live event ticker |
| Map | `OperationalHUD.tsx` | SINAGERD level + quick stats |
| Panel | `ScenarioPanel.tsx` | District + time selector |
| Panel | `AlertsPanel.tsx` | Alert list + QuickDispatch + INDECI checklist |
| Panel | `AskPanel.tsx` | Copilot NL input |
| Panel | `DecisionLogPanel.tsx` | Decision log + CSV export |
| Panel | `SocialFeedPanel.tsx` | Social signals + FieldReport form |
| Panel | `DataSourcesPanel.tsx` | Source freshness panel |
| Panel | `DistrictDashboardPanel.tsx` | CityOverview bento grid |
| Panel | `FusionCallout.tsx` | Multi-hazard callout |
| Panel | `SituationBrief.tsx` | (sm:hidden on desktop) |
| Panel | `SharePanel.tsx` | Share token UI |
| Panel | `TutorialOverlay.tsx` | Tutorial (dynamic import) |
| UI | `primitives.tsx` | Design system primitives (Sprint 12) |
| UI | `ToastStack.tsx` | Toast notifications |
| UI | `DataFreshnessBar.tsx` | Data freshness indicator |
| Demo | `DemoLiveSimulator.tsx` | Demo signal injector |
| PWA | `public/sw.js` | Service worker |

### Known Bugs — P0

| ID | Layer | Bug | Impact | Root Cause |
|----|-------|-----|--------|------------|
| P0-1 | Copilot | "No se encontraron datos para el período consultado." always returns | C3, C4, C5 | imerg_accumulations=0, stations=0, social.signals=0, huayco_susceptibility=0; flood_polygons are 5 days old → `hours_back=24` filter returns empty |
| P0-2 | Data | All time-series tables empty | C1, C2 | Scrapers (IMERG, ANA, social) never ran or had credentials issues |
| P0-3 | AI layer | Stale OLLAMA_PRIMARY_MODEL=gemma4:e4b in .env alongside LLM_PRIMARY_MODEL | Confusion | Both set, AliasChoices picks LLM_PRIMARY_MODEL first (correct behavior but confusing) |

### Docker — Deviations

- Skipped `compose down -v && compose up --build` — would drop ollama-models (5GB+)
- Used existing healthy stack instead
- Will do one-service `--no-cache` build to verify Dockerfile integrity

### Test Priorities

1. **SEED DEMO DATA** — all empty time-series tables need realistic seeded rows
2. Fix `get_flood_polygons` default hours_back: 24h → 168h (or use existing seed timestamps)
3. Run full endpoint battery (~400+ cases) against live API
4. DB constraint tests
5. AI guardrail + tool dispatch tests
6. Frontend smoke (Playwright if available, else curl)
7. Docker Dockerfile integrity

---

## Phase 2 — Test Results

> Started: ~03:00

| # | Layer | Component | Test Case | Input | Expected | Actual | P/F | Notes |
|---|-------|-----------|-----------|-------|----------|--------|-----|-------|

<!-- ROWS APPENDED BY TEST SCRIPTS BELOW -->

---

## Phase 3 — Fixes Applied

<!-- APPENDED DURING FIX PHASE -->

---

## Phase 4 — Rubric Gap Analysis

<!-- APPENDED DURING GAP PHASE -->

---

## End-of-Session Git Log

<!-- APPENDED AT SESSION END -->
