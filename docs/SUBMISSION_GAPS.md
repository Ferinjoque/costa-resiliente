# Submission Gaps — Costa Resiliente

> Rubric-mapped gap analysis against IEEE Response Quest 2026 Phase 3 criteria.
> Last updated: 2026-05-17 (Session 3 — El Niño replay, population exposure, SSE fix).
> Score scale: 1–5 per criterion. Total: 25.

---

## Score Summary

| # | Criterion | S8 | S9 | S10 | S11 | S12 | S2 | **S3** | Target | Remaining gap |
|---|-----------|----|----|-----|-----|-----|----|--------|--------|---------------|
| C1 | **Timeliness** | 4.3 | 4.3 | 4.3 | 4.3 | 4.3 | 4.6 | **4.7** | 5.0 | ANA scraper fragility |
| C2 | **Comprehensiveness** | 4.8 | 4.8 | 4.8 | 4.8 | 4.8 | 4.8 | **5.0** ✅ | 5.0 | — |
| C3 | **Integration** | 4.8 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | **5.0** ✅ | 5.0 | — |
| C4 | **Usability** | 4.5 | 4.8 | 4.9 | 4.9 | 5.0 | 5.0 | **5.0** ✅ | 5.0 | VPS confirms on deploy |
| C5 | **Scenario Fit** | 4.3 | 4.8 | 4.8 | 4.8 | 4.9 | 4.9 | **5.0** ✅ | 5.0 | r.avaflow (post-submission) |
| | **Total** | ~22.7 | ~23.7 | ~23.8 | ~23.8 | ~24.0 | ~24.3 | **~24.7 / 25** | 25 / 25 | VPS deploy unblocks final scoring |

## Session 3 — El Niño replay + population exposure + SSE fix (2026-05-17)

Closed the remaining C2/C5 gaps and hardened the SSE stream.

- **Population exposure (C2+0.2, C5+0.1):** INEI 2017 census seeded for all 41 Lima
  Metro districts. `auto_seed.py` guards `flood_polygon` El Niño fixture insertion
  against the early-return check. `LIMIT 1` added to alert title lookup preventing
  `MultipleResultsFound` on duplicate rows. Social signal `expires_at` pre-computed
  in Python to avoid asyncpg `AmbiguousParameterError`.
- **El Niño 2017 replay (C5+0.1):** `ScenarioPanel` `ReplayDateScrubber` with 5
  historical steps (Mar 15 – Apr 2 2017). `_parse_replay_time` in `layers.py` treats
  bare date strings as 23:59:59 UTC so full-day SAR coverage is included. Replay date
  is passed from `MapView` → `useFlood`/`useImerg` hooks → API.
- **SSE task leak (stability):** `generate()` now tracks the in-flight `fetch_task`
  via `asyncio.create_task` and cancels it in a `finally` block. Prevents orphaned
  asyncio tasks from accumulating on client disconnect, which was starving uvicorn
  and causing the healthcheck to time out.
- **Test result:** 175/175 pass (`not Copilot and not TestShare`). API healthy.

## Sprint 12 — Impeccable design pass (2026-05-16)

Closes the long-running C4 Usability gap by intervening at the visual-
system level rather than per-feature. See `apps/web/DESIGN.md` for the
full system spec and `docs/IMPECCABLE_AUDIT.md` for the baseline audit.

- Phase 1 — `/impeccable audit + critique`: scored UI at 5.8/10 with 9/9
  AI-template markers detected.
- Phase 2 — `/impeccable distill`: collapsed three overlapping situational
  surfaces (HUD + SituationBrief + LiveTicker were all surfacing the same
  SINAGERD level + alerts count). HUD now canonical on desktop;
  SituationBrief is `sm:hidden` for desktop. DataFreshnessBar slimmed.
- Phase 3 — `/impeccable typeset + colorize`: added Fraunces display
  family alongside Inter + JetBrains Mono. Tailwind palette migrated to
  OKLCH SINAGERD-aligned severity (cinnabar/ochre/mustard/sage) +
  Pacific-coast `costa` ramp + new `sand` warm accent. CSS custom props
  in globals.css aligned. Map popup chrome + emergency glow + critical
  pulse all sourced from severity tokens.
- Phase 4 — `/impeccable layout`: bento CityOverview (3×2 hero +
  satellites + footer strip), display-family hero numerals, raised type
  floor (`text-[9px]` → `text-[10px]` minimum), MetricCard refit.
- Phase 5 — `/impeccable harden`: emoji UI icons replaced with
  SINAGERD-style ASCII tag codes ([SAR], [HUA], [SOC], [SOS], [ACK], etc.)
  rendered in the display family. Designed empty states for AlertsPanel +
  TopRiskList. LiveTicker switched from `role=marquee` to
  `role=region aria-live=polite`. Costa Resiliente monogram replaces the
  prior gradient + icon-mashup logo.
- Phase 6 — `/impeccable optimize`: TutorialOverlay / SharePanel /
  DemoLiveSimulator switched to `next/dynamic`. ShareLoader wrapped in
  Suspense. Production build green. First-load JS `/` = 153 kB.
- Phase 7 — `/impeccable polish + delight`: new `MapRadar` component —
  signature sweep anchored bottom-right of the map area, beam tint
  follows highest active severity, respects reduced-motion, suppressed
  when any non-map panel is active.
- Phase 9 — `/impeccable document`: `apps/web/DESIGN.md` captures the
  full visual system spec for future contributors.

The pass leaves an audit score of ~8.6/10 against the same five
dimensions (typography 9, color 9, layout 8, motion 8, hierarchy 9),
and trims 7 of the 9 detected AI-template markers.

## Sprint 9 Shipped (2026-05-16)

## Sprint 9 Shipped (2026-05-16)

- `refactor(map)`: Source labels, popup helpers, unified click priority, dark popup CSS
- `feat(share)`: Read-only share tokens — `POST /share` mint, `GET /share/{token}` resolve; SharePanel + ShareLoader + LeftRail button + read-only mode banner
- `feat(fusion)`: Multi-hazard district callout — `GET /fusion/{ubigeo}` joins flood×huayco×social×population; FusionCallout.tsx with risk badge + Spanish prose; 3D flood extrusion (fill-extrusion, 45° pitch toggle)

---

## C1 — Timeliness (current: 4.0 / 5.0)

### What we have
- IMERG Early Run: ~4h global latency, polled every 30 min ✅
- Sentinel-1: ~3h after acquisition ✅
- ANA/SENAMHI stations: scraped every 15 min ✅
- Social signals (Bluesky + RSS + Reddit + Telegram): polled every 15 min ✅
- `DataFreshnessBar` shows `data_updated_at` for each layer ✅

### Gaps
| Gap | Impact | Effort | Priority |
|-----|--------|--------|----------|
| ~~**SSE live push** — not wired to map refresh~~ | ✅ **DONE** Session 2 | — | — |
| **ANA scraper fragility** — documented known fragility (no public REST API; HTML scraping). Add retry-and-alert if scraper returns 0 rows for >2h. | C1 +0.2 | 1h | Low |

---

## C2 — Comprehensiveness (current: **5.0** ✅)

### What we have
- Sentinel-1 SAR flood segmentation ✅
- NASA IMERG rainfall (6 accumulation windows) ✅
- ANA + SENAMHI hydrometeorological stations ✅
- OSM critical infrastructure (hospitals, schools, bridges, substations, fire stations) ✅
- Lima districts + 3 watersheds + 10 quebradas ✅
- Social signals: Bluesky + RSS (6 feeds) + Reddit (3 subreddits) + Telegram (SENAMHI) ✅
- SINPAD historical events 2003–2020 (2,063 Lima flood/huayco records) ✅
- Hazard zones: 50 districts classified by SINPAD event density (flood + landslide) ✅
- INEI 2017 census at district level (41 Lima Metro districts) ✅
- ~~**Population exposure per flood polygon**~~ ✅ **DONE Session 3** — INEI 2017 data seeded; fusion API returns `population_at_risk` + `affected_districts`

### Remaining gaps (low priority)
| Gap | Impact | Effort | Priority |
|-----|--------|--------|----------|
| **CENEPRED SIGRID native polygons** — SIGRID requires SSO auth (returns 401). Blocked. | C2 +0.2 | Blocked | Low |
| **IGP seismic feed** — multi-hazard context, secondary to flood/huayco. | C2 +0.1 | 2h | Low |

---

## C3 — Integration (current: 4.5 / 5.0)

### What we have
- All layers fused on single MapLibre map with toggles ✅
- RAG copilot queries across all PostGIS/TimescaleDB sources ✅
- Auto-alert generation fusing flood polygons + huayco probability + social clusters ✅
- pgstac catalog for Sentinel-1 + derived products ✅
- Decision log captures all operator cross-source reasoning ✅
- Source attribution in all API responses (`source`, `source_url`, `data_updated_at`) ✅
- pgstac + PostGIS + TimescaleDB in one Postgres for spatial-temporal joins ✅

### Gaps
| Gap | Impact | Effort | Priority |
|-----|--------|--------|----------|
| **Social signal pins on map** — stored in `social.signals` with `district_id`, but no map layer. Clustered pins by triage label would close the C3 loop visually. | C3 +0.3, C4 +0.2 | 3h | **HIGH** |
| **Population exposure linked to alerts** — annotate each alert with estimated population at risk. | C3 +0.2 | 2h | HIGH |
| ~~**SSE push for new alerts**~~ | ✅ **DONE** Session 2 — app-shell-level, map refreshes | — | — |

---

## C4 — Usability (current: 3.5 / 5.0) ← biggest lever

### What we have
- Full responsive layout (375px mobile / 768px tablet / 1440px desktop) ✅
- WCAG AA contrast on primary text elements ✅
- Spanish-first UI throughout ✅
- Keyboard navigation (tab, aria-expanded, aria-pressed, aria-label on all controls) ✅
- Decision log CSV export ✅
- Scenario panel: district selector + time window + layer toggles ✅
- DataFreshnessBar showing data age per layer ✅

### Gaps
| Gap | Impact | Effort | Priority |
|-----|--------|--------|----------|
| ~~**2017 El Niño replay tutorial modal**~~ — replaced with driver.js 7-step spotlight walkthrough | ✅ **DONE** Session 2 | — | — |
| ~~**WCAG AA Lighthouse pass**~~ | ✅ **DONE** Session 2 — 100/100 | — | — |
| ~~**2017 El Niño replay backend**~~ — ScenarioPanel `ReplayDateScrubber` (5 steps Mar–Apr 2017), pre-baked SAR fixtures in `ml.flood_polygons`, `replay_at` param in `/layers/flood` | ✅ **DONE Session 3** | — | — |
| ~~**Social signal map pins**~~ | ✅ **DONE** (map layer with clustering + color by triage label) | — | — |
| **PWA: service worker** — `sw.js` updated in Session 3. Verify offline caching in Chrome DevTools. | C4 +0.1 | 30min | Low |
| **English toggle (i18n)** — BRIEF requires `next-intl`. Currently Spanish-only; i18n keys scaffold in `lib/i18n.ts`. | C4 +0.3 | 4h | Medium |
| **"About this data" UI panel** — `DataSourcesPanel.tsx` exists; verify all 8 data sources listed with attribution. | C4 +0.05 | 30min | Low |

---

## C5 — Scenario Fit (current: **5.0** ✅)

### What we have
- Lima Metropolitana only (43 districts), no scope creep ✅
- Primary scenario: flood + huayco from El Niño Costero ✅
- SINAGERD workflow: COEN/COER Lima operational context ✅
- EDAN-Perú format CSV export from decision log ✅
- Quebrada prioritization (10 high-risk: Pedregal, Quirio, Carossio, Huaycoloro, etc.) ✅
- Responsible data handling (Ley 29733 + OCHA + IASC) ✅
- SINPAD 18-year event history for historical context ✅
- ~~**2017 El Niño replay**~~ ✅ **DONE Session 3** — 5 pre-baked SAR flood events, date scrubber, end-of-day replay_at fix
- Population at risk per flood polygon ✅ **DONE Session 3**

### Remaining gaps
| Gap | Impact | Effort | Priority |
|-----|--------|--------|----------|
| **Population exposure** — "how many people are affected" is the most operationally meaningful metric for SINAGERD managers. See C2. | C5 +0.3 | 2–3h | **HIGH** |
| **r.avaflow simulation** — BRIEF specifies on-demand debris flow physics for top-10 quebradas. Very complex (GRASS container). Pre-compute one simulation snapshot for demo. | C5 +0.2 | 3+ days | Low (post-submission) |

---

## Deployment Gate — BLOCKING ALL SCORING

> Without a public URL, judges cannot evaluate the platform.

| Item | Status | Action |
|------|--------|--------|
| **VPS with public IP** | ❌ Not deployed | Hetzner CX32 €11/mo or DigitalOcean $20/mo |
| **TLS / HTTPS** | ❌ Not deployed | Caddy auto-HTTPS — `Caddyfile` is ready |
| **`docker-compose.prod.yml`** | ✅ Written | `scripts/deploy.sh` ready |
| **DNS record** | ❌ Not configured | Point domain to VPS IP after provisioning |
| **Ollama model on VPS** | ❌ Not deployed | `docker exec ollama ollama pull gemma4:e4b` (9.6GB, one-time) |
| **SINPAD data on VPS** | ❌ Not deployed | Run `scripts/load_sinpad.py` post first `compose up` |

---

## Prioritized Action List

Ordered by rubric impact ÷ effort. Excludes demo video.

| # | Item | Rubric gain | Effort |
|---|------|------------|--------|
| 1 | **Public VPS deployment** | Unblocks all scoring | 1 day |
| 2 | **2017 El Niño replay + tutorial** | C4 +0.8, C5 +0.5 | 1 day |
| 3 | **Population exposure per flood polygon** | C2+C3+C5 +0.9 total | 2–3h |
| 4 | **Social signal pins on map** | C3+C4 +0.5 total | 3h |
| 5 | **PWA manifest + service worker** | C4 +0.4 | 2h |
| 6 | **WCAG AA Lighthouse pass** | C4 +0.2 | 2h |
| 7 | **WebSocket/SSE live alerts** | C1+C3 +0.5 total | 3h |
| 8 | **"About this data" UI** | C4 +0.1 | 1h |
| 9 | **English toggle (i18n)** | C4 +0.3 | 4h |
