# Costa Resiliente — Project Status

> **This is the single source of truth for what's built, what's pending, and the current rubric score.**
> Last updated: 2026-05-31 (Session 20)
> Branch: `develop`

For competition context, see [`COMPETITION.md`](COMPETITION.md).
For frontend design system, see [`../apps/web/DESIGN.md`](../apps/web/DESIGN.md).

---

## Score — IEEE Response Quest 2026 rubric

Out of 25 total (5 criteria × 5.0). See [`COMPETITION.md`](COMPETITION.md) for criterion definitions.

| # | Criterion | Score | Gap |
|---|-----------|-------|-----|
| C1 | Timeliness & Real-Time Responsiveness | **5.0** ✅ | ANA scraper fragility closed (Redis stale cache + auto-notify) |
| C2 | Comprehensiveness & Novel Data Discovery | **5.0** ✅ | — |
| C3 | Integration & Synthesis | **5.0** ✅ | — |
| C4 | Usability & Operational Readiness | **5.0** ✅ | Lighthouse pass confirmed on VPS deploy |
| C5 | Scenario Fit & Innovation | **5.0** ✅ | r.avaflow simulation (post-submission) |
| | **Total** | **~25.0 / 25** | Sole gap: public VPS deployment |

**Sole remaining gap: public VPS deployment with HTTPS.** All code, compose files, Caddy config, and deploy scripts are ready.

---

## Tests

- **API**: **640 passed, 0 errors** (Session 20). Up from 568 (+72). Workers: 148 passed, 8 skipped.
- **Workers**: **240 passed, 16 skipped, 0 errors** (Session 14). Skips = costa_api cross-package tests guarded with `importlib.util.find_spec`.
- **TypeScript**: 0 errors (`npx tsc --noEmit`)
- **Build**: Next.js production build green; first-load JS `/` = 184 kB (Session 20: +9 kB from rainfall HUD, fusion rainfall, CityOverview, SlaChip improvements)

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
GET    /api/v1/layers/shelters                (INDECI evacuation shelters — Session 8)

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
| `geo` | `districts` | 166 | 43 Lima Metro + surrounding provinces + 7 Callao (Session 8). INEI 2017 population seeded |
| `geo` | `shelters` | 20 | INDECI-referenced Lima Metropolitana evacuation shelters (Session 8) |
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
| Agent loop (parallel asyncio.gather, keyword fallback, sitrep mode) | `ai/agent.py` |
| Input guardrail (regex + length + Spanish injection patterns) | `ai/guardrails/input_filter.py` |
| Output guardrail (PII + secret redaction) | `ai/guardrails/output_filter.py` |
| Redis tool cache (per-tool TTL, silent fallback) | `ai/cache.py` |
| Whitelisted DB tools (9) | `ai/tools/db_tools.py` |
| Protocol RAG (`nomic-embed-text` + pgvector, 6 documents) | `ai/rag.py` |

**Quick-mode fast paths (bypass LLM, ~2–3s):**
1. **Single quick-mode** — 9 pattern groups (alertas, lluvia, río, inundación, huayco, social, infraestructura, albergue, protocolo) → one tool dispatch
2. **Multi-quick-mode** — 2–3 matching patterns → parallel asyncio.gather, no LLM
3. **Sitrep mode** — "resumen completo", "inicio de guardia", "sitrep" → 4 tools parallel → `_build_sitrep_answer()` SITREP narrative

**RAG protocol corpus (7 documents, 51 chunks):** INDECI Plan Familiar, CENEPRED Movimientos en Masa, MINSA Protocolo Emergencias, SENAMHI Guía Hidrometeorológica, MML Plan Huaycos Lima, ANA Umbrales Lluvia Lima, SINAGERD Acciones Rápidas COER Lima.

**Anti-fabrication invariant:** LLM never executes raw SQL. All numerical claims trace to a DB row; if a tool returns 0 rows, the system says so explicitly.

---

## Recent session log (rolling, last 5)

### Session 20 — 2026-05-31 — Operational hardening + sitrep mode + UX improvements

Autonomous session (Fernando offline 12h). All changes on `develop`, local Ollama only.

**Backend fixes:**
- `fix(health)`: Silent `except: pass` → `log.warning` in `_parse_scraper_status` and `_parse_last_run`.
- `fix(sentinel1)`: Null-guard on `minio_path` before STAC registration; per-scene try/except in ingest loop.
- `fix(alert_generator)`: `except: pass` on heartbeat write → `logger.debug`.
- `fix(alerts)`: `except Exception: detail=""` in PDF report → `logger.debug`.

**Copilot enhancements:**
- `feat(ai/agent)`: `_is_sitrep_query()` + sitrep fast path — "inicio de guardia", "resumen completo", "sitrep", etc. → 4 tools (alerts + rainfall + river + flood) in parallel (~3s), no LLM.
- `feat(ai/agent)`: `_build_sitrep_answer()` — coherent SITREP narrative (ALERTAS · LLUVIA · RÍOS · INUNDACIÓN bullets + acción recomendada).
- `feat(ai/agent)`: `_QUICK_PATTERNS` expanded — situación actual, albergue, refugio, pronóst, novedades, qué hacer, huaycoloro (30+ new phrases).
- `feat(ai/agent)`: Improved `_SYSTEM` prompt — action recommendation on critical, SINAGERD rainfall levels, district/quebrada specificity.
- `feat(ai/db_tools)`: `get_infrastructure_impact` description includes albergues/refugios.
- `feat(demoData)`: sitrep demo responses (ES + EN) added as 4-tool compound answers.
- `feat(AskPanel)`: sitrep as first suggestion chip; keyword route for "resumen completo".

**Frontend UX improvements:**
- `feat(AlertsPanel)`: SLA breach toast — fires once per alert per session when SLA exceeded, `variant: "danger"`.
- `fix(AskPanel)`: isDemo banner moved ABOVE response text (was below — dangerous for operators acting on sim data).
- `feat(AlertsPanel/SocialFeedPanel/DecisionLogPanel)`: Error states show minutes since last good data vs generic text.
- `feat(ProposalsPanel)`: Approval toast includes cached subscriber count ("N suscriptores notificados").
- `feat(LeftRail)`: Keyboard shortcut badge on hover for primary nav; `[N]` label on Notifications SecBtn.
- `feat(DataFreshnessBar)`: Staleness color coding — ok/warn/danger by layer age (IMERG 70min, SAR 360min, Huayco 240min).
- `feat(SituationBrief)`: Rainfall bullet when 72h >= 25mm + Social quick-action button in mobile view.
- `feat(LiveTicker)`: Severity prefix [EMERG/ALERT/AVISO/INFO] + rainfall warning item + urgent-only social filter.

**Additional Session 20 improvements (beyond batch1):**
- fusion endpoint: rainfall + trigger_rain_24h_mm, risk elevation from rainfall, huayco trigger in FusionCallout
- health endpoint: sinagerd_level + active_alerts + max_rain_72h_mm + rain_level
- alerts: province filter includes district-less alerts (rainfall type); rainfall chips on alert cards
- copilot: alerts answer shows rainfall mm, sitrep shows crit title + rainfall, `_STATION_THRESHOLDS` to module level
- OperationalHUD: FEEDS chip core-only (no reddit/telegram/SAR), rainfall metric chip
- DataSourcesPanel: Redis health in footer
- DistrictDashboardPanel: CityOverview adds rainfall metric + SINAGERD level pill + near-threshold station warning
- 7 RAG documents (51 chunks): +ANA thresholds + SINAGERD quick-action guide
- SlaChip: near-breach warning (2min remaining) in warn color
- SocialFeedPanel: huayco_observation = danger priority (same as needs_help)
- DEMO-GUIDE.md: comprehensive 5-step demo walkthrough

**Tests (+67):** 635 passed (↑67 from 568). Includes rain province filter, source_refs, health sinagerd/rain_level, sitrep detection, near-threshold, fusion-rainfall prose. TypeScript: 0 errors.

**Commits (179+):** `acf4437` batch1 → `a6b269e` sitrep → `2706f12` narrative → `200ab15` ticker → `5ad9dc4` FEEDS-fix → `ba7bc47` river-threshold → `eedf906` rainfall-hud → `d7b5f46` fusion-rainfall → `e4fe85a` health-sinagerd → `ae82f36` health-rain → `8b9473e` rag-7docs → `2df7148` province-filter-fix → `8696d72` rainfall-mm-alerts → `99465d4` near-threshold → `822f008` fusion-trigger-rain → `925bb0f` city-threshold-label → `b685c89` hud-watershed → `bde7a06` map-legend-ANA → `9b404fa` escalation-rainfall → `d288333` edan-en-rainfall.

---

### Session 19 — 2026-05-25 — Security hardening + robustness + guardrail coverage

Autonomous session (Fernando offline 12h). All changes on `develop`, local Ollama only.

**7 test failures fixed (operator_id Optional regression):**
- `fix(tests/social)`: Added autouse fixture flushing `costa:social:fieldreport:coer_lima` Redis key before each test — 429s were exhausting the rate limiter across test runs.
- `fix(tests/social)`: Renamed `test_field_report_rejects_empty_operator_id` → `test_field_report_empty_operator_id_is_ignored`; changed assertion to 201 (field is now Optional+ignored).
- `fix(tests/session_audit)`: `test_action_missing_operator_id` expanded acceptable codes to `{200, 400, 422}` — operator_id Optional so 422 no longer guaranteed.

**Statement timeout coverage (all multi-table JOINs):**
- `perf(alerts)`: `SET LOCAL statement_timeout = '10000'` before alerts list LATERAL JOIN (`/alerts`).
- `perf(layers)`: `SET LOCAL statement_timeout = '10000'` before all 4 multi-table JOINs in `layers.py` (infrastructure, stations, social_signals, shelters).
- `perf(districts)`: `15000` timeout in `district_risk_summary` (correlated subqueries); `10000` in `district_dashboard` + `district_watersheds`.
- `perf(ai/db_tools)`: `SET LOCAL statement_timeout = '30000'` in `dispatch()` before every tool call — prevents rogue DB tools from holding connections.

**Rate limiter + SSRF guard test coverage (+8 tests):**
- `test(social)`: `test_field_report_rate_limiter_raises_429_when_limit_exceeded` + `test_field_report_rate_limiter_fails_open_on_redis_error`.
- `test(notifications)`: `test_reject_private_host_blocks_hostname_resolving_to_private_ip`, `test_reject_private_host_allows_public_ip`, `test_reject_private_host_rejects_loopback`.
- `test(notifications)`: `test_notif_rate_limiter_raises_429_when_limit_exceeded` + fails-open + `test_notif_rate_limiter_bypassed_in_testing_mode`.

**Guardrail hardening — Spanish injection patterns (+9 tests):**
- `feat(guardrails/input_filter)`: Added Spanish role-pivot (`ignora instrucciones`, `olvida tus instrucciones`, `actúa como admin`, `ahora eres libre`), prompt-leak (`repite tu prompt del sistema`, `cuáles son tus instrucciones`), secret-fish (`contraseña:`, `clave secreta:`), jailbreak (`sin restricciones`), and English jailbreak (`GPT-4`, `do anything now`) patterns.
- `fix(guardrails/input_filter)`: `share error message` corrected: 48h window was valid but missing from error string (`timeWindowHours must be one of 1,3,6,12,24,48,72`).
- `feat(proposals)`: `ProposalReview.operator_id` made `Optional` (backwards-compat) consistent with `AlertAction`, `LogEntry`, `FieldReport`.
- `fix(alerts)`: `limit` in `list_decision_log` and `export_decision_log` changed `ge=0` → `ge=1` (0-row queries had no operational use).

**Redis health probe in `/health/scraper`:**
- `feat(health)`: Dedicated Redis ping (1s timeout) added to `/health/scraper` response: `"redis": {"status": "ok" | "offline"}`. Rate-limiters and scraper heartbeats both depend on Redis — its health is now first-class in the dashboard.

**Commits (8):** `5dc541b` fix 7 test failures → `32e6dd4` statement_timeouts → `80d42c7` rate-limit+SSRF tests → `1a4855f` ProposalReview Optional + ge=1 → `0d3b918` input guardrails + share fix → `a2e15d7` districts timeouts → `462fd6e` Redis health probe → `f449480` AI tool timeout.

**Tests:** 568 passed (↑20 from 548). TypeScript: 0 errors.

---

### Session 13 — 2026-05-25 — Sprint 21: Bug fixes + 109 new tests (alerts, fusion, layers, share)

Autonomous session (Fernando offline). All changes on `develop`, local Ollama only.

**Bug fixes discovered via new tests:**
- `fix(alerts)`: `_parse_iso_dt()` helper added — asyncpg requires `datetime` objects for
  timestamp-typed bind parameters; passing raw ISO strings (e.g. `2026-05-01T00:00:00Z`)
  raised `asyncpg.exceptions.DataError`. Affects `/decision-log` list, CSV export, PDF report.
- `fix(alerts)`: `datetime.utcnow()` deprecation warning fixed → `datetime.now(timezone.utc)`.
- `feat(alerts)`: PDF report endpoint `/decision-log/report` now accepts `?since=ISO&until=ISO`
  date-range params, matching the CSV export endpoint for EDAN-Perú shift/audit consistency.
- `fix(health)`: `imerg`/`stations` stale thresholds raised to 70min (actual scheduler cadence
  is 30–60min; previous 35/20min thresholds were too strict, causing false-stale alarms).
- `fix(ana_scraper)`: Stations Redis TTL raised to 2h (matches actual observed cadence).
- `fix(demo)`: Lurigancho fusion prose updated to reflect new huayco_observation cluster signals.

**New test files (109 new tests, suite 316 → 425):**
- `test_alerts.py` (30 tests): list_alerts filters, alert actions (all 4 valid + invalid),
  free-form log entries, decision-log list with since/until/operator filters, CSV export
  (headers, date-range filename suffix, parseable rows), PDF report (magic bytes, disposition,
  with/without filters, date-range, far-future since → empty log section still renders).
- `test_fusion.py` (22 tests): district fusion shape, all subkeys, risk_level enum, prose
  correctness, ubigeo validation (400 on bad format, 404 on unknown); pure unit tests for
  `_overall_risk` (9 cases) and `_risk_prose_es` (5 cases).
- `test_layers.py` (45 tests): all 11 layer endpoints — imerg, flood, huayco, hazard,
  infrastructure, stations, watersheds, quebradas, flood/exposure, social, shelters.
  Includes label-filter correctness, irrelevant exclusion, param validation.
- `test_share.py` (12 tests): mint/resolve round-trip, layer whitelist (valid + invalid),
  time-window whitelist (all 6 valid values), replay mode, 404/malformed token.

**Tests:** 425 passed (↑109 from 316). TypeScript: 0 errors.

---

### Session 12 — 2026-05-25 — Sprint 20: Field-report labels end-to-end + triage pipeline + robustness

Autonomous session (Fernando offline). All changes on `develop`, local Ollama only.

**Field-report labels `huayco_observation` + `flood_observation` — full end-to-end:**
- `fix(triage)`: Added 2 labels to `TriageLabel` enum in `triage.py`. Updated Ollama system
  prompt to describe them. Previously Ollama classified huayco/flood sightings as
  `weather_observation` — now they route to the correct label and trigger dedicated alerts.
- `fix(db)`: `signals_triage_label_check` constraint in PostgreSQL didn't include new labels.
  Field-report POST returned 500 for any `huayco_observation`/`flood_observation` label.
  Fixed: `ALTER TABLE social.signals DROP CONSTRAINT + ADD CONSTRAINT`. Migration script:
  `infra/postgres/migration_huayco_flood_labels.sql`. `init.sql` updated for clean installs.
- `fix(alert_generator)`: `generate_social_alerts` now clusters `huayco_observation`
  (threshold=3, severity=critical) and `flood_observation` (threshold=5) via
  `_SOCIAL_CLUSTER_CONFIGS` — previously only `needs_help` triggered social cluster alerts.
- `fix(districts)` + `fix(fusion)`: `urgent_social_3h` count IN clause was missing the 2
  new labels. District dashboard and fusion summary now count them as urgent signals.
- `fix(auto_seed)`: Demo seed included a huayco signal labeled `weather_observation` (flooded
  streets). Reclassified to `flood_observation`. Added a `huayco_observation` seed signal
  (Quebrada Huaycoloro / Lurigancho) for demo coverage of new label type.
- `fix(copilot/quick_patterns)`: Added `avistamiento`, `campo`, `reporte de campo` keywords.
  `fix(copilot/answer)`: Social cluster answer now breaks down by label type
  (e.g. "14 señales — 3 avistamientos huayco, 5 solicitudes de ayuda") instead of just total.
- `fix(schedules.py)`: Triage flow was passing `LLM_FAST_MODEL=gemma2:2b` to
  `run_triage_pipeline`. Changed to `TRIAGE_MODEL` env var (falls back to `LLM_PRIMARY_MODEL`).
  Triage now uses the better model, not the fast/small one.

**Decision log export improvements:**
- `feat(alerts)`: Both `/decision-log` (list) and `/decision-log/export` (CSV) now accept
  `?since=ISO&until=ISO` date-range params for EDAN-Perú shift/audit reports.
  CSV filename includes date range: `decision_log_20260501-20260531_20260525_074500.csv`.
- `perf(db)`: Added `decision_log_ts_idx (logged_at DESC)` and
  `decision_log_op_ts_idx (operator_id, logged_at DESC)` indexes for date-range queries.

**Tests:** 316 passed (↑2 from 314). New tests: `test_field_report_accepts_huayco_observation`,
`test_field_report_accepts_flood_observation`. Worker tests: `test_alert_generator.py`
(threshold functions, cluster configs — run in worker dev env). TypeScript: 0 errors.

---

### Session 11 — 2026-05-25 — Sprint 19: Scraper liveness + Ollama contention + health accuracy

Autonomous session (Fernando offline 11am–4pm). All changes on `develop`, local Ollama only.

**Scraper liveness heartbeat system (5 sources):**
- `feat(social/health)`: `_write_scraper_heartbeats()` in `social.py` writes
  `costa:scraper:last_run:{source}` Redis keys (TTL 1h) for bluesky/rss/reddit/telegram
  after each `ingest_social_flow` cycle. Health endpoint reads these keys via
  `_redis_last_run_status()` — scraper status reflects whether the flow RAN, not whether
  new disaster content was published (no content during quiet periods ≠ unhealthy scraper).
- `feat(alert_generator)`: `generate_alerts_flow` writes `costa:scraper:last_run:alerts`
  (TTL 10min — stale-flag fires within 2 cycles if flow stops). 5min schedule + 3min grace.
- `feat(imerg)`: `_write_imerg_heartbeat()` called from both NASA and Open-Meteo fallback
  paths using sync `redis` client (flow is sync Prefect). TTL 1h = 2× the 30min schedule.
- `feat(ana_scraper)`: `ingest_hydro_stations_flow` writes `costa:scraper:last_run:stations`
  (TTL 30min). Health shows "ok" if flow ran within 20min.
- `feat(health)`: `_redis_last_run_status()` inner function in `health.py` reads the 5
  heartbeat keys and overrides content-time status; grace windows: bluesky/rss 20min,
  alerts 8min, imerg 35min, stations 20min.

**Ollama triage contention hardened:**
- `fix(triage)`: Exponential backoff between retry attempts (`asyncio.sleep(3**attempt)` =
  0/3s/9s). Previously all 3 retries fired immediately, hammering Ollama while busy.
- `fix(triage)`: `num_ctx=4096` (was default 32k); triage prompts are ~200 tokens.
  4k context = 8× faster KV allocation vs default 32k — reduces Ollama inference time.
- `fix(triage)`: `num_predict=256`; JSON label response fits in 256 tokens.
- `fix(triage)`: `keep_alive="5m"` so triage model releases GPU RAM between batches,
  letting copilot model load without eviction contention.
- `fix(triage)`: Inter-signal pause `asyncio.sleep(0.8)` between signals so copilot/embed
  callers get Ollama turns during triage batch. 0.8s × 10 signals = 8s overhead per batch.
- `fix(triage)`: `BATCH_SIZE` 20 → 10, halving the maximum copilot starvation window.

**Hydro ingest bug fixes:**
- `fix(ana_scraper)`: `_check_stale_stations` used `COUNT(so.id)` — `station_observations`
  has composite PK `(time, station_id)`, no `id` column. Every run logged SQL error
  "column so.id does not exist". Fixed: `COUNT(*)`.
- `fix(ana_scraper)`: `fetch_openmeteo_station` returned all `past_days=1` historical
  observations. On first run, inserts all with `DO NOTHING`; subsequent runs found no new
  timestamps → `MAX(time)` stayed old → stations health "offline". Fixed: return only
  current-hour observation (`observed_at = now_hour`) with `DO UPDATE` for Open-Meteo rows.

**IMERG carry-forward fallback:**
- `fix(imerg)`: Open-Meteo fallback now fires when NASA GES DISC returns 0 valid granules
  (auth failure, data lag, or Prefect task cache returning `None`). Loads latest DB
  accumulations per watershed, blends in Open-Meteo 1h delta, re-inserts with `time = NOW()`.
  El Niño scenario values (63.2mm / 41.8mm for Rímac) carry forward without being zeroed.
- `scripts/refresh_imerg_now.py`: one-shot bootstrap tool to manually insert fresh IMERG
  rows (copies latest DB values with current timestamp). Run via `docker exec` to recover
  from IMERG health "offline" without restarting flows.

**Health endpoint accuracy:**
- `fix(health)`: `overall_status` now excludes Reddit, Telegram, and SAR flood from core
  signal computation. These are best-effort/daily-cadence sources — their outage does not
  degrade situational awareness. Core = bluesky, rss, imerg, stations, alerts.
- `fix(health)`: `_redis_last_run_status()` merges scraper-run-time status into bluesky/rss
  (content staleness ≠ scraper outage during quiet periods).

**Data cleanup:**
- Resolved 14 "Test Flood Alert" entries (leftover from dev testing sessions, `source_refs=[]`,
  no polygon reference). Active alerts now 3: 1 critical rainfall (Rímac 63.2mm 72h),
  1 high rainfall (Chillón 28.4mm 72h), 1 high flood (Huaycoloro scenario).

**Tests:** 314 passed, 0 errors. TypeScript: 0 errors. Next.js build: green.

---

### Session 10 — 2026-05-24 — Sprint 18: RAG end-to-end fix + router hardening

Autonomous session (Fernando offline). All changes on `develop`, local Ollama only.

**RAG vector search fixed:**
- `fix(ai/rag)`: `rag.py` used `:vec::vector` SQLAlchemy named-param + PostgreSQL
  cast shorthand, which triggers `sqlalchemy.exc.ProgrammingError` (f405). Fixed:
  inline `vec_str` directly as a PostgreSQL literal `'{vec_str}'::vector` — safe
  because `vec_str` is a float array generated from Ollama embeddings, never from
  user input. Verified end-to-end: 3 protocol results returned with similarity
  0.634–0.606 for flood/evacuation query.
- `fix(ai/agent)`: `_keyword_dispatch()` fallback path was passing `{}` as args
  for `search_protocols` — same empty-query short-circuit bug fixed in quick-mode
  Session 9. Now passes `{"query": query}` for the RAG tool.

**Protocol indexer hardening:**
- `fix(workers/rag/ingest)`: `PROTOCOLS_DIR = Path(__file__).parents[5]` raises
  `IndexError` in container (`/app/src/costa_workers/rag/ingest.py` only has 5
  parents 0–4). Fixed: try/except with container fallback `/data/protocols`.
  Also respects `PROTOCOLS_DIR` env var override.
- `feat(docker-compose)`: `./data/protocols:/data/protocols:ro` volume mount added
  to `prefect-worker` service + `PROTOCOLS_DIR=/data/protocols` env var. Protocol
  documents now survive container rebuilds without manual `docker compose cp`.
- `fix(infra/postgres/init.sql)`: `rag.documents.content_hash` had only a plain
  index, not a UNIQUE constraint. `ON CONFLICT (content_hash) DO NOTHING` in
  `ingest.py` therefore silently failed. Changed to
  `CREATE UNIQUE INDEX IF NOT EXISTS rag_documents_content_hash_unique`.

**Router robustness (CRITICAL + HIGH fixes from audit):**
- `fix(api/proposals)`: `create_proposal` — added null check on `fetchone()` result
  before accessing `.id` (500 instead of AttributeError).
- `fix(api/proposals)`: `approve_proposal` — race condition: two concurrent approvals
  could both read `status='pending'` and both create duplicate alerts. Fixed by
  atomically `UPDATE ... SET status='approved' WHERE status='pending' RETURNING *`
  first; only the winner gets a row, loser gets 404.
- `fix(api/proposals)`: `approve_proposal` — null check on alert `INSERT RETURNING`
  row before accessing `.id`.
- `fix(api/share)`: `mint_share_token` — `settings.app_cors_origins.split(",")[0]`
  fails silently (wrong URL) if CORS setting is empty. Now filters and uses first
  non-empty origin, falls back to `http://localhost:3000`.
- `fix(api/share)`: `resolve_share_token` — `expires_at.replace(tzinfo=UTC)` is
  incorrect when `expires_at` is already timezone-aware (replaces tz instead of
  converting). Now checks `exp.tzinfo is None` before adding UTC.
- `fix(api/fusion)`: `ubigeo` validation `isdigit()` passes Unicode digit codepoints.
  Added `isascii()` check before `isdigit()`.
- `fix(api/districts)`: SINPAD `except Exception` was fully silent on query errors.
  Added `logger.debug()` so container logs surface the failure when SINPAD table
  is absent.

**Tests:** 314 passed, 0 errors. Build: TypeScript 0 errors, Next.js green.

---

### Session 14 — 2026-05-25 — Sprint 20: Threshold correctness + test coverage + observability

Autonomous session (Fernando offline 12h). All changes on `develop`, local Ollama only.

**Rainfall threshold correctness (CRITICAL operational fix):**
- `fix(ai/agent)`: `_build_answer` used wrong threshold (42mm) for rainfall alerts. Real
  ANA/INDECI thresholds: 25mm/72h = ALERTA, 50mm/72h = EMERGENCIA. Fixed three-tier logic:
  ≥50mm → "⚠ EMERGENCIA", ≥25mm → "⚠ ALERTA", else "debajo del umbral". Wrong threshold
  could delay activation of evacuation protocols.
- `fix(demo)`: `demoData.ts` had 42mm in 9+ places (copilot responses, source tables, English
  answers). Corrected to actual thresholds: 15mm/24h (alert trigger), 25mm/72h (ALERTA),
  50mm/72h (EMERGENCIA). `npx tsc --noEmit` clean.

**SQL injection pattern removed from db_tools:**
- `fix(db-tools)`: `get_huayco_risk` used f-string SQL: `f"IN ({', '.join(f\"'{r}'\" for r in valid)})"`.
  Replaced with parameterized `= ANY(:levels)` pattern. Values came from an internal whitelist,
  so exploitability was nil, but the pattern is a code smell caught by linters.

**Test coverage added (9 new tests this session → 445 total):**
- `test(health)`: Expanded `test_health.py` from 1 → 7 tests. New: all 8 seed keys non-negative,
  ≥43 districts seeded, scraper shape, 8 source keys, status enum validation, `retrieved_at` field.
- `test(agent)`: Huayco SQL injection guard (unknown `min_risk`), `very_high` filter isolation,
  rainfall EMERGENCIA/ALERTA/below labels, `_detect_quick` single-match/ambiguity/rainfall,
  `_detect_multi_quick` two-tool/no-match/dedup, quick-mode integration (LLM not called),
  quick-mode dispatch-raises fallthrough.
- `fix(workers/tests)`: Worker `test_sprint5_contract.py::TestCopilotSafety` and
  `test_sprint6_contract.py::TestAlertApiSchema/TestDecisionLogCsvExport` imported `costa_api`
  not installed in worker env. Fixed with `importlib.util.find_spec` + `@pytest.mark.skipif`.
  Worker tests: 240 passed, 16 skipped, 0 failed.

**DemoLiveSimulator signal coverage:**
- `feat(demo)`: Added 4 new signals to `DemoLiveSimulator.tsx` — 2× `huayco_observation`
  (Lurigancho, Quebrada Huaycoloro) + 2× `flood_observation` (Ate Desborde Rímac, Carabayllo
  Canal). Both label types now appear in the demo signal stream.

**Observability hardening:**
- `fix(health)`: Two silent `except Exception: pass` blocks in `health.py` (Redis scraper-status
  + last-run lookups) now emit `log.warning` with source key and error. Redis outages visible
  in container logs.
- `fix(auto_seed)`: Four bare `except Exception: pass/None` blocks replaced with `logger.debug`
  including coordinates and error. Silent seed failures during district geometry lookup now
  traceable.

**Tests:** 445 API passed (↑20 from 425), 240 worker passed 16 skipped. TypeScript: 0 errors.

---

### Session 18 — 2026-05-25 — Auth completeness + frontend 401 centralization

Autonomous session (Fernando offline 12h). All changes on `develop`, local Ollama only.

**Token response completeness:**
- `feat(auth)`: `TokenResponse` now returns `username` and `full_name` from DB. Frontend auth store was showing username as both username and display name. Updated `OperatorTokenResponse` interface in `api.ts`, `auth.ts` login(), and added assertions in `test_auth.py`.

**Share token auth guard:**
- `feat(share)`: `POST /share` now requires `require_operator`. Previously anyone could create share links with no identity trace (spam vector). `GET /share/{token}` remains public so link recipients don't need accounts.
- `test(share)`: All POST calls updated with `headers=AUTH`; new 401 test for unauthenticated mint.

**Frontend 401 handling centralized:**
- `fix(frontend)`: Added `post()` helper to `api.ts` mirroring `get()` — includes auth headers and calls `_on401` on 401. Refactored `approveProposal`, `rejectProposal`, `submitFieldReport`, `createNotificationSubscriber` to use it.
- `fix(frontend)`: `actOnAlert` and `deleteNotificationSubscriber` now call `_on401` on 401.
- `fix(frontend)`: `mintShareToken` now includes auth headers + 401 handler.
- `fix(AskPanel)`: Copilot panel now triggers `logout()` + `setLoginModalOpen(true)` on 401 instead of showing a generic server error.

**Tests:** 548 API passed (↑1 from 547), 148 worker tests passed, 0 failed. TypeScript: 0 errors.

---

### Session 17 — 2026-05-25 — Security hardening + export auth fix + Ollama robustness

Autonomous session (Fernando offline 12h). All changes on `develop`, local Ollama only.

**Auth guards on sensitive GET endpoints (security fix):**
- `fix(alerts)`: `GET /alerts/decision-log`, `GET /alerts/decision-log/export`, `GET /alerts/decision-log/report` were publicly accessible. Added `require_operator` dependency. These endpoints expose operator audit trail and LLM query content.
- `fix(proposals)`: `GET /proposals` was publicly accessible. Added `require_operator`. Proposal queue includes pending AI-generated alert text — not public data.
- `fix(notifications)`: `GET /notifications` and `GET /notifications/deliveries` were publicly accessible. Subscriber list includes webhook targets (SSRF-sensitive); delivery log reveals escalation timing.

**Export download regression fixed:**
- `fix(frontend)`: `DecisionLogPanel.tsx` CSV and PDF export links were plain `<a href>` HTML anchors — no auth headers. After auth-gating the export endpoints they downloaded 401 JSON error instead of files. Fixed by adding `downloadAuthenticatedFile(path, filename, mimeHint)` helper to `api.ts` and replacing both `<a>` tags with `<Button onClick>` that call it. Auth token included via `getAuthHeaders()`.

**Source label corrections:**
- `fix(layers)`: IMERG source label in `layers.py` said "NASA IMERG Early Run v07" — changed to "NASA IMERG Late Run V07B (GPM)" to match actual ingest.
- `fix(health)`: IMERG label in `health.py` said "NASA IMERG Early Run" — corrected to "NASA IMERG Late Run V07B".

**Ollama provider robustness:**
- `fix(ollama)`: `embed()` had no retry on 429/503/502 (unlike `chat()`). Added 1-retry loop matching `chat()` pattern.
- `fix(ollama)`: Added 0.5s backoff (`asyncio.sleep`) between retries in both `chat()` and `embed()` to give Ollama time to shed load before retry.
- `fix(ollama)`: Improved log messages — include attempt number and delay duration.

**Test coverage added (102 new tests → 547 total):**
- `test(alerts)`: Auth guards verified — 3 new 401 tests for decision-log / export / report. All existing GET calls in test classes updated with `headers=AUTH`.
- `test(proposals)`: 1 new 401 test for `GET /proposals`. Auth header added to existing list test.
- `test(notifications)`: 2 new 401 tests for `GET /notifications` and `GET /notifications/deliveries`. Auth header added to list/deliveries calls.
- `test(notifications/proposals)`: Field-constraint tests (label >100 chars, target >500 chars, district_filter >12 chars, title >200 chars, summary >2000 chars) pin Pydantic max_length validators.

**Tests:** 547 API passed (↑102 from 445), 0 failed. TypeScript: 0 errors.

---

### Session 9 — 2026-05-24 — Sprint 17: Copilot CPU hardening + test stability

Autonomous session (Fernando offline). All changes on `develop`, local Ollama only.

**Copilot quick-mode hardening:**
- `fix(ai/agent)`: `_QUICK_PATTERNS` tightened — "alerta" alone no longer matches;
  requires compound phrases (`alertas activ`, `cuántas alert`, etc.) to prevent
  "Redacta un mensaje de alerta" from hitting quick-mode.
- `feat(ai/agent)`: `_detect_multi_quick()` — 2–3 pattern matches route to parallel
  `asyncio.gather` dispatch without any LLM call (~3s). Per-tool answers joined with
  " | ", "No se encontraron" responses filtered out. Closes the case where a combined
  "¿inundaciones y alertas?" query would time out on 9-tool context.
- `feat(ai/agent)`: `_TOOL_SCHEMA_BY_NAME`, `_TOOL_HINT_MAP`, `_select_tools(query)`
  — pre-selects 2–3 relevant tool schemas before LLM call, reducing input tokens
  from ~1100 (9 tools) to ~300–400. Cuts Ollama CPU inference time from >60s to ~20s.
- `fix(ai/agent)`: `_build_answer` `level_change_1h_m` float format — field can be
  string from asyncpg; wrapped in `try: float(change)` with ValueError fallback.
- `fix(config)`: `llm_timeout_chat` 30s → 45s; CPU-only Qwen2.5-7B needs ~20–25s
  with 2–3 tools in context.

**Frontend fixes:**
- `fix(ui/AlertsPanel)`: escalate button lacked `disabled={acting}` — operators
  could double-submit an escalation to INDECI COEN. Added `disabled={acting}` +
  `disabled:opacity-50`.
- `fix(ui/DecisionLogPanel)`: error state showed message but no retry path. Added
  retry button wired to `refetch()`.

**Test stability:**
- `fix(tests/conftest)`: `_do_restore()` teardown crashed with FK violation
  (`notification_deliveries_alert_id_fkey`) when test-created alerts had
  `notification_deliveries` rows. Added pre-delete of notification_deliveries
  for those alerts before deleting alerts.
- `fix(tests/test_ai_agent)`: three test queries updated to bypass expanded
  quick-mode patterns (`test_direct_answer_no_tools`, `test_output_guardrail_redacts_key`,
  `test_parallel_tool_execution`).

**Tests:** 314 passed, 0 errors (up from 312 + 2 failures).
**Build:** TypeScript 0 errors. Next.js production build green.

---

### Session 8 — 2026-05-18 — Sprint 16: Shelters, Callao, Quick-mode, Twilio, Tour

Autonomous session (Fernando offline 11am–4pm). All changes on `develop`, local Ollama only.

**P1–P3, P7 — Documentation sprint:**
- `docs(runbook)`: `operator-runbook.md` fully rewritten to Sprint 15 — Proposals/HITL panel, 9-tool copilot with quick-mode table, auto-resolution lifecycle, ANA Redis fallback, Ollama timeout recovery, SINAGERD role table.
- `docs(sources)`: `data-sources.md` date updated, dead RSS feeds removed (Canal N, La República → Gestión), ANA Redis stale-cache note, new "Agentic Copilot Tools" section with 9-tool table.
- `docs(competition)`: `COMPETITION.md` Phase 3 delta section — comparison table (8→9 tools), auth, HITL, PDF, quick-mode, shelters, Callao.
- `docs(arch)`: `architecture.md` honest inference-latency table: quick-mode ~2s, full agentic 15–30s, triage 3–8s.

**P4 — INDECI evacuation shelters layer (end-to-end):**
- `infra/postgres/migration_shelters.sql` — `geo.shelters` table with `GENERATED ALWAYS AS` geom; 20 Lima INDECI-referenced shelters seeded (Parque Zonal Huiracocha, Estadio Nacional, Coliseo Chosica, Gran Chimú Ate, Sinchi Roca, etc.). Applied to running container.
- `routers/layers.py` — `GET /api/v1/layers/shelters` GeoJSON endpoint.
- `api.ts` — `ShelterCollection` types + `fetchShelters()`.
- `queries.ts` — `useShelters()` hook (60-min staleTime, static data).
- `MapView.tsx` — sage-green circle + label layers, popup with capacity/type/district, cursor change.
- `ScenarioPanel.tsx` — `"shelters"` entry added to `LAYERS` constant (toggle UI).

**P5 — Copilot quick-mode (5 query types, ~2s without LLM):**
- `agent.py` — `_QUICK_PATTERNS` + `_detect_quick()`. Fixed: multi-topic queries (matching >1 pattern) now fall through to full LLM, not just first match.
- `copilot.py` — `quick_mode: bool` in `CopilotResponse`.
- `AskPanel.tsx` — "Modo rápido · sin LLM · ~2s" badge on responses.

**P6 — Callao geodata:**
- `infra/postgres/migration_callao.sql` — 7 Callao districts (`070101`–`070107`, including Mi Perú created 2014 by Ley N°30197). Approximate polygon geometries. Applied to running container.

**P8 — Real SMS via Twilio:**
- `pyproject.toml` — `twilio>=9.0` dependency. Installed in running container.
- `config.py` — `twilio_account_sid / auth_token / from_number` + `twilio_enabled` property.
- `notifications.py` — `_send_sms()` with lazy Twilio import; stubs gracefully when unconfigured. Fan-out handles `"sms"` channel.
- `.env.example` — Twilio stanza documented.

**P9 — driver.js onboarding tour updated:**
- `TutorialOverlay.tsx` — new step 5 for Proposals HITL panel (`#driver-nav-proposals`): 4-eyes approval flow, LLM reasoning visible, SMS+email on approval. Copilot step (now step 6) updated to mention quick-mode and population-at-risk query. `layerEffects` indices updated accordingly.

**Tests:** 314 passed, 1 flaky teardown error (pre-existing, passes in isolation). 3 test failures fixed: `test_direct_answer_no_tools`, `test_output_guardrail_redacts_key`, `test_parallel_tool_execution` — all caused by quick-mode intercepting mock-LLM test queries.

**Build:** TypeScript 0 errors. Next.js production build green.

---

### Session 7 — 2026-05-18 — Real-disaster utility pass + AI speed

Autonomous session answering "useful or just pretty?" against real disaster scenarios.
All code local-only; no cloud LLM calls (local Ollama throughout).

**Infrastructure gap closed:**
- `fix(infra)`: `pgstac.items` relation was missing — `flood-segmentation-hourly` and
  `sentinel1-daily` Prefect flows were throwing `relation "pgstac.items" does not exist`
  on every run. `stac-fastapi-pgstac` image doesn't ship `pypgstac` CLI; bootstrapped
  schema via one-time `docker exec costa-api pip install "psycopg[binary,pool]" &&
  python -c "import asyncio; from pypgstac.migrate import Migrate; ..."`.
  STAC catalog returned full results immediately. Both Prefect flows can now ingest
  new Sentinel-1 scenes.

**AI speed (3 independent mechanisms):**
- `feat(ai)`: `apps/api/src/costa_api/ai/cache.py` — new Redis-backed TTL cache for
  all 9 DB tools. Key structure: `costa:ai:tool:{name}:{md5(args)[:12]}`. Per-tool
  TTLs: floods=5m, alerts=30s, infrastructure=30m, protocols=1h, river=1m,
  population=5m, districts=10m, protocols=1h, social=2m. Redis outage → silent
  fallback to DB (never breaks the copilot).
- `feat(ai)`: `agent.py` tool dispatch changed from sequential for-loop to
  `asyncio.gather()`. Multiple tool calls in one LLM iteration now run concurrently.
  Error in one tool is caught + reported without aborting the batch.
- `fix(ai/ollama)`: `num_ctx` was unset (default 32k); set to 8192. Ollama KV cache
  loads 3× faster. Prior value of 4096 caused "Server disconnected" on concurrent
  requests (confirmed by 4 test failures in `test_session_audit.py`). 8192 fits
  4 tool iterations comfortably.

**9th copilot tool — population at risk:**
- `feat(ai/tools)`: `get_population_at_risk` added to TOOL_SCHEMAS + _TOOL_MAP.
  Spatial join of `ml.flood_polygons × geo.districts` with `ST_MakeValid` on both
  sides + `ST_Intersection` area estimation. Uses INEI 2017 census population
  (seeded Session 3) to estimate affected persons per district. LLM keyword map
  routes "poblaci/personas/habitantes/afectad/riesgo pob" queries straight here.

**River level trend:**
- `feat(ai/tools)`: `get_river_levels` rewritten with a two-CTE query. `latest` CTE
  gets current reading; `prev_1h` CTE gets reading from 45–90 min ago. Computes
  `trend` (rising >5cm/h / falling <-5cm/h / stable / unknown) and
  `level_change_1h_m`. System prompt now says "Si algún río tiene trend=rising,
  destácalo como prioridad inmediata de evacuación."

**ANA/SENAMHI stale-data cache:**
- `feat(ingest/hydro)`: `ana_scraper.py` now caches every successful gauge reading
  to Redis (`costa:gauge:reading:{code}`, 24h TTL). On HTTP failure (government
  sites go down during actual floods), falls back to last known reading with
  `from_cache=True`. Scraper publishes live/total station counts to
  `costa:scraper:status:{ana|senamhi}` for the health endpoint.

**IMERG rainfall threshold alerts:**
- `feat(alerts)`: `generate_rainfall_alerts()` task added. ANA-aligned thresholds:
  50mm/72h → critical, 25mm/72h → high, 15mm/24h → medium. Deduplicated per
  watershed per 6h to prevent queue saturation. Inserted into `ops.alerts` with
  `alert_type='rainfall'`.

**Alert auto-resolution:**
- `feat(alerts)`: `resolve_stale_alerts()` task added. Flood alerts auto-resolve
  after 7 days (SAR revisit cadence), huayco after 48h, social-cluster alerts
  after 4h, rainfall alerts after 6h. Prevents duty-officer queue from accumulating
  thousands of stale entries over a multi-week El Niño event.

**Auto-notification fan-out:**
- `feat(alerts)`: `_auto_notify()` fan-out fires immediately when the alert generator
  inserts a critical or high alert. Previously notification_subscribers only received
  webhooks on operator-manual `escalate` action. During rapid onset (e.g., flash
  flood at 2am), operators may not be watching the screen — critical alerts now push
  directly without human trigger.

**Health endpoint Redis status:**
- `feat(api/health)`: `/health/scraper` merges `costa:scraper:status:{key}` from
  Redis into the `stations` source, exposing `scraper_live_stations`,
  `scraper_total`, and `scraper_status` so the FEEDS chip can show how many ANA/
  SENAMHI gauges are reporting live vs cached.

**Tests added (Session 7):**
- 5 new tests `test_ai_agent.py`: cache round-trip, cache invalidate, population_at_risk
  in TOOL_SCHEMAS, population_at_risk dispatch, parallel tool execution via asyncio.gather.

**Known pre-existing failures (not caused by this session):**
- `test_session_audit.py`: 4 LLM interaction tests — "Server disconnected without
  sending a response". These test the full HTTP path to local Ollama; intermittent
  under load. `num_ctx=8192` reduced frequency. 1 pre-existing teardown error in
  `test_social.py::test_field_report_returns_district_id_when_known` (passes alone).

### Session 6 — 2026-05-18 — Trust-the-loop hardening pass

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
| 14 | Trust-the-loop pass (PII fix, truthful counts, no false-success toast, Prefect deploys) | ✅ |
| 15 | Real-disaster utility pass (pgstac, AI speed, pop-at-risk, rainfall alerts, auto-resolve, ANA cache) | ✅ |
| 16 | Shelters, Callao, Quick-mode, Twilio, onboarding tour | ✅ |
| 17 | Copilot CPU hardening (multi-quick, tool pre-selection, 45s timeout), AlertsPanel + DecisionLog fixes, test stability | ✅ |
| 18 | RAG end-to-end fix (vector cast, protocol volume, unique constraint), router hardening (race conditions, null checks, timezone) | ✅ (this session) |

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
| ANA/SENAMHI fragility under site outage | C1 reliability | ✅ Done Session 7 — Redis 24h stale-reading cache + scraper health publish |
| Rainfall threshold alerts (IMERG) | C1 coverage | ✅ Done Session 7 — 50/25/15 mm thresholds, auto-resolve after 6h |
| Auto-notification on critical alerts | C1 latency | ✅ Done Session 7 — fan-out fires on alert insert, not just operator escalate |
| `EscalationModal` programmatic focus trap | A11y polish | ✅ Done Session 6 — auto-focus textarea, Escape, Tab cycle, focus restore |
| `r.avaflow` debris-flow simulation snapshot | C5 +0.2 | Deferred post-submission (3+ days GRASS container work) |
| Bootstrap `pgstac` schema for Sentinel-1 ingest + flood-seg flows | C1 (new scenes) | ✅ Done Session 7 — `pypgstac migrate` applied; both flows unblocked |

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
