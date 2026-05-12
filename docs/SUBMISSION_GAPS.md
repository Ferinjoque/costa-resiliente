# Costa Resiliente — IEEE Submission Gap Analysis

> Machine-maintained. Last updated: 2026-05-12.
> Load this file at the start of every session alongside SPRINT_LOG.md.

---

## Competition Status

- **Phase 2 (Concept):** ✅ Submitted
- **Phase 3 (Product) Deadline:** 9 October 2026
- **Judging:** November–December 2026
- **Working days remaining:** ~103

---

## IEEE Sub-Problems Coverage

From `additional-information-for-response-quest-participants_00001.txt`:

| Sub-Problem | Status | Notes |
|-------------|--------|-------|
| **Access** — locating and retrieving disaster data | ✅ DONE | Prefect flows: S1, IMERG, ANA, social. Retries. STAC catalog. |
| **Storage** — managing and organizing data | ✅ DONE | PostGIS + TimescaleDB + MinIO + pgstac |
| **Integration** — aligning multi-source data | ✅ DONE | Unified spatial schema, UBIGEO key, Redis pub/sub live |
| **UI** — intuitive visualization | ⚠️ PARTIAL | Built but: not responsive, not WCAG AA, PWA not wired |
| **Decision-making** — interpret data, take action | ✅ DONE | Operator Copilot RAG, decision log, alert actions |
| **Modeling** — simulate/predict scenarios | ⚠️ PARTIAL | Flood seg + XGBoost huayco. r.avaflow NOT built. |

---

## Mandatory Deliverables (from additional-information doc)

| Requirement | Status | Gap |
|-------------|--------|-----|
| Single UI accessible in Chrome, Edge, Safari, Firefox | ✅ Next.js | Need cross-browser test |
| Scale to desktop, tablet, and phone | ❌ NOT DONE | No responsive CSS verified |
| Visualize currently changing data | ✅ Live via TanStack Query | — |
| Intuitive — no significant training | ✅ Spanish-first, Copilot | Need usability doc for judges |
| Display data for region selected by user | ✅ District dropdown | — |
| Display critical infrastructure | ✅ OSM layer (hospitals, schools, bridges, substations) | — |
| Display current weather / precipitation | ✅ IMERG rainfall layer | — |
| Near-real-time data | ✅ IMERG 30min, social 15min | — |

---

## 5 Rubric Criteria — Gap Mapping

### Criterion 1: Timeliness & Real-Time Responsiveness

**Target score: 5/5 | Current estimate: 4/5**

What a 5 looks like: near real-time with minimal latency, well-structured technical foundation, real data flowing.

| Item | Status | Fix |
|------|--------|-----|
| IMERG 30-min ingest | ✅ Prefect flow, 1h schedule | — |
| Sentinel-1 12-day revisit | ✅ PC STAC, daily check | — |
| ANA/SENAMHI scraper | ✅ Sprint 4 | — |
| Bluesky Jetstream firehose | ✅ 30s window, 15min schedule | — |
| Redis pub/sub live push | ✅ architecture in place | — |
| **schedules.py missing 5 flows** | ❌ Only 3/8 flows registered | Fix `flows/schedules.py` — add ana, huayco, triage, alert_generator, flood_pipeline |
| Latency display in UI ("last updated X ago") | ❌ NOT DONE | Add timestamp to API responses + UI |
| r.avaflow on-demand simulation | ❌ NOT DONE | Medium priority |

**Sprint 7 fix:** Register all missing flows in schedules.py. Add `updated_at` to each `/layers/*` response.

---

### Criterion 2: Comprehensiveness & Novel Data Discovery

**Target score: 5/5 | Current estimate: 4/5**

What a 5 looks like: multiple relevant sources including novel/underutilized data, explains limitations clearly.

| Item | Status | Fix |
|------|--------|-----|
| Sentinel-1 SAR (cloud-penetrating) | ✅ Novel for flood | — |
| NASA IMERG Early Run | ✅ 30-min global precip | — |
| ANA hydro stations (8) | ✅ Sprint 4 | — |
| SENAMHI meteorological (4) | ✅ Sprint 4 | — |
| OSM infrastructure | ✅ Sprint 1 | — |
| INEI 2017 census (population) | ✅ Loaded as districts fixture | — |
| Bluesky + Reddit + RSS + Telegram | ✅ Novel social signal layer | — |
| Castro-Cabrera 2024 (Lima geology) | ✅ ADR-0002 documented | — |
| **CENEPRED SIGRID hazard polygons** | ❌ NOT LOADED | Run `scripts/load_sigrid.py` (to be created) |
| **INDECI SINPAD historical records** | ❌ NOT LOADED | CSV download from INDECI portal; load fixture |
| **Population exposure per flood polygon** | ❌ NOT DONE | Spatial join ml.flood_polygons × geo.districts × census pop |
| r.avaflow debris flow simulation | ❌ NOT DONE | Requires r.avaflow Docker + DEM |
| Data limitations section in UI | ❌ NOT DONE | Add "About this data" modal or help text |

**Sprint 7 fixes:**
1. Load CENEPRED SIGRID (one-time script) — HIGH impact, LOW effort
2. Add population exposure count to flood alert title — HIGH impact, MEDIUM effort
3. Add data limitations text to AskPanel or footer

---

### Criterion 3: Integration & Responsible Data Handling

**Target score: 5/5 | Current estimate: 4.5/5**

What a 5 looks like: seamless coherent insights, strong ethical safeguards, transparent data handling.

| Item | Status | Fix |
|------|--------|-----|
| Unified spatial schema (all PostGIS) | ✅ — | — |
| UBIGEO key consistency across layers | ✅ — | — |
| Redis pub/sub cross-layer live updates | ✅ — | — |
| PII redaction via presidio-analyzer | ✅ Sprint 4 | — |
| Location coarsened to ~100m | ✅ coded | — |
| 7-day raw social data purge (pg_cron) | ✅ init.sql | — |
| Append-only decision log trigger | ✅ Sprint 6 | — |
| "LLM never fabricates" invariant | ✅ by design | — |
| XML prompt injection firewall | ✅ `<SEÑAL>` tags | — |
| Ley 29733 + DS 016-2024-JUS compliance | ✅ documented | — |
| **Data provenance field on layers** | ❌ NOT DONE | Add `source_url`, `retrieved_at` to API responses |
| **Data flow diagram (visual)** | ❌ NOT DONE | Add to docs/architecture.md or submission |
| **OCHA/IASC responsible data doc visible in UI** | ❌ NOT DONE | Link to docs/responsible-data-handling.md from footer |

**Sprint 7 fix:** Add `source` + `retrieved_at` to `/layers/*` API responses (judges verify provenance). Low effort.

---

### Criterion 4: Usability & Operational Readiness

**Target score: 5/5 | Current estimate: 3/5**

What a 5 looks like: intuitive, aligned with responder workflows, well-documented, safe for operational use, deployed.

| Item | Status | Fix |
|------|--------|-----|
| Spanish-first UI | ✅ — | — |
| Spanish NL copilot | ✅ — | — |
| Alert acknowledge/escalate/close | ✅ Sprint 6 | — |
| Decision log CSV export | ✅ Sprint 6 | — |
| **PUBLIC DEPLOYMENT (judges MUST see it)** | ❌ CRITICAL | Deploy to Fly.io or Railway |
| **Responsive design (tablet 768px, phone 375px)** | ❌ NOT DONE | Add Tailwind responsive variants |
| **WCAG AA accessibility audit** | ❌ NOT DONE | Run axe-core or Lighthouse; fix contrast + labels |
| **PWA offline mode** | ❌ NOT DONE | Wire `next-pwa` (already in package.json) |
| **2017 El Niño replay tutorial** | ❌ NOT DONE | BRIEF Sprint 6 goal — pre-loaded fixtures + time slider |
| **Operator runbook** | ⚠️ EXISTS | `docs/responsible-data-handling.md` exists; confirm operator-runbook.md is complete |
| **Cross-browser testing** | ❌ NOT DONE | Test Chrome, Firefox, Safari, Edge |
| **"About / Help" modal** | ❌ NOT DONE | Judges need context without training |

**Sprint 7 priorities for Criterion 4 (ordered):**
1. Deploy to public URL — BLOCKING (judges can't evaluate without it)
2. Add responsive CSS — 1 day effort, large score impact
3. Wire PWA — 4 hours, `next-pwa` already in deps
4. WCAG AA pass — run Lighthouse, fix the 3-5 issues it finds
5. El Niño 2017 replay — 2-3 days, big usability + scenario fit boost

---

### Criterion 5: Scenario Fit & Innovation

**Target score: 5/5 | Current estimate: 4/5**

What a 5 looks like: strong alignment with specific disaster scenario, high-value insights, innovative approaches.

| Item | Status | Fix |
|------|--------|-----|
| Lima Metropolitana specificity | ✅ 43 districts, 3 watersheds, 10 quebradas | — |
| El Niño Costero 2026-2027 framing | ✅ BRIEF + README | — |
| Sen1Floods11 with 2017 Peru El Niño training data | ✅ ADR-0002 | — |
| Castro-Cabrera 2024 Lima Norte geology | ✅ cited, implemented | — |
| Spanish-language LLM (Grandury ACL 2025 La Leaderboard) | ✅ cited | — |
| SINAGERD/COEN/COER/COEL operator framing | ✅ documented | — |
| Prompt injection hardening (Aegis-style) | ✅ novel safety feature | — |
| **r.avaflow top-10 quebradas simulation** | ❌ NOT DONE | Required for max score here |
| **2017 El Niño replay demo** | ❌ NOT DONE | Show the platform working on a real past event |
| **Population exposure narrative** | ❌ NOT DONE | "This flood affects ~X people in district Y" |
| **Spanish submission narrative** | ❌ NOT DONE | Document WHY this is specifically suited to Lima |

---

## Prioritized Gap List (Sprint 7 Roadmap)

### CRITICAL (submission fails without these)
| Gap | Effort | Rubric |
|-----|--------|--------|
| Public deployment (judges must access) | 1 day | C4 |
| Demo video (2–5 min, real person using product) | 1 day | All |
| All Prefect flows registered in schedules.py | 2 hours | C1 |

### HIGH (meaningful score delta)
| Gap | Effort | Rubric |
|-----|--------|--------|
| Responsive design (tablet + phone) | 1 day | C4 |
| CENEPRED SIGRID data loaded | 4 hours | C2 |
| Population exposure per flood polygon | 4 hours | C2+C5 |
| WCAG AA audit pass | 4 hours | C4 |
| 2017 El Niño replay tutorial + fixture data | 3 days | C4+C5 |
| `source` + `retrieved_at` in layer API responses | 2 hours | C3 |
| Latency display ("last updated X ago") in UI | 2 hours | C1 |

### MEDIUM (polish, differentiation)
| Gap | Effort | Rubric |
|-----|--------|--------|
| Wire PWA (next-pwa in deps) | 4 hours | C4 |
| Cross-browser test (Chrome/Firefox/Safari/Edge) | 2 hours | C4 |
| Data limitations / "About this data" text in UI | 1 hour | C2 |
| Data flow diagram in docs/architecture.md | 2 hours | C3 |
| Operator runbook completeness check | 1 hour | C4 |
| Responsible data handling link in UI footer | 30 min | C3 |

### LOWER (nice to have)
| Gap | Effort | Rubric |
|-----|--------|--------|
| r.avaflow integration | 5+ days | C2+C5 |
| INDECI SINPAD historical records | 2 hours | C2 |
| "About / Help" modal in UI | 2 hours | C4 |
| i18n configuration (next-intl in deps) | 1 day | C4 |

---

## Accounts & Credentials Required

All values go in `.env` (gitignored). Template: `.env.example`.

### 1. NASA EarthData — REQUIRED
- **For:** IMERG Early Run via OPeNDAP (GES DISC)
- **Register:** https://urs.earthdata.nasa.gov/users/new (free)
- **Approval required:** Yes, need to approve GES DISC application in profile
- **Env vars:** `EARTHDATA_USERNAME`, `EARTHDATA_PASSWORD`
- **Where in code:** `apps/workers/src/costa_workers/ingest/imerg.py`

### 2. Reddit App — REQUIRED
- **For:** PRAW rate limits (60 req/min vs 30 without auth)
- **Register:** https://www.reddit.com/prefs/apps → "create another app" → script type
- **Env vars:** `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`
- **Update:** `REDDIT_USER_AGENT` in `.env` with your actual email
- **Where in code:** `apps/workers/src/costa_workers/ingest/social.py`

### 3. Microsoft Planetary Computer — OPTIONAL (but recommended)
- **For:** Higher rate limits on Sentinel-1 STAC search + signed asset URLs
- **Register:** https://planetarycomputer.microsoft.com/account/request (free)
- **Env var:** `PC_SDK_SUBSCRIPTION_KEY`
- **Where in code:** `apps/workers/src/costa_workers/ingest/sentinel1.py`
- **Note:** Unsigned access works without key; key prevents throttling

### 4. Bluesky — OPTIONAL
- **For:** Jetstream WebSocket firehose is fully public; only needed if you want to post
- **Register:** https://bsky.app (free)
- **Env vars:** `BSKY_HANDLE`, `BSKY_APP_PASSWORD` (only needed if posting)
- **Note:** Skip — firehose ingestion needs no auth

### 5. Telegram — OPTIONAL
- **For:** Read public INDECI/COER Lima channels via telethon
- **Register:** https://my.telegram.org/apps (free, needs phone number)
- **Env vars:** `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`
- **Where in code:** `apps/workers/src/costa_workers/ingest/social.py`
- **Note:** Social flow skips telegram automatically if vars unset

### 6. ASF HyP3 — OPTIONAL
- **For:** SAR RTC pre-processing (not needed — Planetary Computer provides GRD)
- **Register:** Same EarthData account as NASA
- **Note:** Skip unless switching from PC to ASF as Sentinel-1 source

### 7. Deployment Platform — REQUIRED for submission
- **For:** Judges must access a running product at a public URL
- **Options (cost-ordered):**
  - **Fly.io** — cheapest Docker-compose equivalent. ~$20/mo for this stack.
    Register: https://fly.io (credit card required, free trial available)
  - **Railway** — simple Docker deploy. ~$25/mo.
  - **DigitalOcean** — $20/mo droplet + Docker Compose. Most similar to local dev.
  - **Hetzner** — €5/mo VPS, cheapest. Recommended if budget is tight.
- **What to deploy:** Full `docker-compose.yml` on a single VM, plus DNS/TLS
- **Env vars for deployment:** All `.env` values + `APP_ENV=production` + `APP_CORS_ORIGINS=https://yourdomain.com`

### 8. Domain / TLS — RECOMMENDED
- **For:** Clean URL for judges + TLS (browsers warn on http)
- **Options:** Cloudflare (free TLS proxy), Namecheap/Porkbun (~$10/yr domain)
- **Note:** Fly.io and Railway give you a `*.fly.dev` / `*.up.railway.app` subdomain free

### 9. No accounts needed (self-hosted):
- PostgreSQL + PostGIS + TimescaleDB → Docker container
- MinIO → Docker container  
- Redis → Docker container
- Ollama → Docker container (pull `gemma3:12b-instruct-q4_K_M` after startup)
- Prefect server → Docker container

---

## What Judges Actually See (Phase 3)

From `response-quest-challenge-rules.txt`:
- Working product at a URL (must be browser-accessible)
- 2–5 minute video of a real person using the product
- Finalists may be invited to present remotely (Nov–Dec)

**The video must show:**
- Real data flowing (not mock data)
- A responder-style workflow: see map → get alert → ask copilot → log decision
- Spanish-language interaction (judges know this is SINAGERD/Peru)
- The novel elements: social signal triage, SAR flood overlay, huayco probability

---

## Test Coverage Status

```
Sprint 1–6 total: 113 passing tests
Location:        apps/workers/tests/ + apps/api/tests/
Run:             cd apps/workers && pytest -x -q
                 cd apps/api && pytest -x -q
```

**Not tested:**
- Frontend (no Playwright E2E suite yet)
- Docker Compose integration (no smoke test against running stack)
- Cross-browser rendering

---

## One-Time Setup Steps (must run before judging)

These are NOT automated but MUST be done for a working submission:

```bash
# 1. Generate PMTiles from OSM Peru extract
bash scripts/generate_pmtiles.sh --upload

# 2. Load Lima geodata (districts, watersheds, quebradas, OSM infrastructure)
python scripts/load_lima_geodata.py

# 3. (TODO) Load CENEPRED SIGRID hazard polygons
python scripts/load_sigrid.py   # to be created

# 4. Pull Ollama model (runs inside Docker)
docker exec costa-ollama ollama pull gemma3:12b-instruct-q4_K_M

# 5. Run first Sentinel-1 ingest to populate pgstac
# (triggers automatically via Prefect schedule, or run manually)
prefect deployment run sentinel1-ingest/sentinel1-daily

# 6. Backfill IMERG (last 72 hours)
prefect deployment run imerg-ingest/imerg-hourly
```

---

## Score Projection

| Criterion | Current | After Sprint 7 HIGH items | After Sprint 7 ALL items |
|-----------|---------|--------------------------|--------------------------|
| C1 Timeliness | 4 | 4.5 | 5 |
| C2 Comprehensiveness | 4 | 4.5 | 5 |
| C3 Integration | 4.5 | 5 | 5 |
| C4 Usability | 3 | 4.5 | 5 |
| C5 Scenario Fit | 4 | 4.5 | 5 |
| **Total / 25** | **19.5** | **23** | **25** |

**The biggest lever is Criterion 4.** Deploy + responsive + PWA + tutorial is 1.5 points in C4 alone.
