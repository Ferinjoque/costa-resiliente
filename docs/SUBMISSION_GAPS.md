# Submission Gaps — Costa Resiliente

> Rubric-mapped gap analysis against IEEE Response Quest 2026 Phase 3 criteria.
> Last updated: 2026-05-13.
> Score scale: 1–5 per criterion. Total: 25.

---

## Score Summary

| # | Criterion | Current | Target | Gap |
|---|-----------|---------|--------|-----|
| C1 | **Timeliness** — data latency, refresh cadence | 4.0 | 5.0 | WebSocket live push |
| C2 | **Comprehensiveness** — source coverage | 4.5 | 5.0 | Population exposure |
| C3 | **Integration** — data fusion depth | 4.5 | 5.0 | Social pins on map |
| C4 | **Usability** — UX, PWA, accessibility, tutorial | 3.5 | 5.0 | Tutorial, PWA, i18n |
| C5 | **Scenario Fit** — Lima flood/huayco operational relevance | 4.0 | 5.0 | El Niño replay |
| | **Total** | **20.5 / 25** | **25 / 25** | |

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
| **WebSocket live push** — currently all layers are poll-on-load; operator must manually refresh. Architecture diagram shows `/ws` but SSE for alerts ticker not fully wired to map refresh. | C1 +0.5 | 3h | Medium |
| **ANA scraper fragility** — documented known fragility (no public REST API; HTML scraping). Add retry-and-alert if scraper returns 0 rows for >2h. | C1 +0.2 | 1h | Low |

---

## C2 — Comprehensiveness (current: 4.5 / 5.0)

### What we have
- Sentinel-1 SAR flood segmentation ✅
- NASA IMERG rainfall (6 accumulation windows) ✅
- ANA + SENAMHI hydrometeorological stations ✅
- OSM critical infrastructure (hospitals, schools, bridges, substations, fire stations) ✅
- Lima districts + 3 watersheds + 10 quebradas ✅
- Social signals: Bluesky + RSS (6 feeds) + Reddit (3 subreddits) + Telegram (SENAMHI) ✅
- SINPAD historical events 2003–2020 (2,063 Lima flood/huayco records) ✅
- Hazard zones: 50 districts classified by SINPAD event density (flood + landslide) ✅
- INEI 2017 census at district level ✅

### Gaps
| Gap | Impact | Effort | Priority |
|-----|--------|--------|----------|
| **Population exposure per flood polygon** — spatial join `ml.flood_polygons × geo.districts × population` to compute "this flood affects ~X people in district Y". API + UI. Very high judge impact. | C2 +0.3, C3 +0.3, C5 +0.3 | 2–3h | **HIGH** |
| **CENEPRED SIGRID native polygons** — current hazard layer is SINPAD-derived. SIGRID requires SSO auth that cannot be replicated via API (returns 401). Fallback is honest and useful but native polygons would score higher. | C2 +0.2 | Blocked (SSO auth) | Low |
| **IGP seismic feed** — `ultimosismo.igp.gob.pe`; multi-hazard context. Secondary to flood/huayco. | C2 +0.1 | 2h | Low |
| **INEI census at manzana resolution** — currently district-level. Sub-district population improves exposure estimates. | C2 +0.1 | 4h | Low |

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
| **SSE push for new alerts** — alerts appear in AlertsPanel but only on initial load. Push new alerts via Server-Sent Events. | C3 +0.2, C1 +0.3 | 3h | Medium |

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
| **2017 El Niño replay tutorial** — BRIEF specifies "15-minute interactive tutorial keyed to a synthetic 2017 Coastal El Niño replay". SINPAD 2017 Lima data is loaded. Needs: time-slider in ScenarioPanel, pre-baked 2017 flood fixtures, guided walkthrough overlay. | C4 +0.8, C5 +0.5 | 1 day | **CRITICAL** |
| **PWA: manifest + service worker** — `next-pwa` is in `package.json`. Need `public/manifest.json` + verify SW caches last operator state for offline use. | C4 +0.4 | 2h | **HIGH** |
| **English toggle (i18n)** — BRIEF requires `next-intl`. Currently Spanish-only. | C4 +0.3 | 4h | Medium |
| **WCAG AA Lighthouse pass** — run Lighthouse, fix remaining contrast/focus/label issues. | C4 +0.2 | 2h | Medium |
| **Social signal map pins** — see C3 above. | C4 +0.2 | 3h | HIGH |
| **"About this data" UI panel** — judges need data provenance visible in the app, not only in API responses. Simple accordion/footer with source, coverage dates, and known gaps. | C4 +0.1 | 1h | Medium |

---

## C5 — Scenario Fit (current: 4.0 / 5.0)

### What we have
- Lima Metropolitana only (43 districts), no scope creep ✅
- Primary scenario: flood + huayco from El Niño Costero ✅
- SINAGERD workflow: COEN/COER Lima operational context ✅
- EDAN-Perú format CSV export from decision log ✅
- Quebrada prioritization (10 high-risk: Pedregal, Quirio, Carossio, Huaycoloro, etc.) ✅
- Responsible data handling (Ley 29733 + OCHA + IASC) ✅
- SINPAD 18-year event history for historical context ✅

### Gaps
| Gap | Impact | Effort | Priority |
|-----|--------|--------|----------|
| **2017 El Niño replay** — judges want the platform exercised in the actual scenario. SINPAD 2017 Lima data loaded. Need ScenarioPanel time-slider + pre-baked SAR flood fixtures for 2017 + guided onboarding walkthrough. | C5 +0.5, C4 +0.8 | 1 day | **CRITICAL** |
| **Population exposure** — "how many people are affected" is the most operationally meaningful metric for SINAGERD managers. See C2. | C5 +0.3 | 2–3h | **HIGH** |
| **r.avaflow simulation** — BRIEF specifies on-demand debris flow physics for top-10 quebradas triggered by IMERG threshold. Very complex (GRASS container). Pre-compute one simulation snapshot for demo instead. | C5 +0.2 | 3+ days | Low (post-submission) |

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
