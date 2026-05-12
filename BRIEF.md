# Costa Resiliente — Engineering Brief for Claude Code

You are the engineering lead for **Costa Resiliente**, an open-source near-real-time
operational awareness platform for emergency managers responding to El Niño-driven
floods and huaycos (debris flows) in Lima Metropolitana, Peru. This project is a
submission to the IEEE Response Quest Challenge 2026, due in product form on
9 October 2026, judged November–December 2026.

You are working in an **empty repository**. Set up everything from scratch.

## Project Owner Context

- Solo developer: Fernando Injoque, IEEE Member, AI Engineer and Software Engineering
  student. Currently in Peru; relocating to Purdue University for a research
  internship in summer 2026. Build assumes solo capacity augmented by AI coding tools.
- Daily stack familiarity: Python, TypeScript, Docker, JetBrains IDEs, FastAPI,
  Next.js. Prior work in AI safety (cognitive firewall research on prompt injection),
  ESG data pipelines, and locally-hosted LLM systems.

## Mission and Scope (Strict)

Build a browser-accessible dashboard that fuses satellite radar, hydrometeorological,
infrastructure, and Spanish-language social signals into a single operational
interface for SINAGERD emergency managers (COEN, COER Lima Metropolitana, distrital
COELs) responding to El Niño Costero 2026–2027 events in **Lima Metropolitana only**
(43 districts of Lima Province; Callao optional). Do not expand scope to other Peruvian
regions, other disaster types, or other languages without explicit instruction from
the owner.

Spanish-only UI and Spanish-only NLP for citizen signal triage. English toggle is
acceptable for the UI. No Quechua claims anywhere in code, tests, docs, or commit
messages — this is a deliberate scope decision.

## Branching, Commits, and Repository Hygiene

- **Single working branch: `develop`.** All commits land on `develop`. Push to remote
  after every coherent unit of work — do not batch days of work into one push.
- `main` is reserved for tagged submission releases only. Do not commit to `main`
  unless instructed.
- Conventional Commits format (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`,
  `test:`). Scope tags optional but encouraged (`feat(ingest): ...`).
- `.gitignore` covers Python, Node, Docker, IDE files, secrets, raw geospatial data
  (rasters/GeoTIFFs in `/data/raw/`), and any model weights >50MB.
- Never commit API keys, tokens, or `.env` files. All secrets via `.env` (gitignored)
  with a committed `.env.example`.
- Every PR-equivalent push to `develop` must keep the project in a working state
  (`docker compose up` succeeds, primary services reachable).
- Pre-commit hooks: `ruff` + `black` for Python, `prettier` + `eslint` for TS.

## Tech Stack (Locked Unless You Surface a Concrete Better Option)

### Backend
- **Python 3.12**, FastAPI, Pydantic v2, SQLAlchemy 2.x async.
- **PostGIS 16 + TimescaleDB** as the single primary database. One Postgres, two
  extensions. Spatial vector + time-series in the same engine.
- **MinIO** (self-hosted S3-compatible) for raster object storage.
- **Redis** for hot cache, pub/sub, and Prefect's metadata where applicable.
- **STAC catalog** via `stac-fastapi` (pgstac backend) for geospatial source-of-truth.
- **Prefect 2** for ingestion orchestration. Each source = one flow with retries,
  caching, and configurable schedules.
- **Geospatial libs**: `rasterio`, `rioxarray`, `xarray`, `geopandas`, `shapely`,
  `pystac-client`, `odc-stac`, `stackstac`, `sarsen` (for SAR RTC if not using
  ASF HyP3), `rio-tiler` for tile serving.
- **ML**: `scikit-learn`, `xgboost`, `lightgbm`, `torch` (CPU + CUDA), `transformers`,
  `huggingface_hub`. Flood segmentation model: start from open Sen1Floods11 weights
  or UrbanSARFloods derivatives; fine-tune later if time permits.
- **LLM serving**: `ollama` for local model serving. Primary model **Gemma 3 12B-IT
  (Q4_K_M GGUF)**, fallback **Qwen3-30B-A3B-Instruct-2507**. Do NOT reference
  "Gemma 4" or "DeepSeek 4" — those do not exist as of May 2026. Verified current
  releases: Gemma 3 (March 2025), Llama 4 Scout/Maverick (April 2025), Qwen3 + Qwen3-
  2507 (April–August 2025), DeepSeek-V3.2 (December 2025).

### Frontend
- **Next.js 14 (App Router)**, TypeScript, Tailwind CSS, shadcn/ui components.
- **MapLibre GL JS** for maps. PMTiles for self-hosted basemaps (zero map-vendor
  dependency). `deck.gl` overlays for high-density vector layers.
- **State**: Zustand for UI state, TanStack Query for server state.
- **Real-time**: WebSocket channel from FastAPI for live updates, Server-Sent Events
  for the alerts ticker.
- **PWA + offline**: service worker + IndexedDB cache of last operator state.
- **i18n**: `next-intl` with Spanish as default, English as toggle.
- **Accessibility**: WCAG AA contrast, full keyboard navigation, semantic HTML,
  screen-reader-tested critical paths.

### Infrastructure
- `docker-compose.yml` at root for local dev. All services containerized.
- Production target: single VM (Hetzner CCX or DigitalOcean), deployable via the
  same compose with overrides. Do not over-architect — judges will video-call,
  not load-test.
- Monitoring: Prometheus + Grafana (optional but encouraged in Phase 3 polish).

## Repository Layout
```
costa-resiliente/
├── README.md
├── BRIEF.md                          # this file
├── docker-compose.yml
├── docker-compose.override.yml.example
├── .env.example
├── .gitignore
├── .pre-commit-config.yaml
├── pyproject.toml                    # workspace-level Python config
├── docs/
│   ├── architecture.md
│   ├── data-sources.md
│   ├── responsible-data-handling.md
│   ├── operator-runbook.md
│   └── decisions/                    # ADRs, one per architectural decision
├── apps/
│   ├── api/                          # FastAPI service
│   │   ├── pyproject.toml
│   │   ├── src/costa_api/
│   │   ├── tests/
│   │   └── Dockerfile
│   ├── workers/                      # Prefect flows + ML inference workers
│   │   ├── pyproject.toml
│   │   ├── src/costa_workers/
│   │   │   ├── ingest/               # one module per data source
│   │   │   ├── ml/                   # flood seg, huayco model, triage
│   │   │   └── flows/                # Prefect orchestration
│   │   ├── tests/
│   │   └── Dockerfile
│   └── web/                          # Next.js dashboard
│       ├── package.json
│       ├── src/
│       ├── public/
│       └── Dockerfile
├── infra/
│   ├── postgres/init.sql             # PostGIS + TimescaleDB setup
│   ├── stac/                         # pgstac config
│   └── minio/                        # bucket setup
├── data/
│   ├── raw/                          # gitignored — local raster cache
│   ├── processed/                    # gitignored — derived outputs
│   └── fixtures/                     # committed — small test datasets
├── notebooks/                        # exploratory only, never in prod path
└── scripts/                          # one-shot utilities
```

## Data Sources to Wire (Priority Order)

Phase order matters. Get the foundation in before the polish.

### Tier 1 — Foundation (build first)
1. **Sentinel-1 GRD** via Microsoft Planetary Computer STAC API. Endpoint:
   `https://planetarycomputer.microsoft.com/api/stac/v1`. Collection:
   `sentinel-1-grd`. Use `pystac-client` for search, `odc-stac` for lazy loading.
   For RTC processing either use `sarsen` locally for small AOIs or submit jobs to
   ASF HyP3 (Earthdata Login required — note: HyP3 free tier is 8,000 credits/month
   on the Basic plan; verify current quota at submission time).
2. **IMERG Early Run** (NASA GPM, 4h latency, 0.1° resolution, half-hourly).
   Access via NASA EarthData GES DISC OPeNDAP or the IMERG STAC catalog where
   available. Establish a 24h, 12h, 6h, 3h, 1h accumulation rollup per watershed.
3. **PostGIS schema**: districts (43 Lima distritos as polygons), watersheds
   (Rímac, Chillón, Lurín plus their sub-basins and known huayco quebradas),
   critical infrastructure (hospitals, schools, fire stations, power substations,
   bridges from OpenStreetMap via Overpass API), and INEI 2017 census at manzana
   resolution where available (start at distrital, refine later).
4. **STAC catalog** populated with the ingested Sentinel-1 scenes, IMERG rasters,
   and any derived flood polygons.
5. **MapLibre + PMTiles basemap** of Lima Metropolitana. Generate from OSM extracts
   via Planetiler. Self-host the .pmtiles file behind FastAPI.

### Tier 2 — Operational layers
6. **ANA Rímac/Chillón/Lurín station feeds**. Public-facing data lives at
   `observatoriochirilu.ana.gob.pe` and `snirh.ana.gob.pe`. No public REST API
   confirmed — implement a polite scraper with rate limiting and respectful
   User-Agent. Cache aggressively. If scraping proves fragile, fall back to a
   manual nightly CSV refresh and document the gap.
7. **SENAMHI** hydromet stations and avisos meteorológicos. Same scraping caveat.
   Endpoint: `senamhi.gob.pe`. Document the access pattern as a known fragility.
8. **INDECI SINPAD** historical emergency dataset from
   `datosabiertos.gob.pe/dataset/emergencias-históricas-registradas-con-sinpad`
   (read-only CSV/API). Live SINPAD v2.0 (`sinpad2.indeci.gob.pe`) requires
   authorized accounts — document as a Phase 3 partnership ask, not an MVP commit.
9. **CENEPRED SIGRID** peligro layers and EVAR Chosica polygons. Download
   shapefiles, load into PostGIS, expose as a static hazard layer.
10. **IGP seismic feed** from `ultimosismo.igp.gob.pe` — useful for multi-hazard
    context even though primary scenario is flood/huayco.

### Tier 3 — Social and infrastructure
11. **Bluesky firehose** filtered for Spanish-language posts geotagged or
    keyword-matching Lima districts and Peru-disaster vocabulary. Use the public
    Jetstream API. No paid access required.
12. **Reddit** via `praw` — `r/Peru`, `r/Lima` with appropriate User-Agent.
13. **News RSS**: RPP (`rpp.pe`), El Comercio (`elcomercio.pe`), Andina
    (`andina.pe`), Canal N, La República. Standard RSS polling.
14. **Telegram public channels**: COER Lima, distrital civil defense channels.
    `telethon` with a bot-pattern account. Opt-in per channel.
15. **Waze** civil-protection partner feed if obtainable; otherwise skip in MVP.
16. **OSINERGMIN / Luz del Sur / Enel** outage signals where publicly tweeted or
    posted. Best-effort.

## ML Components

### Flood Segmentation (SAR)
- Start with the publicly released Sen1Floods11 weights from Cloud-to-Street's
  open repo. Reference: Bonafilia et al. (2020) CVPR Workshop paper.
- Evaluate against UrbanSARFloods (Zhu et al., arXiv:2406.04111, 2024) which is
  more representative of Lima's urban density.
- Inference target: process one full Sentinel-1 GRD scene over Lima
  Metropolitana in <5 minutes on CPU, <60 seconds on a single consumer GPU.
- Output: flood polygons in PostGIS with confidence scores and scene metadata.

### Huayco Susceptibility
- Implement an XGBoost model following the methodology of
  Castro-Cabrera et al. (2024), "A Comparative Study of Susceptibility and
  Hazard for Mass Movements ... Northern Lima Commonwealth, Peru", Geosciences
  14(6):168. Inputs: slope, aspect, lithology, distance-to-stream, NDVI, soil
  moisture (SMAP), antecedent rainfall (IMERG 24h/72h/7d). Target: historical
  CENEPRED huayco event database where available; failing that, the
  Castro-Cabrera training labels.
- Augment with on-demand `r.avaflow` simulations for the ten highest-priority
  Lima quebradas (Pedregal, Quirio, Corrales, Cashahuacra, Carossio, Huaycoloro,
  Carapongo, Cieneguilla, Ñaña, Yanacoto) when IMERG 24h accumulation crosses a
  watershed-tuned threshold. r.avaflow is GRASS-based; containerize a GRASS
  worker.

### Spanish Signal Triage (LLM)
- Local serving via Ollama with **Gemma 3 12B-IT (Q4_K_M GGUF)** as primary.
  Fallback: **Qwen3-30B-A3B-Instruct-2507** (Apache 2.0, MoE).
- Triage prompt: classify each ingested social signal into
  `{needs_help, infrastructure_damage, road_blocked, weather_observation,
   false_alarm, irrelevant}` with confidence and extracted location entity
  (Lima district or street).
- Strict output format: structured JSON, validated with Pydantic. Reject and
  re-prompt on schema violation up to N times before quarantining.
- Reference benchmark for Spanish model selection: Grandury et al. (ACL 2025),
  "La Leaderboard", arXiv:2507.00999.

### Operator Copilot (RAG over Structured Data)
- The Ask Panel accepts Spanish natural-language queries. Pipeline:
  intent classification → SQL/spatial-query plan generation against PostGIS
  → execute → summarize results in Spanish prose with citations to data
  sources and timestamps.
- **The LLM never fabricates facts onto the operator screen.** It routes queries
  and summarizes structured results. All numerical claims must trace to a row
  in the database. If a query can't be resolved against the data, the system
  says so explicitly.
- Apply prompt-injection hardening informed by the owner's prior research
  (Aegis-style cognitive firewall): treat all social-signal text as untrusted
  input, never let it enter the operator's query context unsanitized.

## Responsible Data Handling — Non-Negotiable

Implement these as code, not as documentation aspirations:

1. **PII redaction pipeline** for all citizen-reported social signals. Faces and
   identifying text in images, names, phone numbers, license plates, exact home
   addresses. Use `presidio-analyzer` for text, lightweight CV for image faces.
2. **Location coarsening**: any data shown outside the closed responder UI gets
   coarsened to manzana centroid (~100m) or district centroid.
3. **Retention limits**: raw social firehose 7 days, derived non-PII features
   12 months, aggregates indefinitely. Implement as PostgreSQL `pg_cron` jobs
   or Prefect scheduled cleanup flows.
4. **Decision log**: every operator action — query, alert dismissal, region
   pin — is logged immutably with timestamp, user, action, payload. Use an
   append-only table.
5. **Consent**: Spanish-only consent strings on any optional citizen reporting.
6. **Compliance reference**: Peru's Ley 29733 + DS 016-2024-JUS (2025
   reglamento), OCHA Data Responsibility Guidelines (2025 revision), IASC
   Operational Guidance on Data Responsibility (April 2023). Cite these in
   `docs/responsible-data-handling.md`.

## UI/UX Requirements

Four primary surfaces, accessible from a persistent left rail:

1. **Scenario Panel** — pin a Lima district or watershed plus a time window.
   All other panels filter by this context.
2. **Map View** — the centerpiece. Layer toggles for: Sentinel-1 flood polygons,
   huayco probability per quebrada, ANA river levels, IMERG rainfall heatmap,
   critical infrastructure, district boundaries, social signal pins (clustered).
3. **Alerts Feed** — color-coded by severity, auto-grouped by location.
   Operator can acknowledge, escalate, or mark false-positive.
4. **Ask Panel** — Spanish natural-language input. Returns a written brief plus
   an automatic map overlay.
5. **Decision Log** — immutable record, exportable to CSV for EDAN-Perú workflows.

Design principles:
- Spanish-first; English toggle.
- WCAG AA contrast; full keyboard navigation.
- PWA installable; offline-capable for last known state.
- Mobile, tablet, desktop responsive.
- Onboarding: 15-minute interactive tutorial keyed to a synthetic 2017 Coastal
  El Niño replay. Build this once Tier 1 + Tier 2 ingestion is working.

## Build Sequence (Suggested, You May Adjust)

Phase order is not the same as IEEE phase order — this is the engineering plan.

### Sprint 0 (Days 1–3): Scaffolding
- Initialize repo, set up `develop` branch, push to remote.
- Create the repository layout above. Add README, BRIEF.md (this file),
  .env.example, .gitignore, pre-commit config.
- Stand up `docker-compose.yml` with PostGIS+TimescaleDB, MinIO, Redis. Verify
  all services healthcheck green.
- Add an ADR (Architecture Decision Record) format in `docs/decisions/`. First
  ADR: "Why single-VM single-Postgres design".

### Sprint 1 (Days 4–10): Foundation Ingestion
- Implement Sentinel-1 ingest from MS Planetary Computer. End state: given a
  date range and a Lima AOI, fetch GRD scenes, store in MinIO, register in
  STAC.
- Implement IMERG ingest. End state: 24h/12h/6h/3h accumulations per Lima
  watershed in TimescaleDB.
- Load Lima district polygons, watersheds, OSM critical infrastructure into
  PostGIS. End state: a `/api/v1/districts` endpoint returns GeoJSON.

### Sprint 2 (Days 11–18): Dashboard Skeleton
- Stand up Next.js + MapLibre + PMTiles basemap of Lima.
- Wire the FastAPI backend to the frontend. Render district boundaries and one
  data layer (IMERG rainfall heatmap is the easiest first win).
- Implement the Scenario Panel and a minimal Map View.

### Sprint 3 (Days 19–30): Flood Segmentation
- Integrate Sen1Floods11 weights (or UrbanSARFloods if quality demands).
- Run inference on a test Sentinel-1 scene over Lima. Output polygons to
  PostGIS. Render on the dashboard.

### Sprint 4 (Days 31–45): Huayco Probability + ANA + Social
- XGBoost huayco model with static + dynamic features.
- ANA station scraper into TimescaleDB.
- Bluesky + Reddit + RSS ingestion. PII redaction pipeline.

### Sprint 5 (Days 46–60): LLM Integration
- Ollama serving Gemma 3 12B-IT.
- Spanish signal triage with strict JSON output.
- Operator copilot RAG-over-structured-data with prompt-injection hardening.

### Sprint 6 (Days 61–75): Polish
- Alerts Feed, Decision Log, full UI polish.
- Offline PWA mode.
- Onboarding tutorial.
- Health/freshness panel.
- Synthetic 2017 replay dataset for demo.

### Sprint 7 (Days 76–95): Documentation, Video, Buffer
- Full README, architecture doc, data-sources doc, responsible-data-handling
  doc, operator runbook.
- 2–5 minute demo video.
- Performance and reliability hardening.
- Submission buffer.

## Operating Principles

- **Read SKILL.md files before doing skill-relevant work.** If a task involves
  generating documents, slides, spreadsheets, or PDFs, check `/mnt/skills/` for
  relevant skills first.
- **Surface uncertainty.** If a data source's API has changed, if a model's
  license is ambiguous, or if a technical assumption from this brief is wrong,
  raise it immediately rather than working around it silently.
- **Prefer working software over speculative architecture.** Ship a thin
  end-to-end slice early; layer in depth after.
- **Document architectural decisions in ADRs.** One per significant choice.
- **Tests are required for ingestion contracts and ML inference outputs.**
  Tests are optional but encouraged for everything else.
- **Performance budget**: page load <2s on a mid-range laptop, map interaction
  <100ms, primary data refresh latency as described in the IEEE Phase 2 form.
- **Security**: never log secrets, never echo raw social-signal text to client
  without sanitization, never let LLM-generated SQL execute without validation
  against a whitelist of allowed operations.
- **Commit etiquette**: every push to `develop` keeps `docker compose up`
  working. Broken intermediate states stay local until resolved.

## Out of Scope for MVP

- Hurricane/cyclone, wildfire, tornado, tsunami support.
- Geographic regions outside Lima Metropolitana.
- Languages other than Spanish (and English UI toggle).
- Mobile-native apps (PWA only).
- Quechua, Aymara, or any indigenous-language NLP.
- Mobile signaling (Movistar/Claro/Entel) — document as Phase 3 stretch goal.
- Real-time partnership integrations with COEN/COER — document as stretch.

## First Action for Claude Code

1. Acknowledge this brief by creating `docs/decisions/0001-project-charter.md`
   that summarizes the mission, scope, locked stack choices, and out-of-scope
   list in your own words. This is your way of confirming you've read and
   internalized the brief.
2. Create the repository layout per the spec above.
3. Initialize `develop` branch, commit the scaffolding, push.
4. Stand up `docker-compose.yml` with PostGIS+TimescaleDB, MinIO, Redis. Verify
   healthchecks. Commit, push.
5. Report back with: what you built, what you decided, what surprised you, and
   what you propose for Sprint 1.

The owner reviews `develop` regularly. Push often, push small, keep it working.