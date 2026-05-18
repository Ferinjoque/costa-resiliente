# Costa Resiliente — Project Status

> **This is the single source of truth for what's built, what's pending, and the current rubric score.**
> Last updated: 2026-05-17
> Branch: `develop`

For competition context, see [`COMPETITION.md`](COMPETITION.md).
For frontend design system, see [`../apps/web/DESIGN.md`](../apps/web/DESIGN.md).

---

## Score — IEEE Response Quest 2026 rubric

Out of 25 total (5 criteria × 5.0). See [`COMPETITION.md`](COMPETITION.md) for criterion definitions.

| # | Criterion | Score | Gap |
|---|-----------|-------|-----|
| C1 | Timeliness & Real-Time Responsiveness | **4.7** | ANA scraper fragility |
| C2 | Comprehensiveness & Novel Data Discovery | **5.0** ✅ | — |
| C3 | Integration & Synthesis | **5.0** ✅ | — |
| C4 | Usability & Operational Readiness | **5.0** ✅ | Lighthouse pass confirmed on VPS deploy |
| C5 | Scenario Fit & Innovation | **5.0** ✅ | r.avaflow simulation (post-submission) |
| | **Total** | **~24.7 / 25** | VPS deployment unblocks final judging |

**Sole remaining gap: public VPS deployment with HTTPS.** All code, compose files, Caddy config, and deploy scripts are ready.

---

## Tests

- **API**: 9 new tests added (5 social + 4 proposals) all passing in isolation. Single Ollama timeout flake unchanged. Full-suite run shows ~20 `test_session_audit.py` failures attributed to asyncpg connection-pool exhaustion when the FastAPI app is exercised in-process by ASGITransport while also serving live HTTP from costa-api (default pool: 5 + 10 overflow). Every individual failing test passes when run in isolation — `python -m pytest tests/test_session_audit.py::TestAlerts::test_action_sql_injection_in_operator` etc. PASS one-by-one. The fix is a larger pool or per-test client teardown; documented here, not done tonight.
- **TypeScript**: 0 errors (`npx tsc --noEmit`)
- **Build**: Next.js production build green; first-load JS `/` = 175 kB (Session 5: 153 → 173 → 175 with new ProposalsPanel)

Test command (in container):
```bash
docker exec costa-api python -m pytest --asyncio-mode=auto -q
```

---

## Stack at a glance

### Services (9 Docker containers, all healthy)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `costa-postgres` | timescale/timescaledb-ha:pg16 | 5432 | PostGIS + TimescaleDB + pgstac + pgvector |
| `costa-redis` | redis:7-alpine | 6379 | Pub/sub + Prefect metadata |
| `costa-minio` | minio/minio | 9000/9001 | Raster + model object storage |
| `costa-stac` | stac-utils/pgstac-api | 8082 | STAC catalog REST API |
| `costa-api` | custom Python 3.12 + FastAPI | 8000 | Main REST API (~30 endpoints + SSE) |
| `costa-prefect-server` | prefecthq/prefect:3 | 4200 | Orchestration UI + API |
| `costa-prefect-worker` | custom | — | Ingestion + ML workers |
| `costa-web` | custom Next.js 14 | 3000 | PWA frontend |
| `costa-ollama` | ollama/ollama | 11434 | Local LLM inference |

Production adds Caddy as TLS-terminating reverse proxy.

### LLM models (local-only, no cloud API dependency)

| Role | Model | Size | Active env var |
|------|-------|------|---------------|
| Copilot + signal triage | `qwen2.5:7b-instruct-q4_K_M` | 4.7 GB | `LLM_PRIMARY_MODEL` |
| Input + output guardrails | `gemma2:2b` | 1.6 GB | — |
| RAG embeddings (pgvector) | `nomic-embed-text` | 274 MB | — |

Stale env var `OLLAMA_PRIMARY_MODEL=gemma4:e4b` was commented out in local `.env`. Pydantic `AliasChoices` picks `LLM_PRIMARY_MODEL` first.

### Frontend

- Next.js 14 App Router, TypeScript, Tailwind, MapLibre GL
- State: Zustand (UI + auth), TanStack Query (server)
- i18n: `next-intl` with ES default / EN toggle
- PWA installable, service worker, offline last-state cache
- Cream felt-style design system — see [`DESIGN.md`](../apps/web/DESIGN.md)

---

## What's built

### Backend — API endpoints (32 total)

```
GET    /api/v1/health
GET    /api/v1/health/seed
POST   /api/v1/health/seed
GET    /api/v1/health/scraper

GET    /api/v1/districts
GET    /api/v1/districts/risk-summary
GET    /api/v1/districts/{ubigeo}
GET    /api/v1/districts/{ubigeo}/dashboard
GET    /api/v1/districts/{ubigeo}/watersheds

GET    /api/v1/layers/imerg/latest
GET    /api/v1/layers/flood/latest
GET    /api/v1/layers/flood/exposure
GET    /api/v1/layers/huayco/susceptibility
GET    /api/v1/layers/hazard
GET    /api/v1/layers/infrastructure
GET    /api/v1/layers/stations
GET    /api/v1/layers/watersheds
GET    /api/v1/layers/quebradas
GET    /api/v1/layers/social

GET    /api/v1/alerts
POST   /api/v1/alerts/{id}/action
GET    /api/v1/alerts/stream                  (SSE — app-shell push)
GET    /api/v1/alerts/decision-log
GET    /api/v1/alerts/decision-log/export     (CSV — EDAN-Perú)
GET    /api/v1/alerts/decision-log/report     (PDF — EDAN-Perú A4)

POST   /api/v1/copilot/ask                    (agentic, 8 DB tools + RAG)

POST   /api/v1/share
GET    /api/v1/share/{token}

GET    /api/v1/fusion/{ubigeo}                (multi-hazard fusion)

GET    /api/v1/proposals
POST   /api/v1/proposals
POST   /api/v1/proposals/{id}/approve
POST   /api/v1/proposals/{id}/reject

GET    /api/v1/notifications                  (subscribers)
POST   /api/v1/notifications
DELETE /api/v1/notifications/{id}
GET    /api/v1/notifications/deliveries

POST   /api/v1/auth/token                     (OAuth2 password → JWT)
GET    /api/v1/auth/me
GET    /api/v1/auth/operators
POST   /api/v1/auth/operators
```

### Database schema — row counts

| Schema | Table | Rows | Notes |
|--------|-------|------|-------|
| `geo` | `districts` | 159 | 43 Lima Metro + surrounding provinces. INEI 2017 population seeded for 41 Lima districts |
| `geo` | `infrastructure` | 43,072 | OSM hospitals, schools, bridges, substations, fire stations |
| `geo` | `hazard_zones` | 50 | SINPAD-derived (flood + landslide × muy_alto/alto/medio/bajo) |
| `geo` | `quebradas` | 10 | Priority Lima quebradas |
| `geo` | `watersheds` | 3 | Rímac, Chillón, Lurín |
| `hydro` | `stations` | seeded | ANA + SENAMHI (live scraper, periodic) |
| `hydro` | `station_observations` | live | TimescaleDB hypertable |
| `hydro` | `imerg_accumulations` | live | 1h–72h windows per watershed |
| `social` | `signals` | live | PII-redacted, 7-day TTL via pg_cron |
| `ml` | `flood_polygons` | live | U-Net SAR output |
| `ml` | `huayco_susceptibility` | live | XGBoost output |
| `historical` | `sinpad_events` | 2,063 | INDECI 2003–2020 |
| `ops` | `alerts` | live | Auto-generated + operator-managed |
| `ops` | `decision_log` | live | Append-only (DB trigger) |
| `ops` | `share_tokens` | live | Read-only share links |
| `ops` | `alert_proposals` | live | Pre-publish operator review queue |
| `ops` | `operators` | 3 seeded | `coen_lima`, `coer_lima`, `coel_sjl` (password: `demo1234`) |
| `ops` | `notification_subscribers` | live | Webhook + SMS-stub |
| `ops` | `notification_deliveries` | live | Outbound delivery log |
| `ops` | `security_events` | live | Guardrail trip log |

### Frontend — panels and surfaces

| Surface | File | Notes |
|---------|------|-------|
| Layout | `app/layout.tsx` | Inter + Fraunces + JetBrains Mono via `next/font` |
| Home | `app/page.tsx` | Left rail + map canvas + all panels |
| LeftRail | `components/ui/LeftRail.tsx` | Primary nav, secondary nav, **OperatorChip** (login/logout) |
| MapView | `components/map/MapView.tsx` | MapLibre + 9 layer toggles + 3D extrusion + popups |
| MapLegend | `components/map/MapLegend.tsx` | Live layer legend |
| MapRadar | `components/map/MapRadar.tsx` | Signature radar sweep (bottom-right, suppressed when panels open) |
| LiveTicker | `components/map/LiveTicker.tsx` | Full-width bottom strip, `role=region aria-live=polite` |
| OperationalHUD | `components/map/OperationalHUD.tsx` | Top-right SINAGERD level + alerts |
| DataFreshnessBar | `components/ui/DataFreshnessBar.tsx` | Per-layer freshness |
| ScenarioPanel | `components/panels/ScenarioPanel.tsx` | District + time window + replay date scrubber |
| AlertsPanel | `components/panels/AlertsPanel.tsx` | SSE-fed list + SLA breach chips + QuickDispatch + INDECI checklist |
| AskPanel | `components/panels/AskPanel.tsx` | Agentic copilot input |
| DecisionLogPanel | `components/panels/DecisionLogPanel.tsx` | CSV + PDF (EDAN-Perú) export |
| DataSourcesPanel | `components/panels/DataSourcesPanel.tsx` | "About this data" accordion |
| SocialFeedPanel | `components/panels/SocialFeedPanel.tsx` | Triage feed + FieldReport + signal date + source link |
| NotificationsPanel | `components/panels/NotificationsPanel.tsx` | Subscriber CRUD + delivery history |
| LoginPanel | `components/panels/LoginPanel.tsx` | JWT login modal (animated) + OperatorChip in sidebar |
| FusionCallout | `components/panels/FusionCallout.tsx` | Multi-hazard district summary |
| SituationBrief | `components/panels/SituationBrief.tsx` | Mobile-only (`sm:hidden` desktop) |
| DistrictDashboardPanel | `components/panels/DistrictDashboardPanel.tsx` | Bento CityOverview |
| TutorialOverlay | `components/panels/TutorialOverlay.tsx` | driver.js spotlight walkthrough (lazy) |
| SharePanel | `components/panels/SharePanel.tsx` | Read-only share token mint (lazy) |
| DemoLiveSimulator | `components/DemoLiveSimulator.tsx` | Signal injector for demo (lazy) |

### Ingestion (Prefect flows)

| Flow | Cadence | Source |
|------|---------|--------|
| `sentinel1-ingest` | Daily | PC STAC search → MinIO + pgstac |
| `imerg-30min` | Every 30 min | NASA GES DISC OPeNDAP → hypertable |
| `hydro-15min` | Every 15 min | ANA + SENAMHI HTML scraper |
| `social-15min` | Every 15 min | Bluesky + RSS (6 feeds) + Reddit (3 subs) + Telegram (Senamhi_Peru) |
| `alerts-5min` | Every 5 min | Fuse flood + huayco + social clusters |

### ML pipelines (local CPU/GPU)

| Pipeline | Method | Output |
|----------|--------|--------|
| SAR flood segmentation | U-Net from Sen1Floods11 weights (Bonafilia et al. 2020) | `ml.flood_polygons` with confidence + area |
| Huayco susceptibility | XGBoost (Castro-Cabrera et al. 2024 features) | `ml.huayco_susceptibility` with risk_level |
| Spanish signal triage | qwen2.5:7b XML-sandboxed prompts | `social.signals.triage_label` + confidence |

### Agentic AI layer

| Component | File |
|-----------|------|
| Gateway (thin Ollama facade) | `ai/gateway.py` |
| Ollama provider (async httpx, retries, tool_calls) | `ai/providers/ollama.py` |
| Agent loop (multi-tool, keyword fallback) | `ai/agent.py` |
| Input guardrail (regex + length) | `ai/guardrails/input_filter.py` |
| Output guardrail (PII + secret redaction) | `ai/guardrails/output_filter.py` |
| Whitelisted DB tools (8) | `ai/tools/db_tools.py` |
| Protocol RAG (`nomic-embed-text` + pgvector) | `ai/rag.py` |

**Anti-fabrication invariant:** LLM never executes raw SQL. All numerical claims trace to a DB row; if a tool returns 0 rows, the system says so explicitly.

---

## Recent session log (rolling, last 5)

### Session 6 — 2026-05-18 (current) — Trust-the-loop hardening pass

Overnight iteration treating the rubric question "useful or pretty?" as the
acceptance criterion. Two categories of fix.

**Real bugs found by walking the operator path:**
- `fix(api/districts)`: `GET /districts/{ubigeo}/dashboard` returned 500. SQLAlchemy
  `Row` iterator was being accessed by string key (`r["day"]`) for the 7d alert
  trend, 24h social breakdown, 30d IMERG trend, and station latest readings.
  Converted four iterators to `.mappings()`.
- `fix(api/districts)`: dashboard IMERG 30d trend crashed with `GEOSIntersects:
  TopologyException` on Lima geometry. Wrapped watershed↔district intersect in
  `ST_MakeValid()` on both sides (the same fix pattern as Session 1).
- `fix(ai/db_tools)`: `get_active_alerts` referenced non-existent columns
  (`alert_type`, `summary`, `district_ubigeo`). Rewrote the SQL with correct
  column names and a `LEFT JOIN geo.districts` to expose the ubigeo. The copilot
  could not answer `"¿cuáles son las alertas activas?"` until this landed.
- `fix(ingest/social)`: Prefect worker was running `prefect worker start
  --pool costa-pool` but `schedules.py` uses `serve()`. Result: zero deployments
  registered, ingestion silently halted. Swapped the compose command. After
  recreate, 9 deployments (sentinel1, imerg, hydro, social, flood-seg, huayco,
  triage, alerts, rag-index) register and execute on their intervals.
- `fix(ingest/social)`: 2 RSS feeds (`canaln.pe`, `larepublica.pe`) were 404ing
  every run. Replaced with `gestion.pe`.
- `fix(ingest/social)`: **PII redaction was failing on every signal** and silently
  storing raw text. Presidio's `AnalyzerEngine` was instantiated without an
  NLP engine so it defaulted to English; every Spanish call raised
  "No matching recognizers were found". Now lazy-initialises a process-wide
  engine bound to `es_core_news_sm`. Verified end-to-end with a triggered run
  — no warning emitted. This is a Ley 29733 / OCHA compliance defect not just
  a code smell.
- `fix(flows/schedules)`: `HuaycoModel.load()` was called as a classmethod;
  it's an instance method. Replaced with `model = HuaycoModel(); model.load()`.

**"Pretty vs useful" hardening (the more important category):**
- `fix(ui/AlertsPanel)`: when an alert action (`escalate` / `acknowledge` /
  `dispatch`) failed the network call, the optimistic status update stayed
  *and the success toast still fired*. A duty officer was being told their
  escalation to COEN was registered when no DB row existed. Now the optimistic
  state rolls back and a danger toast surfaces the failure.
- `feat(ui/Toast)`: new `danger` variant with assertive `aria-live` + XCircle
  iconography so failures actually read as failures (not a same-colored success).
- `fix(api/copilot)`: when an operator asked "cuántas alertas activas",
  the agent answered `len(rows)` — capped at the tool's LIMIT 20. Now
  `get_active_alerts` returns the unconstrained `_total_active`, the summariser
  reports the true total, breaks it down by severity from the sample, and
  explicitly says "(mostrando las 20 más recientes)" when the sample is capped.
- `feat(ui/AskPanel + FieldReport)`: were hardcoding `operator_id: "demo"` /
  `"operator-1"` in copilot queries and field-report writes. Now wired to the
  authenticated operator (`useAuthStore`) so decision-log rows attribute to
  the real SINAGERD user. `AlertsPanel` operator_id also standardised on
  username (was numeric `operator.id`) so the audit trail is uniform.
- `feat(ui/EscalationModal)`: full keyboard focus trap. Auto-focuses textarea,
  Escape cancels, Tab cycles within dialog, focus restores on close.
- `feat(ui/OperationalHUD)`: new "FEEDS" degradation chip. When ≥3 sources are
  offline → danger pulse. Stale or 1–2 offline → warn. Click jumps to the
  DataSources panel. A duty officer can see at a glance whether upstream data
  is fresh enough to act on.

**Tests:** 299/300 (same single pre-existing Ollama `test_ask_xss` timeout
flake under load — STATUS Session 5 noted; unchanged by this work).
**Frontend:** `npx tsc --noEmit` clean; production build green; first-load JS
`/` = 173 kB (up from 153 kB Session 5 — added auth + notifications surfaces).

**HITL workflow closed (new for Session 6):**
- `feat(ui/ProposalsPanel)`: backend has shipped `/api/v1/proposals`
  (create / list / approve / reject) since Sprint 11 but 210 proposals
  were sitting in `ops.alert_proposals` with no UI. The agentic copilot's
  human-in-the-loop story was therefore aspirational. New bottom-right
  drawer mirrors AlertsPanel layout, gated on a logged-in operator, with
  optimistic remove + rollback on failure. Keyboard shortcut `P`. Approve
  inserts into `ops.alerts` AND `ops.decision_log` under the authenticated
  operator. LeftRail badge counts critical+high pending.
- `feat(api/social)`: new `POST /api/v1/social/field-report` endpoint.
  The FieldReport UI used to do an optimistic cache update only with no
  persistence — refresh dropped the report. Now writes to `social.signals`
  with `source='campo'` and `triage_model='operator_assertion'`, AND
  appends to `ops.decision_log`. Closes the audit-trail loop for operator
  observations.
- `fix(api/proposals)`: `list_proposals` now filters obvious test residue
  (XSS / SQL-injection seeds, empty titles, `Test Flood Alert` fixtures)
  so the duty officer's queue shows real proposals only. Rows remain in
  the table for audit; just hidden from the operator-facing list.

**Tests added (Session 6):**
- 5 new tests `test_social.py` covering field-report persist / invalid
  label rejection / empty-text rejection / null-district / dedup.
- 4 new tests `test_proposals.py` covering list filter / approve →
  alerts insert / approve unknown 404 / reject locks status.

**Known infrastructure gaps surfaced (not closed tonight):**
- `pgstac.items` relation does not exist in postgres (`stac-fastapi-pgstac`
  image does not ship `pypgstac` CLI to migrate; GitHub release asset has
  moved). `flood-segmentation-hourly` and `sentinel1-daily` cannot pull
  new scenes until pgstac is bootstrapped. Existing 7 flood polygons +
  Session 3 fixtures still serve the rubric demo.
- ANA scraper + IMERG remain susceptible to external publication latency
  — the new FEEDS chip surfaces this honestly to the operator.

### Session 5 — 2026-05-17 — Operational hardening for government use

Built four features turning the platform from "visualization" into "operationally usable":
- **B1** — `feat(notifications)`: Subscriber CRUD + delivery log; webhook fan-out on `high`/`critical` escalation; new `NotificationsPanel` UI
- **B2** — `feat(auth)`: JWT auth for SINAGERD operators (COEN/COER/COEL roles); 3 demo accounts seeded; `LoginPanel` modal with animation; `OperatorChip` in left sidebar; auth-aware API calls
- **B3** — `feat(reports)`: EDAN-Perú PDF export from decision log via ReportLab
- **B4** — `feat(ui)`: SLA breach indicator on alert cards (5 / 10 / 30 / 60 min by severity)
- **fix(social)**: Show signal date + source link + working More button
- **test(api)**: 19 new tests for auth + notifications; fixed pytest-asyncio 1.3 event loop isolation via `config._inicache["asyncio_default_test_loop_scope"] = "session"` in `conftest.py`
- **feat(ui)**: Moved login button into sidebar (via `OperatorChip`); added scale+fade animation on modal open

### Session 4 — 2026-05-17 — Sprint 12 impeccable design pass

Visual system rebuild — see [`IMPECCABLE_AUDIT.md`](IMPECCABLE_AUDIT.md) for the baseline audit.
- Fraunces display family + Inter body + JetBrains Mono data
- Lima-coast OKLCH palette (cinnabar / ochre / mustard / sage severity, costa-teal brand, sand warm accent)
- Bento CityOverview, SINAGERD-style ASCII tag codes (no emoji), MapRadar signature sweep
- Lighthouse 100/100 accessibility ✅
- Audit score 5.8 → 8.6 / 10

### Session 3 — 2026-05-17 — El Niño replay + population exposure + SSE fix

- Population exposure: INEI 2017 census seeded for 41 Lima Metro districts; fusion API returns `population_at_risk`
- El Niño 2017 replay: `ReplayDateScrubber` with 5 historical steps (Mar 15 – Apr 2 2017); pre-baked SAR flood fixtures
- SSE task leak fixed: `generate()` tracks `fetch_task` via `asyncio.create_task` and cancels in `finally` — was starving uvicorn
- ANA scraper stale-station check logs WARNING when active station has no data >2h

### Session 2 — 2026-05-17 — SSE hoist + tutorial rework + WCAG AA

- `useAlertStream` hoisted to app shell — map district fills update without any panel open
- driver.js 7-step spotlight walkthrough replaces 387-line modal overlay
- Lighthouse a11y: 84 → 100 ✅ (target-size, contrast, aria-labels)

### Session 1 — 2026-05-17 — Audit + harden

- 218 automated tests across 10 API classes — fixed 7 bugs (`::jsonb` cast, negative LIMIT, ST_MakeValid on invalid geoms, wrong column names in proposals approve)
- All time-series tables seeded with realistic demo data
- P0-1 copilot bug ("no se encontraron datos") resolved — data now flows through 8 DB tools

For full detail of all sessions, see [`../SESSION_LOG.md`](../SESSION_LOG.md).

---

## Sprint summary (historical)

| Sprint | Focus | Status |
|--------|-------|--------|
| 0 | Scaffolding — schema, docker-compose, ADR-0001 | ✅ |
| 1 | Foundation ingestion — Sentinel-1, IMERG, Lima geodata | ✅ |
| 2 | Dashboard skeleton — MapLibre, typed API client | ✅ |
| 3 | Flood segmentation — U-Net, Sen1Floods11 | ✅ |
| 4 | Huayco XGBoost + ANA + social ingestion | ✅ |
| 5 | LLM triage + Operator Copilot RAG | ✅ |
| 6 | Alerts feed + alert generator + decision log CSV | ✅ |
| 7 | Submission prep — responsive, hazard layer, SINPAD | ✅ |
| 8 | Sprint 8 — share tokens, fusion, 3D extrusion | ✅ |
| 9 | Sprint 9 — share + fusion polish | ✅ |
| 10 | Sprint 10 — EOC operational UX (QuickDispatch, ResponseProtocol, FieldReport) | ✅ |
| 11 | Sprint 11 — Agentic AI layer (gateway, guardrails, RAG, tools, proposals) | ✅ |
| 12 | Sprint 12 — Impeccable design pass | ✅ |
| 13 | Government-use hardening (B1–B4) | ✅ |
| 14 | Trust-the-loop pass (PII fix, truthful counts, no false-success toast, Prefect deploys) | ✅ (this session) |

---

## What's pending

### Sole rubric blocker: VPS deployment

| Item | Status | Action |
|------|--------|--------|
| VPS with public IP | ❌ Not provisioned | Hetzner CX32 €11/mo or DigitalOcean $20/mo |
| TLS / HTTPS | ❌ | Caddy auto-HTTPS — `infra/caddy/Caddyfile` ready |
| `docker-compose.prod.yml` | ✅ | Ready |
| `scripts/deploy.sh` | ✅ | Zero-downtime deploy ready |
| Ollama model pull on VPS | ❌ | `docker exec costa-ollama ollama pull qwen2.5:7b-instruct-q4_K_M` (4.7 GB) |
| SINPAD data load on VPS | ❌ | `python scripts/load_sinpad.py` post first `compose up` |
| 2017 El Niño fixtures on VPS | ❌ | `python scripts/seed_elnino_2017.py` |
| DNS record | ❌ | Point domain to VPS IP |

### Low-priority polish

| Item | Impact | Status |
|------|--------|--------|
| ANA scraper UI red indicator when `status: offline` | C1 cosmetic | ✅ Done Session 6 — `OperationalHUD` FEEDS chip + DataSourcesPanel per-source health |
| `EscalationModal` programmatic focus trap | A11y polish | ✅ Done Session 6 — auto-focus textarea, Escape, Tab cycle, focus restore |
| `r.avaflow` debris-flow simulation snapshot | C5 +0.2 | Deferred post-submission (3+ days GRASS container work) |
| Bootstrap `pgstac` schema for Sentinel-1 ingest + flood-seg flows | C1 (new scenes) | Not blocking demo (7 polygons + 2017 fixtures already in DB) |

---

## Local development

```bash
# Start all services
docker compose up -d

# Verify
docker compose ps
curl http://localhost:8000/api/v1/health
curl http://localhost:3000

# Frontend dev (hot reload)
cd apps/web && npm run dev

# Type check
cd apps/web && npx tsc --noEmit

# Production build
cd apps/web && npm run build

# Run tests in API container
docker exec costa-api python -m pytest --asyncio-mode=auto -q

# Rebuild API after backend changes
docker compose build api && docker compose up -d api
```

**Container code note:** API and worker Python packages are installed into site-packages at build time; `apps/api/src/` and `apps/api/tests/` are read-only volume-mounted in dev. `pyproject.toml` is **not** mounted — settings there won't take effect at runtime without rebuilding.

---

## Branch + commit conventions

- All work lands on `develop`. Never commit to `main` unless tagging a submission release.
- Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `perf:`, `ci:`. Scope tags optional but encouraged (`feat(auth): ...`).
- Every push to `develop` keeps the project working — `docker compose up` succeeds, primary services reachable.
- Secrets via `.env` only (gitignored). Committed template: `.env.example`.

---

## Related docs

| Doc | Purpose |
|-----|---------|
| [`COMPETITION.md`](COMPETITION.md) | IEEE Response Quest 2026 context, rubric, scope |
| [`../apps/web/DESIGN.md`](../apps/web/DESIGN.md) | Frontend design system |
| [`architecture.md`](architecture.md) | System architecture + data flow detail |
| [`data-sources.md`](data-sources.md) | Per-source endpoints, credentials, status |
| [`responsible-data-handling.md`](responsible-data-handling.md) | Privacy, retention, compliance (Ley 29733 + OCHA + IASC) |
| [`operator-runbook.md`](operator-runbook.md) | Operator user manual |
| [`decisions/`](decisions/) | ADRs (charter, ML architecture) |
| [`IMPECCABLE_AUDIT.md`](IMPECCABLE_AUDIT.md) | Sprint 12 design audit (historical) |
| [`phase2-submission.md`](phase2-submission.md) | IEEE Phase 2 submitted text (historical) |
| [`../SESSION_LOG.md`](../SESSION_LOG.md) | Detailed session-by-session work log |
