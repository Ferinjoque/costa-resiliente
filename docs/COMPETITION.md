# Costa Resiliente — Competition Context

> **This is the single source of truth for IEEE Response Quest 2026 context, rubric, and scope.**
> Last updated: 2026-05-18

For current build progress, see [`STATUS.md`](STATUS.md).
For frontend design system, see [`../apps/web/DESIGN.md`](../apps/web/DESIGN.md).

---

## Competition overview

**IEEE Response Quest Challenge 2026** — competition asking teams to build operational disaster-response tooling that fuses real-time data sources into actionable situational awareness for a specific scenario.

| Milestone | Date |
|-----------|------|
| Phase 2 Concept submission | June 5, 2026 — **submitted** |
| Phase 3 Product submission deadline | **9 October 2026** |
| Phase 3 judging | November–December 2026 |

**Submission:** Solo (Fernando Injoque, IEEE Member).

**Scoring:** 5 criteria, equal weight, 5.0 each, 25.0 total.

---

## Rubric — 5 criteria

### C1 — Timeliness & Real-Time Responsiveness

How quickly does the platform reflect new data? Are alert pushes live? Is the architecture honest about its latency floor (satellite revisit, scraping cadence)?

**Our position:** Sentinel-1 polygons ~3h post-acquisition + <5 min CPU inference. IMERG every 30 min. ANA + SENAMHI every 15 min. Social signals every 15 min. SSE push at the Next.js app shell so map district colors refresh on new events without any panel open. `DataFreshnessBar` shows last-updated per layer.

### C2 — Comprehensiveness & Novel Data Discovery

How many distinct data sources? Any novel sources that competitors won't have?

**Our position:** 10 data sources spanning satellite, hydromet, historical, social, and infrastructure (full list in [`data-sources.md`](data-sources.md)). Novel choices: Bluesky AT Protocol firehose (nearly absent from comparable platforms), INDECI SINPAD 18-year event density as a data-driven hazard proxy (reproducible, independent of SIGRID SSO-gated portal), local-only Ollama inference stack with zero cloud API dependency.

### C3 — Integration & Synthesis Quality + Responsible Data Handling

How well are the streams fused? Are responsible-data-handling controls real (code) or aspirational?

**Our position:** Single PostgreSQL 16 instance combining PostGIS + TimescaleDB + pgstac + pgvector — one query can join SAR extents, rainfall accumulations, station observations, and social clusters without cross-service calls. Auto-alert generator fuses flood + huayco + social into single ranked stream. Agentic copilot reasons across all 8 DB tools + protocol RAG (INDECI, MINSA, CENEPRED). Responsible handling enforced in code: presidio PII redaction, XML signal sandboxing, gemma2:2b output guardrail, append-only decision log (DB trigger), pg_cron 7-day purge.

### C4 — Usability & Operational Readiness

Does it look like real ops software a duty officer would touch? WCAG? Mobile? Offline?

**Our position:** Spanish-first with EN toggle. Full keyboard navigation. **Lighthouse 100/100 accessibility**. WCAG AA contrast verified at the design-token level. PWA installable + service worker offline cache. Responsive 375 / 768 / 1024 / 1440 / 1920. driver.js spotlight onboarding tour keyed to the 2017 El Niño replay. JWT auth with SINAGERD roles (COEN/COER/COEL). SLA breach indicators on alert cards. PDF EDAN-Perú export from decision log.

### C5 — Scenario Fit & Innovation

Is the platform specific to a real scenario or a generic dashboard? Are the technical choices genuinely innovative for the humanitarian space?

**Our position:** Scoped to Lima Metropolitana (43 districts, 3 watersheds, 10 priority quebradas) and El Niño Costero floods + huaycos only. SINAGERD vocabulary throughout. EDAN-Perú CSV + PDF outputs for COEN reporting. 2017 El Niño synthetic replay with date scrubber. Novel: agentic copilot combining multi-tool reasoning, pgvector RAG over Peruvian emergency protocols, and fast output guardrails — a production-grade AI safety stack applied to a humanitarian tool, informed by the project owner's prior research on prompt injection.

---

## Mission statement

Deliver **decision-support tooling** — not autonomous decision-making — to Peruvian emergency managers during El Niño Costero 2026–2027. The system surfaces timely, fused situational awareness; the humans act. Every data claim shown to operators must trace to a timestamped, sourced database row. The LLM routes and summarizes; **it never fabricates**.

---

## Scope

### In scope (locked)

- **Geography:** Lima Metropolitana — 43 districts of Lima Province (Callao optional in Phase 3)
- **Hazards:** El Niño-driven floods and huaycos (debris flows) only
- **Languages:** Spanish UI + Spanish NLP (primary); English UI toggle
- **Actors:** Peru SINAGERD system — COEN (national), COER Lima (regional), distrital COELs

### Out of scope (locked, no silent expansion)

- Geographic regions outside Lima Metropolitana
- Hazards: hurricanes, wildfires, tornadoes, tsunamis, seismic (seismic shown as context only)
- Languages beyond Spanish + English UI — **no Quechua, Aymara, or other indigenous-language NLP**
- Mobile-native apps (PWA only)
- Real-time COEN/COER integrations requiring authorized accounts (Phase 3 stretch)
- Mobile carrier signaling (Movistar/Claro/Entel) — Phase 3 stretch

---

## Scenario reference — 2017 El Niño Costero

The 2017 event is the reference scenario:
- **Nationally:** >1.6 million people affected
- **Lima:** catastrophic losses across the ten priority quebradas (Huaycoloro, Pedregal, Quirio, Carapongo, Cashahuacra, Carossio, Cieneguilla, Ñaña, Yanacoto, Corrales)
- **SINAGERD response:** fragmented — duty officers pieced together emailed satellite images, ANA PDF bulletins, and WhatsApp groups; no real-time fusion of streams

The platform ships a **synthetic 2017 replay** with 5 date steps (Mar 15 – Apr 2 2017) and pre-baked SAR flood polygons. New operators walk through the historical event before facing a live one. The driver.js spotlight tour binds each step to the corresponding map layer activation.

---

## Target user — COER Lima duty officer

The reference persona is the COER Lima duty officer who must decide within minutes whether to:
- Activate district emergency protocols
- Issue evacuation orders for specific quebradas
- Escalate to COEN

The interface follows their natural decision sequence:
1. **Set context** — Scenario Panel: district + time window + SINAGERD HUD
2. **Check the map** — Map View: 9+ toggleable layers + 3D extrusion + radar sweep
3. **Act on alerts** — Alerts Feed: ack / escalate / false-positive / dispatch resources
4. **Query the data** — Ask Panel: Spanish NL → agentic copilot → cited prose
5. **Review the log** — Decision Log: append-only + EDAN-Perú CSV + PDF export

---

## Locked stack decisions

### Single PostgreSQL with PostGIS + TimescaleDB + pgstac + pgvector

One DB engine for spatial vector, raster catalog, time-series, and vector similarity. Eliminates cross-service joins; keeps latency predictable. Solo-developer manageable. Escape hatch: TimescaleDB multi-node or Citus if scale becomes a problem post-MVP.

See [`decisions/0001-project-charter.md`](decisions/0001-project-charter.md).

### Prefect 3 for orchestration

Retries, caching, observability, configurable schedules with minimal boilerplate. Airflow DAG overhead is disproportionate for solo work; Celery lacks geospatial scheduling primitives.

### Ollama for local LLM serving

Zero cloud API dependency, zero per-request cost, no data egress for citizen PII. Three models on a single container: qwen2.5:7b-instruct-q4_K_M (copilot + triage), gemma2:2b (fast guardrails), nomic-embed-text (RAG embeddings). Apache 2.0 weights across the stack.

See [`decisions/0002-ml-architecture.md`](decisions/0002-ml-architecture.md).

### MapLibre + PMTiles (not Mapbox / Google Maps)

Zero vendor tile API dependency. PMTiles single-file served via HTTP Range. OSM-derived basemap generated via Planetiler. No API key, no per-tile billing, no outage dependency on external CDN.

### Next.js 14 App Router

Owner's daily stack. Server components reduce initial bundle. Tailwind + custom OKLCH design system (see [`../apps/web/DESIGN.md`](../apps/web/DESIGN.md)) — no shadcn defaults that read as AI-template.

---

## Compliance basis

Privacy, retention, and decision-log integrity rest on three frameworks (cited in [`responsible-data-handling.md`](responsible-data-handling.md)):

- **Peru Ley 29733** (Ley de Protección de Datos Personales) + **DS 016-2024-JUS** (2025 Reglamento) — governs PII handling for citizen-sourced data
- **OCHA Data Responsibility Guidelines** (2025 revision) — humanitarian principles: do-no-harm, purpose limitation, data minimization
- **IASC Operational Guidance on Data Responsibility in Humanitarian Action** (April 2023) — SINAGERD operational context

Implementation is code-level, not aspirational:
1. `presidio-analyzer` PII redaction on every signal before storage
2. Location coarsening to manzana centroid (~100m) for non-responder views
3. `pg_cron` 7-day purge on raw social signals
4. Append-only decision log via DB trigger (rejects UPDATE / DELETE)
5. Spanish-only consent strings on optional citizen reporting
6. LLM anti-fabrication guarantee — numerical claims trace to DB rows; LLM never executes raw SQL

---

## Submission deliverables

| Artifact | Status |
|----------|--------|
| Phase 2 Concept text + 5 PlantUML diagrams | ✅ Submitted (see [Phase 2 archive](#phase-2-submitted-text) below) |
| Public live URL with HTTPS | ❌ **Sole remaining gap** — Hetzner CX32 €11/mo or DigitalOcean $20/mo |
| `docker-compose.prod.yml` + Caddy + deploy script | ✅ Ready |
| 2–5 minute demo video | ❌ Pending VPS deploy |
| Open-source repository | ✅ Apache 2.0 |
| Responsible data handling doc | ✅ [`responsible-data-handling.md`](responsible-data-handling.md) |
| Operator runbook | ✅ [`operator-runbook.md`](operator-runbook.md) |
| Architecture doc | ✅ [`architecture.md`](architecture.md) |
| Data sources doc | ✅ [`data-sources.md`](data-sources.md) |

---

## Phase 3 delta — what changed since Phase 2 submission

The Phase 2 concept text below describes the state at June 5, 2026. The Phase 3 product now delivered contains the following material additions:

| Area | Phase 2 | Phase 3 |
|------|---------|---------|
| Copilot DB tools | 8 tools | **9 tools** — added `get_population_at_risk` (INEI 2017 census × SAR spatial join; estimates affected persons per district with `ST_MakeValid` + `ST_Intersection`) |
| Auth | Not described | JWT auth for 3 SINAGERD operator roles (COEN/COER/COEL); all actions attributed to authenticated user in Decision Log |
| Notifications | Not described | Webhook + SMS (Twilio) subscriber CRUD; auto fan-out on critical/high alert creation (not just on operator escalate) |
| HITL workflow | Aspirational | Full proposals panel — agentic copilot submits to `ops.alert_proposals`, operator approves/rejects; no AI alert reaches live feed without human approval |
| EDAN-Perú PDF | Not described | PDF export from Decision Log via ReportLab (A4, Spanish); CSV export also available |
| Copilot latency | ~30s (full LLM) | **Quick-mode** for 5 common query types: keyword match → DB tool → template answer in ~2s, bypassing LLM entirely; honest UX signal when full reasoning is engaged |
| Alert queue management | Basic | Auto-resolution by alert type (flood: 7d, huayco: 48h, social: 4h, rainfall: 6h); prevents queue saturation during sustained El Niño events |
| IMERG alerts | Not described | Automated rainfall threshold alerts (50/25/15 mm at 72/72/24h windows; ANA-aligned); deduplicated per watershed per 6h |
| River level trend | Not described | Two-CTE query computes 1h trend (rising >5cm/h / falling / stable) and level_change_1h_m; system prompt highlights rising rivers for evacuation priority |
| Data resilience | Not described | ANA/SENAMHI gauge readings cached in Redis (24h TTL); station layer stays populated during government site outages |
| Callao | Optional Phase 3 | Static district polygons and geodata for 9 Callao districts added (includes Ventanilla and Mi Perú quebrada risk zones) |
| Evacuation shelters | Not described | INDECI-designated Lima evacuation shelters layer (static data); linked from AlertsPanel for duty-officer next-step guidance |
| Frontend panels | 6 main surfaces | 9 main surfaces: added ProposalsPanel, NotificationsPanel, DistrictDashboardPanel, SharePanel, FusionCallout |
| Services | 9 containers | 9 containers (same); pgstac bootstrapped with pypgstac so Sentinel-1 and flood-seg flows now ingest new scenes |

**Session 20 additions (2026-05-31, 54 commits):**

| Area | Session 19 | Session 20 |
|------|------------|------------|
| Copilot speed | Quick-mode (~2s, 9 patterns) | **SITREP mode** (~3s): start-of-shift query → 4 tools parallel, structured narrative (ALERTAS · LLUVIA · RÍOS · INUNDACIÓN). 35+ sitrep trigger phrases. |
| Copilot answers | Generic | **SENAMHI thresholds** in river answers; **huayco probability** shown; **hospital names** when infrastructure affected; **rainfall windows** (72h/24h/1h); **top critical alert title + district** |
| Fusion endpoint | flood + huayco + social | **+ rainfall**: watershed 72h/24h/mm + ANA level (emergencia/alerta); prose includes rainfall when above threshold; risk_level elevated by rainfall |
| Protocol RAG | 5 documents | **+ ANA Umbrales Lluvia Lima** (6th doc): 25/50mm/72h ANA thresholds, quebrada-specific triggers, emergency contacts |
| HUD | No rainfall | **Rainfall chip** shows when ≥25mm/72h (ALERTA/EMERGENCIA color) |
| FEEDS chip | All sources | **Only core sources** (bluesky/rss/imerg/stations/alerts) — no false red from expected-offline reddit/telegram/SAR |
| SLA | Visual only | **SLA breach toast** (danger variant) fires when alert exceeds SLA — visible even outside Alerts panel |
| AlertsPanel | Province/district filter | **+ severity filter** (Todas/Crit/Alta toggle) |
| FusionCallout | flood/huayco/social | **+ rainfall row** with ANA level color coding |
| DataFreshnessBar | No staleness | **Color coding** by layer age (ok/warn/stale thresholds per layer) |
| LiveTicker | Generic | **Severity prefix** [EMERG/ALERT/AVISO] + **rainfall item** when ≥25mm + urgent-only social filter |
| Tests | 568 passed | **633 passed** (+65: sitrep, rainfall, SENAMHI threshold, fusion-rainfall, EDAN pattern, IMERG label regression, copilot HTTP, health-level) |
| Health API | Basic ok/version | **`/health` returns sinagerd_level + active_alerts + max_rain_72h_mm** — one-curl monitoring |
| RAG corpus | 5 documents | **7 documents, 51 chunks** — added ANA rainfall thresholds + SINAGERD quick-action guide (AVISO/ALERTA/EMERGENCIA procedures + contacts) |
| Fusion endpoint | flood + huayco + social | **+ rainfall + huayco trigger_rain_24h_mm + risk elevation from EMERGENCIA** |
| EDAN export | SAR + population + districts | **+ rainfall metric card (ALERTA/EMERGENCIA) in all 3 formats (Markdown ES, Markdown EN, HTML)** |
| Protocol checklist | Huayco + generic | **+ rainfall-specific protocol (brigades + SIAT-Lima pre-alert)** |
| SINAGERD level | Alerts only | **Factors in rainfall everywhere** (health API + OperationalHUD + SituationBrief + CityOverview + EDAN) — 5 surfaces give same level |

**Rubric alignment note:** The Phase 2 submission referenced "8 whitelisted database tools" and did not describe notifications, auth, HITL, or PDF export. All of these are now fully implemented and tested. Tool count correction for Phase 3 judges: **9 tools + sitrep multi-tool fast path**.

---

## Phase 2 submitted text

> Original submission to the IEEE Response Quest 2026 Concept phase. The text below was pasted into the official form fields. Diagrams 1–5 were rendered from PlantUML and uploaded as PNGs.

### Submission Title

Costa Resiliente: Near-Real-Time Flood and Huayco Situational Awareness for Lima Metropolitana

### Disaster Scenario

Lima Metropolitana faces recurring El Niño Costero floods and huaycos that consistently overwhelm emergency response coordination. The 2017 El Niño Costero — the reference scenario for this project — left over 1.6 million people affected nationally and caused catastrophic losses across Lima's ten priority quebradas, including Huaycoloro, Pedregal, Quirio, and Carapongo.

Peru's SINAGERD structure has three operational tiers: COEN at the national level, COER Lima regionally, and 43 district-level COELs. None of them currently have a unified situational awareness tool. Duty officers piece together information from emailed satellite images, ANA PDF bulletins, and WhatsApp groups — no one is fusing those streams in real time.

This platform targets the COER Lima duty officer who needs to decide within minutes whether to activate district emergency protocols, issue evacuation orders for specific quebradas, or escalate to COEN. The goal is to bring together Sentinel-1 SAR flood extents, NASA IMERG rainfall, ANA and SENAMHI station readings, Spanish-language social signals, 18 years of SINPAD historical data, and ML-derived risk predictions into one operational dashboard built for the 2026-2027 El Niño cycle.

### Concept Overview

Costa Resiliente is an open-source near-real-time platform designed to give Lima's emergency managers a single operational picture during El Niño floods and huaycos. It will fuse satellite radar, hydrometeorological, social, infrastructure, and historical data through an agentic AI copilot that reasons across all sources and responds in Spanish. The full system is designed to run on a nine-service Docker Compose stack deployable on a single VPS for under $25 per month, keeping infrastructure costs within reach of public emergency management agencies.

**Architecture:** FastAPI (Python 3.12) with ~30 REST endpoints and an SSE stream for live alert delivery. PostgreSQL 16 combines PostGIS 3.4, TimescaleDB, pgstac, and pgvector in a single instance. Prefect 3 orchestrates all ingestion flows. Redis decouples ingest events from ML inference. A dedicated Ollama container serves three local models: qwen2.5:7b-instruct-q4_K_M for copilot + triage (4.7 GB), gemma2:2b for input + output guardrails (1.6 GB), nomic-embed-text for pgvector RAG (274 MB). Next.js 14 PWA frontend targeting WCAG AA.

**Data Sources:** Ten sources planned — Sentinel-1 GRD via Planetary Computer, NASA IMERG Early Run V07B, ANA + SENAMHI station scrapers, INDECI SINPAD 2003–2020 (2,063 Lima records), INEI 2017 census for population exposure, OSM infrastructure (43,000+ points), Bluesky Jetstream v2 firehose, six Peruvian news RSS feeds, Reddit (r/Peru, r/Lima, r/Chosica), SENAMHI Telegram channel.

**ML Components:** Three pipelines, fully local. SAR flood segmentation via U-Net from Sen1Floods11 weights (Bonafilia et al. 2020 CVPR). Huayco susceptibility via XGBoost following Castro-Cabrera et al. (Geosciences 14(6):168, 2024). Spanish signal triage via qwen2.5:7b with Pydantic-validated JSON output and XML sandboxing.

**Agentic AI Layer:** Multi-tool agentic loop with 8 whitelisted parameterized database tools: `get_flood_polygons`, `get_huayco_risk`, `get_river_levels`, `get_social_clusters`, `get_infrastructure_impact`, `get_rainfall_accumulation`, `get_active_alerts`, `search_protocols` (pgvector RAG over INDECI, MINSA, CENEPRED protocols). Up to 4 tool iterations per query. Input guardrails apply regex filtering before any LLM call; output guardrails redact PII. The LLM never touches raw SQL and says so explicitly if a query returns no data.

**Dashboard:** Six main operator surfaces from a persistent left rail — Scenario Panel (district + time + SINAGERD HUD), Map View (9+ layers with 3D SAR extrusion and radar sweep), Alerts Feed (SSE-pushed at app shell level), Ask Panel (agentic copilot), Decision Log (append-only with EDAN-Perú CSV + PDF export), Social Feed. Supporting panels: multi-hazard district fusion, read-only share tokens. Onboarding is a step-by-step spotlight walkthrough keyed to a synthetic 2017 El Niño replay.

### Diagrams

Five PlantUML diagrams accompanied the Phase 2 submission. The source is preserved here for the Phase 3 product re-submission:

1. **System Architecture** — Browser → FastAPI → PostgreSQL / Redis / MinIO / Ollama / Prefect topology
2. **Data Ingestion and ML Pipeline** — Sentinel-1 / IMERG / Social → ML → Alert Generator → SSE
3. **Agentic Copilot Flow** — Spanish NL query → input guardrail → 8-tool agent → output guardrail → cited answer
4. **Responsible Data Handling** — Social signal lifecycle with PII redaction, XML sandbox, 7-day purge
5. **Dashboard Operator Flow** — six operator surfaces and their connections

PlantUML source blocks are kept in [`phase2-submission.md`](phase2-submission.md) (legacy archive — render at plantuml.com to regenerate diagram PNGs).

---

## Glossary

- **SINAGERD** — Sistema Nacional de Gestión del Riesgo de Desastres (Peru's national disaster risk management system)
- **INDECI** — Instituto Nacional de Defensa Civil (Peru's national civil defense institute; issues EMERGENCIA / ALERTA / AVISO levels)
- **CENEPRED** — Centro Nacional de Estimación, Prevención y Reducción del Riesgo de Desastres
- **COEN** — Centro de Operaciones de Emergencia Nacional (national operations center)
- **COER** — Centro de Operaciones de Emergencia Regional (regional operations center — Lima Metropolitana, etc.)
- **COEL** — Centro de Operaciones de Emergencia Local (district-level operations center)
- **EDAN-Perú** — Evaluación de Daños y Análisis de Necesidades (post-event damage assessment and needs analysis report format)
- **SIGRID** — Sistema de Información para la Gestión del Riesgo de Desastres (CENEPRED's geospatial portal, SSO-gated)
- **SINPAD** — Sistema Nacional de Información para la Respuesta y Rehabilitación (INDECI's emergency event database)
- **ANA** — Autoridad Nacional del Agua (Peru's national water authority)
- **SENAMHI** — Servicio Nacional de Meteorología e Hidrología del Perú
- **IGP** — Instituto Geofísico del Perú (seismic monitoring)
- **INEI** — Instituto Nacional de Estadística e Informática (national statistics, census)
- **Huayco** — Andean term for a debris flow / mudslide (the second primary hazard alongside flooding)
- **Quebrada** — Narrow valley / dry ravine (the geographic feature where huaycos channel)
- **Ubigeo** — INEI 6-digit district identifier (Peru's geographic primary key)
- **Manzana** — Census block (smallest INEI geographic unit)
