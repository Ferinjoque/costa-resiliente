# Costa Resiliente: Phase 3 Readiness Audit

> Independent, evidence-based audit against the official IEEE Response Quest 2026 rules and rubric.
> Performed: 2026-08-30. Branch `develop` @ `be60bbb`. Stack running locally, reseeded before evaluation.
> **This document is deliberately adversarial.** It assumes a judge is trying to find the weakest claim.
>
> Every finding below cites a live artefact (endpoint response, DB query, test run, source line, screenshot),
> not project documentation. Where docs and system disagree, the system wins.

---

## Remediation status (2026-08-30, same day)

Everything except the video has been fixed. Verified green afterwards:
**768 API** (was 719, +49 new), **182 worker**, **21 web unit**, **0 TypeScript errors**,
**25/25 Playwright** (was 1 failed / 24 not run).

| ID | Finding | Status |
|----|---------|--------|
| B-1 | Demo video | ❌ **Still open.** Owner is doing this. Only remaining hard blocker. |
| B-2 | Browser suite red | ✅ Fixed. Two separate bugs: a cold-start hydration race in `auth.setup.ts`, and a genuinely flaky badge test whose route stub never matched. 25/25 green, verified repeatedly. |
| B-3 | No current weather | ✅ Fixed. Open-Meteo ingest (keyless, free, 15-min), `hydro.weather_observations`, `/api/v1/layers/weather`, HUD temperature chip, and heat/cold/wind/fog/thunderstorm/heavy-rain warnings thresholded for Lima's climate. |
| C-1 | Huayco fixtures attributed to XGBoost | ✅ Fixed. Stamp renamed `xgboost-v0.1-demo-refresh` → `scenario-fixture-v1`; false attribution removed from alert prose (0 rows remain); `is_demo_data` exposed per feature and per collection; map popup, copilot, SITREP and EDAN exports all disclose. Labelling **fails closed** on unstamped rows. |
| C-2 | IMERG Late sold as near-real-time | ✅ Fixed in docs; Open-Meteo is now the genuinely live feed. |
| C-3 | pgstac claimed populated | ✅ Fixed. Docs state it is empty and why. |
| C-4 | Reddit/Telegram marked Active | ✅ Fixed. Both marked best-effort; health endpoint already reported the truth. |
| C-5 | "Schools and substations claimed but absent" | ⚠️ **This finding was wrong — see correction below.** A real, worse bug was found in its place and fixed. |
| C-6 | No in-product limitation disclosure | ✅ Fixed. "Limitaciones conocidas" block in the Fuentes de datos panel, 5 entries, bilingual. |
| C-7 | STATUS.md self-scoring 25/25 | ✅ Fixed. Self-score deleted, test counts corrected. |
| C-8 | Reseeding duplicated alerts | ✅ Fixed. Seeding is idempotent against open alerts; verified with 3 consecutive reseeds, 0 duplicate active titles. |
| C-9 | 890 unstamped huayco rows | ✅ Fixed. Backfilled; API also fails closed on NULL. |
| C-10 | SAR offline, disclosed | ✅ Was already defensible; now also disclosed in-product. |
| P-1 | Mojibake in 14/20 shelters | ✅ Fixed. Repair migration; full-database scan now returns 0 across every table. |
| P-2 | Duplicate skip links | ✅ Fixed. |
| P-3 | Malformed province label | ✅ Fixed; count derived, not hardcoded. |
| P-4 | Mobile map invisible | ✅ Fixed. Panel collapses below `sm` and is height-capped; map visible on landing. |
| P-5 | Cluttered default map | ✅ Fixed. Defaults curated to districts + SAR + huayco + gauges. |
| P-6 | Null gauges, duplicate "Chosica" | ✅ Fixed. Scenario gauges renamed "(escenario)" and flagged; missing readings show as a gap, not a zero. |
| P-7 | `risk-summary` at 1.18 s | ✅ Fixed. Bbox pre-filter restores index use: **1.70 s → 0.16 s**, identical 61 rows. |
| P-8 | "sin datos" on first paint | ✅ Fixed. Loading state is now distinct from empty. |

### Correction to finding C-5

**The original C-5 was wrong.** It claimed schools and substations were absent from
`geo.infrastructure`. They are not: the table holds **43,216 points** — substation 24,368,
school 16,044, hospital 1,668, bridge 768, fire_station 224, police_station 141,
relief_warehouse 3. The audit inferred absence from the API response, which is capped at 2,000
rows. The docs and UI claims were accurate.

The cap was hiding a **worse** bug than the one reported. `/layers/infrastructure` ordered
`BY i.type` — alphabetically — so `bridge` and `fire_station` consumed 992 slots and hospitals
took the rest. Schools, substations, comisarías and INDECI warehouses **never reached the map at
all**, and the documented "sorted by criticality, hospitals first" behaviour was not happening.
Fixed by ordering on an explicit criticality rank (hospital → relief_warehouse → fire_station →
police_station → bridge → school → substation) and returning `total_available` and `truncated`
so the response admits what it is withholding. All 1,668 hospitals, all fire stations, all
comisarías and all INDECI warehouses now survive the cap.

Two further overclaims were found and fixed while remediating, neither in the original audit:

- `TutorialOverlay` told every new operator that *"cada capa, alerta y decisión que ves aquí se
  basa en datos reales del SENAMHI, INDECI y observaciones SAR Sentinel-1"* — a blanket assertion
  that the fixtures were real data, shown during onboarding.
- `SituationBrief` and `DistrictDashboardPanel` (including the EDAN-Perú Markdown and HTML
  exports) asserted "SAR Sentinel-1 detecta X km²" over fixture extents. All now switch on
  `is_demo_data`.

---

## 0. Verification basis

Sources of truth read first, in full:

- `ieee-competition-rules/response-quest-challenge-rules.txt` (Official Rules, updated 13 April 2026)
- `ieee-competition-rules/response-quest-rubric.txt` (5 criteria, equally weighted, 1-5)
- `ieee-competition-rules/additional-information-for-response-quest-participants_00001.txt`
- `ieee-competition-rules/ieee-response-quest-challenge-2026-timeline_00001.txt`

### What the rules actually require for Phase 3

Rules §7, Phase 3 (Product Submission), verbatim requirement set:

1. "a working demonstration of their concept"
2. "**including a two-to-five-minute video showing a real person using or interacting with the product**
   in a manner that enables judges to understand how the interface functions in practice"
3. "The video must clearly demonstrate the core functionality of the product."
4. "Optional supporting materials may be included at the Entrant's discretion."
5. Finalists "may be invited to present their solution remotely, and participation in such a presentation
   **shall be required if requested**."

**Confirmed: a hosted public URL is NOT required.** The words "host", "deploy", "URL", and "live site" do not
appear as requirements anywhere in the Official Rules. `docs/COMPETITION.md` calling a public VPS deployment
"the sole remaining gap" is wrong in **both** directions: it is not required, and it is not the only gap.

Caveat that raises its priority anyway: the remote finalist presentation is **mandatory if requested**, and a
laptop-only stack is a single point of failure for that. Treat hosting as risk reduction, not compliance.

### The "Additional Information" deliverables list is a de-facto checklist

This document is not the rubric, but it is organiser-authored and states hard expectations using the word
**"Must"**. Judges drawn from "disaster response, GIS, emergency management" (Rules §9) will read it as a
requirements list. Scored against it:

| Organiser "Must" | Status | Evidence |
|---|---|---|
| Single UI in standard browsers | OK | Next.js PWA, renders in Chromium at 1440x900 |
| Scales to desktop, tablet, **phone** | **FAILS on phone** | At 375x812 the Escenario panel fills the entire viewport; map not visible (Finding P-4) |
| No significant training required | PARTIAL | Tutorial exists, but default map state is visually overwhelming (Finding P-5) |
| Display data for a user-selected region | OK | Province + district/watershed selectors; `/api/v1/districts` (168), `/fusion/{ubigeo}` |
| Display **critical infrastructure** and its relation to the disaster | OK | `/layers/infrastructure` = 2000 features: hospital 1008, bridge 768, fire_station 224 |
| Display **current weather conditions** and precipitation | **HALF** | Precipitation OK (IMERG). Current conditions absent - no temperature, wind, or humidity anywhere (Finding B-3) |
| Weather warnings (heat/cold/fog/wind/thunderstorm) | **MISSING** | Not implemented |
| Near-real-time display | PARTIAL | Architecture yes; live feeds currently stale/offline (Findings C-2, C-3) |
| Consider hosting and operating cost | **STRENGTH** | 9-container stack, <$25/mo VPS target, zero paid API dependency, local Ollama |

---

## 1. Rubric scorecard

Self-assessed against the five official criteria. Scores are deliberately conservative and reflect **what a
judge can verify in a 2-5 minute video plus a repo skim**, not what the code is capable of.

`docs/STATUS.md` currently self-reports **25.0 / 25**. That number is not defensible and should be removed
before submission - see §5, "What a judge will probe first".

### C1: Timeliness, Real-Time Responsiveness & Technical Reliability - **3.5 / 5**

**Evidence for:**

- API latency measured live, all endpoints authenticated:

  ```
  health                  0.005s
  alerts                  0.008s
  fusion/150132           0.017s
  layers/stations         0.020s
  layers/flood/latest     0.029s
  layers/infrastructure   0.073s
  districts/risk-summary  1.179s   <- only outlier
  ```

- 719 API tests pass, 182 worker tests pass (0 failures), both re-run for this audit.
- SSE stream endpoint present (`/api/v1/alerts/stream`); freshness bar resolves correctly at desktop
  ("IMERG hace 6 min | SAR hace 2h | HUAYCO hace 10 min", screenshot `audit-03-desktop-1440.png`).
- `/api/v1/health` answers a full operational picture in one call (5 ms).

**Evidence against:**

- `/api/v1/health/scraper` **self-reports `overall_status: "stale"`**, with SAR `"offline"`
  (`last_seen_at: 2026-05-18`, i.e. 3.5 months) and bluesky/rss/reddit/telegram all `"stale"`.
  This honesty is a C3 strength but a C1 liability: on judging day the product's own health endpoint says
  most feeds are not current.
- **IMERG is the Late Run**, not Early. `apps/workers/.../ingest/imerg.py:1,35` →
  `IMERG_BASE_URL = "https://gpm.nasa.gov/data/imerg/late"`. Late Run latency is ~12-14 h.
  `COMPETITION.md` Phase 2 text claims "IMERG Early Run V07B" and C1 claims "IMERG every 30 min".
  30 min is the product's *temporal resolution*, not its *availability latency*. A remote-sensing judge
  will know this. (Finding C-2.)
- **The browser test suite is red** (Finding B-2) - reliability claim is unverified end-to-end.
- 12 of 15 stations return `level_m: null` and are 6 days stale; only the 3 seeded ones carry readings.

**To reach 5:** one source demonstrably live *during the video*, with a visible timestamp advancing.

### C2: Comprehensiveness, Use of Available Data & Novel Data Discovery - **4.0 / 5**

Rubric's 5 requires: "Integrates multiple relevant data sources, **clearly explains limitations**, and
meaningfully incorporates new or underutilized data."

**Evidence for:**

- Genuine breadth, verified by row counts:

  ```
  historical.sinpad_events     2063 rows (matches the claimed 2,063 Lima records)
  geo.infrastructure           2000+ served (real OSM, osm_id present)
  hydro.imerg_accumulations    6183 rows
  hydro.station_observations   2148 rows
  rag.documents                  85 chunks
  geo.districts                 168 (43 Lima + 7 Callao + 118 Lima Region)
  social.signals               8 distinct sources
  ```

- Population coverage is exactly right, not padded: 50 of 168 districts carry population - precisely
  Lima province (43) + Callao (7), the declared in-scope area. Good discipline.
- Genuinely novel choices: Bluesky Jetstream firehose, SINPAD 18-year event density as a reproducible
  hazard proxy in place of SSO-gated SIGRID.
- `docs/data-sources.md` lines 154-176 are **exemplary** on limitations: it states the Sen1Floods11 repo
  returns HTTP 401, that no publishable SAR checkpoint exists, and that huayco values are demonstration
  values. This is exactly the rubric's "clearly explains limitations".

**Evidence against:**

- **That honesty does not reach the product.** The in-app "Fuentes de datos" panel
  (`DataSourcesPanel.tsx`, 443 lines) has **zero** mention of demo data, model limitations, or the SAR
  checkpoint gap - grep for `demo|sintétic|limitac|calibrad` returns nothing. Judges watch the product,
  not the docs.
- `pgstac.collections = 0` and `pgstac.items = 0`. Contradicts `data-sources.md:43`
  ("Running; scenes registered on ingest") and COMPETITION.md ("pgstac bootstrapped ... now ingest new
  scenes"). No Sentinel-1 scene has ever been catalogued.
- Reddit / Telegram / RSS signals in the DB are **seeded fixtures**, not ingests
  (`auto_seed.py:331,339,355,363,379,387`). `data-sources.md` marks them "Active".
- UI overstates OSM coverage: the panel says "Hospitales, escuelas, puentes, **subestaciones**, bomberos"
  and the map layer says "Hospitales, **colegios**, puentes". The DB has **only** hospital, bridge,
  fire_station. No schools, no substations. `data-sources.md:202` repeats the substations claim.

**To reach 5:** move the limitations text into the product, and correct the three overstatements.

### C3: Integration, Synthesis Quality & Responsible Data Handling - **4.0 / 5**

**Evidence for - this is the strongest verified area:**

- **Append-only decision log is real and enforced in the database**, not aspirational. Verified by reading
  the trigger definition (no mutation attempted):

  ```
  trigger:  decision_log_no_update
  function: prevent_decision_log_mutation
  body:     BEGIN RAISE EXCEPTION 'decision_log is append-only ... DELETE and UPDATE are forbidden'; END;
  ```

- `presidio_analyzer` genuinely installed in the worker container and imported in
  `ingest/social.py`, `ml/triage.py`, `ai/guardrails/output_filter.py`.
- Real multi-source synthesis, verified by live copilot call - the SITREP fused **6 tools in one pass**:

  ```json
  [{"tool":"get_active_alerts"},{"tool":"get_rainfall_accumulation"},{"tool":"get_river_levels"},
   {"tool":"get_flood_polygons"},{"tool":"get_huayco_risk"},{"tool":"get_social_clusters"}]
  ```

  returning a cited Spanish narrative with `sources[]` carrying row ids and `source_refs`.
- Flood-polygon provenance disclosure is correctly implemented (`MapView.tsx:336-346`): it flags
  `demo`/`fixture` model versions and prints *"Datos de demostración, no es una detección real"*.

**Evidence against:**

- **The provenance discipline applied to flood polygons is not applied to huayco.** See Finding C-1 -
  the single most serious item in this audit.
- `/health/scraper` honesty is excellent; the in-product surface is less so.

### C4: Usability, Clarity & Operational Readiness for Emergency Responders - **3.5 / 5**

Rubric 5 requires "Intuitive, easy to learn ... **well-documented and safe for operational use**".
Rubric 2 ("Limited") is literally "**Confusing or cluttered**".

**Evidence for:**

- At 1440x900 it reads as real operations software, not a template (`audit-03-desktop-1440.png`):
  persistent left rail, SINAGERD HUD with EMERGENCIA state, live ticker, freshness bar, legend, scale bar.
- Keyboard affordances shown in the a11y tree (`Mapa [M]`, `Alertas [A]`, `Consultar [C]`).
- Role-scoped auth with three real SINAGERD roles; gated items announce themselves
  ("Registro. Requiere sesión") rather than failing silently.
- Sensible mobile information architecture exists (bottom tab bar at 375).
- Operator runbook, architecture doc, responsible-data doc all present.

**Evidence against:**

- **Phone layout is broken** (`audit-04-mobile-375.png`): landing on the "Mapa" tab at 375x812 shows the
  Escenario panel occupying 100% of the viewport. The map - the primary surface - is invisible.
  The organiser doc says the UI "Should scale to desktop, tablet, and phone".
- **Default map state is cluttered** to the point of the rubric's "Limited" descriptor: all nine layers on
  simultaneously produces several hundred overlapping dots plus large translucent IMERG grid rectangles and
  angular SINPAD hazard polygons that obscure district boundaries.
- **Duplicate skip links**: `layout.tsx:63` renders "Saltar al contenido principal" and `page.tsx:129`
  renders "Skip to main content" - both present in the DOM simultaneously, both targeting `#main-content`,
  one not localised. Contradicts the "Lighthouse 100/100 accessibility" claim in spirit.
- **Mojibake in operator-facing data**: 14 of 20 shelters corrupted in the database
  (`Parque de la Exposici??n`, `Colegio Julio C??sar Tello`, `Estadio Jos?? G??lvez`, ...), plus 1 district
  and the append-only trigger's own message. Verified as stored corruption, not a display issue
  (`octet_length = length = 25`), and isolated to `geo.shelters` (district names elsewhere render `Ancón`,
  `Jesús María` correctly).
- Malformed control label: province selector reads `Lima Región (todas (159 dist.)` - unbalanced paren,
  and 159 disagrees with the 168 rows actually returned.

### C5: Scenario Fit, Insightfulness, Innovation & Technical/Data Creativity - **4.5 / 5**

**Evidence for - the strongest criterion, and the reason this entry can place:**

- Scenario fit is specific, not generic. SINAGERD tiering (COEN/COER/COEL), 10 named priority quebradas,
  EDAN-Perú export, ANA thresholds (25/50 mm/72 h) wired into alert logic, three real watersheds.
- The copilot output is genuinely insightful and operationally shaped - it ends with a directive, not a
  data dump: *"Activar protocolo EDAN y escalar a COEN ... Activar evacuación preventiva quebradas cuenca
  Rímac ... activar brigadas de campo."*
- Real technical creativity: a fully local agentic stack (Ollama qwen2.5 + gemma2 guardrail + nomic
  embeddings), pgvector RAG over Peruvian protocols, one Postgres carrying PostGIS + TimescaleDB + pgstac +
  pgvector, HITL alert proposals so no AI-authored alert reaches the feed unapproved.
- Zero paid API dependency is a real humanitarian-sector argument, not a limitation.

**Evidence against:**

- The headline ML claims are the weakest verified part of the system (C-1, C-2).

### Total: **19.5 / 25** (avg 3.9)

Phase 2 scored 4.26/5 on concept. The product as it stands would likely score **at or slightly below** its
concept score, because Phase 3 raises the bar from "articulation" to "implementation", and the two ML
pipelines that carried the concept's innovation narrative are not demonstrable.

---

## 2. Gap list

### Tier 1 - Hard blockers (rules require it, or it is provably broken)

| # | Finding | Evidence | Effort |
|---|---|---|---|
| **B-1** | **The 2-5 minute demo video does not exist.** Rules §7 makes it an explicit Phase 3 requirement. Without it the entry is incomplete and disqualifiable ("Entries that fail to meet any submission requirement ... may be disqualified"). | `find . -iname "*.mp4" -o -iname "*.mov" -o -iname "*.webm"` returns no results | **3-4 days** incl. script, capture, edit, captions |
| **B-2** | **Playwright browser suite is RED.** `auth.setup.ts` fails; **24 of 26 specs never run.** Believed-green status was wrong. | `1 failed / 24 did not run`; error: `locator('#cr-username') ... element(s) not found`. Root cause: commit `40536ea` ("stop the login prompt from nagging") removed the modal auto-open the setup depends on; `auth.setup.ts` last touched in `6e40ab3`, four login/rail commits ago (`40536ea`, `fc4cb9f`, `4178903`, `be60bbb`). Login modal opens correctly when driven manually, so this is a **test-harness regression, not a product regression**. Stale `e2e/.auth/coer.json` (Aug 24) may have masked it. | **2-4 h** |
| **B-3** | **No current weather conditions.** Organiser doc: "Must be able to display current weather conditions and precipitation", plus wind/fog/heat/thunderstorm warnings. Precipitation is covered; conditions are absent. | `hydro.station_observations` columns are exactly `time, station_id, level_m, flow_m3s, rain_mm, raw`. No temperature/wind/humidity column exists anywhere. `ana_scraper.py:200` parses `Temperatura(°C);Humedad(%)` from the source CSV but the schema discards them. | **2-3 days** |

### Tier 2 - Credibility risks (a judge could reasonably call these overstated)

| # | Finding | Evidence | Effort |
|---|---|---|---|
| **C-1** | **Huayco probabilities are hardcoded constants presented as model output.** Highest-severity item in the audit. The values on the map, in alerts, in the copilot and in EDAN exports come from a literal Python list, and the seeder **deliberately overwrites the real ML pipeline's output** when the model's answer is not dramatic enough. | `auto_seed.py:516-528` `_HUAYCO_SUSCEPTIBILITY = [("Pedregal", 0.91, "very_high", 12.0), ("Huaycoloro", 0.89, ...)]` written at `:770` with `model_version = 'xgboost-v0.1-demo-refresh'`. Guard comment at `:745`: *"ML pipeline can overwrite demo seed values with lower estimates. Refresh when that happens."* Live API returns exactly those constants. Unfitted model rows are a constant `0.5344`. **Operator-facing alert text asserts the attribution outright**: `"Modelo XGBoost: probabilidad 0.91"`. `data-sources.md:176` says "scoring live rainfall". | **1-2 days** |
| **C-2** | IMERG Late presented as near-real-time / "Early Run". | `imerg.py:35` `.../imerg/late`; COMPETITION.md says "Early Run V07B" and "IMERG every 30 min" | **2 h** (docs) or **1-2 days** (switch to Early) |
| **C-3** | pgstac catalogue is empty; docs claim scenes are registered on ingest. | `pgstac.collections=0`, `pgstac.items=0` | **2 h** (docs) |
| **C-4** | Reddit/Telegram/RSS marked "Active"; rows are seeded fixtures. | `auto_seed.py:331-387`; `/health/scraper` reports `stale` for all | **1 h** (docs) |
| **C-5** | UI + docs claim OSM schools and substations. Neither exists. | DB types: hospital 1008, bridge 768, fire_station 224 only. Claimed in `DataSourcesPanel.tsx:96`, map layer label, `data-sources.md:202` | **1 h** |
| **C-6** | No ML-limitation disclosure anywhere in the product. | grep of `DataSourcesPanel.tsx` for demo/limitation terms returns 0 hits | **4-6 h** |
| **C-7** | `STATUS.md` self-scores **25.0/25** and carries stale, self-contradictory test counts (707 API; and both "240 passed" and "148 passed" for workers in one file). Actual: **719 API, 182 worker, 21 unit**. A judge who spots a 25/25 self-score reads everything else more sceptically. | `STATUS.md` vs live pytest runs | **1 h** |
| **C-8** | Reseeding transiently inflates the alert queue to 20 active with **8 duplicate title pairs** (e.g. "Riesgo de huayco: Quirio" twice, 6 days apart) until auto-resolution runs. Auto-resolution **does** work - the queue settled to 9 active / 94 closed during this audit - but the window is a live demo hazard. | `select title, count(*) ... having count(*)>1` returns 8 rows immediately post-seed | **2-4 h** |
| **C-9** | 890 of 1100 `ml.huayco_susceptibility` rows carry `NULL` model_version. Latent only - the API serves the newest rows, which *are* labelled - but if a refresh fails the API silently falls back to unlabelled data. | `select model_version, count(*)` returns `<NULL>` 890 | **1 h** |
| **C-10** | SAR pipeline offline since 2026-05-18; polygons are fixtures. **Correctly disclosed** in map popup and `data-sources.md` - listed here only so it is not forgotten in the video narration. | `/health/scraper` flood `offline`; `MapView.tsx:336-346` discloses | defensible as-is |

### Tier 3 - Polish

| # | Finding | Effort |
|---|---|---|
| **P-1** | 14/20 shelters mojibake-corrupted in DB, + 1 district, + the append-only trigger message | **2-3 h** |
| **P-2** | Duplicate skip links (`layout.tsx:63` ES and `page.tsx:129` EN both rendered) | **30 min** |
| **P-3** | Malformed province label `Lima Región (todas (159 dist.)`; count disagrees with 168 returned | **30 min** |
| **P-4** | Mobile 375: Escenario panel fills viewport, map invisible on landing | **4-6 h** |
| **P-5** | Default map state has all 9 layers on, producing visual noise; curate defaults | **2-3 h** |
| **P-6** | 12/15 stations return `level_m: null`; duplicate "Chosica" ANA station row | **2-3 h** |
| **P-7** | `districts/risk-summary` at 1.18 s - the one slow endpoint, and it gates map colouring | **2-4 h** |
| **P-8** | Pre-hydration flash shows "sin datos" on all three freshness chips (resolves correctly after load, but it is the first frame - avoid in video) | **1-2 h** |

---

## 3. Prioritised plan: 5.5 weeks, solo

Working budget is roughly 5.5 weeks to 9 October. Assume ~15-20 productive hours/week, so **90-110 hours**.

### The ruthless version

Three things move the score. Everything else is noise.

1. **The video (B-1).** It is the only required artefact and the only thing every judge is guaranteed to
   consume in full. A great product with no video scores zero. A good product with an excellent video
   scores well. Highest leverage per hour by a wide margin.
2. **The truthfulness pass (C-1 through C-7).** Cheap in hours, catastrophic if skipped. A judge who
   catches `"Modelo XGBoost: probabilidad 0.91"` on a hardcoded constant does not deduct a few points on
   C2 - they discount the entire submission, and it puts Rules §14 (no "false, deceptive, misleading"
   content) in play. This is the single best risk-adjusted use of two days in the project.
3. **One provably live feed during the video.** Converts C1 from an architecture claim into a demonstrated
   fact. IMERG Early Run or the ANA scraper - pick whichever is more reliable and show a timestamp
   advancing on camera.

### Feels productive, does not move the score - **cut these**

- **Hunting a publishable Sen1Floods11 SAR checkpoint.** The repo 401s; the HuggingFace Sen1Floods11
  models are Prithvi-EO optical HLS, not SAR. This is a research project, not a five-week task. The current
  disclosure is honest and defensible. **Leave it. Narrate it as a known limitation - judges reward that.**
- **Visual-regression testing.** Zero judge-visible value in this window.
- **r.avaflow physical debris-flow simulation.** Post-competition.
- **Any new panel, layer, or feature.** The surface count (9 panels, 41 endpoints, 10 sources) is already
  past the point of diminishing returns. More surface makes the video harder, not the score higher.
- **Chasing 800+ tests.** 719 passing is already strong; nobody scores test count.
- **VPS deploy** - *not* required (verified §7). Do it only if Week 5 has slack, purely as insurance for a
  mandatory finalist presentation. Do **not** let it block the video, which is what has happened so far.

### Week-by-week

**Week 1 (Sep 1-7) - Truth and integrity.** *Protects everything downstream.*

- C-1: rename `xgboost-v0.1-demo-refresh` to `scenario-fixture-v1` (drop the model name from data the model
  never produced); strip "Modelo XGBoost" from alert text; stop the seeder silently overwriting pipeline
  output, or log loudly when it does. Fix `data-sources.md:176`.
- C-6: add a "Limitaciones conocidas" block to `DataSourcesPanel` - SAR checkpoint unavailable, huayco
  values are scenario fixtures, IMERG is Late Run. **State it in the product, in Spanish and English.**
- C-2/3/4/5/7: doc and label corrections; delete the 25/25 self-score; refresh test counts to 719/182/21.
- B-2: repair `auth.setup.ts`, get 26/26 green.
- P-1/P-2/P-3: mojibake, skip links, province label.

**Week 2 (Sep 8-14) - Judge-visible surface.**

- B-3: weather conditions. Cheapest honest path is to persist the temperature/humidity the ANA/SENAMHI
  scraper already parses (`ana_scraper.py:200`) and add a HUD chip plus station popup fields. If SENAMHI is
  unreliable, Open-Meteo is free, keyless, and licence-compatible. Add simple threshold warnings.
- P-4: mobile - map visible on landing, Escenario collapsed by default below `md`.
- P-5: curate default layers (districts + alerts + SAR on; IMERG grid, SINPAD hazard, infrastructure off).
- P-8: eliminate the "sin datos" first paint.

**Week 3 (Sep 15-21) - Make timeliness real, then freeze.**

- Get IMERG Early Run or the ANA scraper genuinely running on schedule, and prove it with an advancing
  timestamp.
- C-8: make reseeding idempotent so the demo queue never shows duplicates.
- P-6/P-7: station nulls, `risk-summary` latency.
- **Feature freeze Friday 19 Sep.** Nothing new after this date.

**Week 4 (Sep 22-28) - The video.**

- Script, rehearse, capture, edit, subtitle (Spanish audio plus English subtitles, or vice versa).
- Full dry run of the demo path on a clean seed, twice, before recording.

**Week 5 (Sep 29 - Oct 5) - Buffer and supporting materials.**

- Re-cut video from feedback. README rewrite aimed at judges (a repo skim is the second thing they do).
- Optional: VPS deploy if and only if the video is finished.

**Week 6 (Oct 6-9) - Submit early.**

- Submit by **Tuesday 7 October**. IEEE's server is the official clock; do not test the deadline.

---

## 4. Video shot list

Constraints from the rules: **2-5 minutes**, must show **a real person using or interacting with the
product**, must **clearly demonstrate core functionality**. Target **4:30**. Show a face or hands and a
cursor - a pure screencast with voiceover arguably fails "a real person using or interacting with".

Structure follows the duty officer's real decision sequence, and each beat is keyed to a rubric criterion.

| # | Time | Shot | Rubric target | Narration beat |
|---|---|---|---|---|
| 1 | 0:00-0:20 | Person at desk, product on screen. Cut to full dashboard at 1440x900, EMERGENCIA state visible. | C5 | "I'm a COER Lima duty officer. It's 3 a.m. in an El Niño Costero event. Here is what I currently do not have." Name the 2017 baseline: 1.6 M affected, response coordinated by email and WhatsApp. |
| 2 | 0:20-0:50 | Freshness bar close-up (IMERG hace 6 min). Open **Fuentes de datos**; scroll all 10 sources; **land deliberately on the Limitaciones block**. | **C1, C2, C3** | "Ten sources. Here is exactly how fresh each one is - and here is what this system does *not* know." **Say the SAR checkpoint and huayco fixture limitations out loud.** This is the highest-value 15 seconds in the video. |
| 3 | 0:50-1:20 | Scenario panel: select province, then district, then time window. Layers toggle on one at a time, never all at once. Click a SAR polygon; popup shows *"Datos de demostración, no es una detección real"*. | C2, C4, **C3** | "Region selection. Layer control. And every polygon declares its own provenance." Showing the honesty label on camera is a *strength*, not a confession. |
| 4 | 1:20-1:50 | Map: infrastructure layer, hospitals near flood extent. Weather/precipitation chip. Brief 3D extrusion. | C2, **organiser Must-list** | Explicitly name critical infrastructure and current weather - the judge is ticking a checklist. |
| 5 | 1:50-2:35 | **Consultar** panel. Type the start-of-shift question in Spanish. Show the ~6 s SITREP land. Scroll the cited sources. | **C5, C3** | "One question, six database tools, one answer - and every number traces to a row. This runs entirely on local models. No cloud API, no per-query cost, no citizen data leaving the building." **This is the differentiator. Give it the most time.** |
| 6 | 2:35-3:15 | Alerts feed: acknowledge, then escalate. SLA indicator. Show HITL proposals panel: an AI-proposed alert requiring human approval. | **C4, C3** | "No AI-authored alert reaches the operational feed without a human approving it." Judges in emergency management care about this more than model accuracy. |
| 7 | 3:15-3:45 | Decision Log: the actions just taken, attributed to the operator. Export EDAN-Perú PDF; show the PDF. | **C4, C5** | "Append-only, enforced by the database - an operator cannot rewrite the record. And it exports in the format COEN already uses." |
| 8 | 3:45-4:10 | Pick up a phone, same URL, show the mobile layout working. | C4, **organiser Must-list** | Only include this shot **after P-4 is fixed.** If it is not fixed, cut the shot - do not show a broken phone view. |
| 9 | 4:10-4:30 | Back to the person. Cost line on screen: 9 containers, <$25/month, Apache 2.0, zero paid APIs. | C1, C5 | "A regional emergency office in a middle-income country can run this for the price of a phone plan." Close on the honest limitation and the roadmap. |

**Production rules:**

- Record on a **freshly seeded, settled** stack (wait for auto-resolution; verify no duplicate alert titles).
- Wait for full hydration before rolling - never capture the "sin datos" first paint.
- Spanish audio with English subtitles is the stronger choice: it demonstrates the Spanish-first design
  claim and reads as authentic to the deployment context. Ensure subtitles are burned in.
- Do not narrate anything this audit flagged as overstated. If in doubt, say less.

---

## 5. What a judge will probe first

Ordered by how quickly a competent judge finds it.

1. **"Is the ML real?"** They will click a huayco point and a SAR polygon. SAR passes - the popup declares
   itself. **Huayco currently does not.** Until C-1 is fixed, the alert text
   `"Modelo XGBoost: probabilidad 0.91"` sits on a hardcoded `0.91`. This is the one finding with the
   potential to sink the entry, and it is a 1-2 day fix. Do it first.
2. **"How fresh is the data, really?"** They will open Fuentes de datos or hit `/api/v1/health/scraper`.
   It answers `overall_status: "stale"`, SAR `offline` since May. Get ahead of this by narrating it - the
   rubric explicitly rewards "clearly explains limitations". Honesty scores here; being caught does not.
3. **"Does it work on my phone?"** Ten seconds to check, currently fails.
4. **"Does the repo match the claims?"** `STATUS.md` says **25.0/25** and carries stale test counts. Nothing
   invites scepticism faster than a self-awarded perfect score. Delete it.
5. **"Is this near-real-time or a scripted demo?"** Everything currently displayed comes from
   `auto_seed.py` (1527 lines of fixtures). A curated demo scenario is legitimate and necessary for a
   reproducible video - but it must be *labelled*, and at least one feed should be visibly live.
6. **"Where is the weather?"** The organiser doc says "Must". There is precipitation but no conditions.
7. **Small things that cost trust disproportionately:** `Parque de la Exposici??n` in a shelter list, a
   duplicate skip link, `Lima Región (todas (159 dist.)`, schools and substations claimed but absent.

---

## 6. Honest ceiling

**Realistic outcome if only the video is made and nothing else changes:** mid-3s per criterion,
**~18-19/25**. Likely below the 4.26 concept score, because Phase 3 tests implementation and the two ML
pipelines that carried the concept narrative are fixtures.

**Realistic outcome if the Week 1-3 plan is executed:** **21-22.5/25**. Competitive for an **Honorary
Mention** (up to $25,000 combined, explicitly for "exceptional performance on one or more evaluation
criteria" - C5 and C3 are the plausible standouts) and a credible outside shot at **Judge's Choice**
($10,000), which is awarded qualitatively "in a manner not fully captured by the scoring rubric". The
fully-local, zero-cost, privacy-preserving agentic stack for a middle-income-country emergency office is
exactly the kind of thing a Judge's Choice exists to recognise.

**What would have to be true for first place ($30,000):**

1. **At least one ML model genuinely trained and validated**, with a reported metric on held-out data - the
   huayco XGBoost fitted on a SINPAD-derived Lima inventory is the achievable one. A judge cannot award
   5/5 on "technical creativity" for a pipeline whose outputs are constants.
2. **Demonstrably live near-real-time**, not architecturally capable of it. IMERG Early plus ANA running on
   schedule, with data visibly changing during the demo.
3. **Weather conditions and warnings**, closing the last organiser "Must".
4. **Flawless on phone and desktop**, because Usability and Operational Readiness is 20% of the score and
   is the criterion judges feel most confident scoring.
5. **Evidence of contact with a real responder.** Nothing in the repo shows a SINAGERD, COER, or INDECI
   officer has ever used this. A single documented feedback session - even 30 minutes, even informal,
   quoted in the README and the video - would do more for "Operational Readiness for Emergency Responders"
   than any feature. **This is the cheapest unclaimed point in the entire project**, and the one thing a
   solo entrant can plausibly still get in five weeks.

**Blunt assessment.** The engineering here is well above typical hackathon standard: 719 passing tests, a
DB-enforced append-only audit trail, a working six-tool agentic SITREP running entirely on local models, and
genuine scenario depth. The gap between this and a winning entry is **not more engineering** - it is
truthful labelling, one demonstrably live feed, a phone layout, and evidence that a real responder has
touched it. All four are achievable in the time remaining. Building anything new is not.

---

## Appendix: competitive benchmarking

Attempted, with a negative result worth recording. Phase 3 closes 9 October 2026 and judging runs
November-December, so **no Response Quest finalist or product submission is public**, and IEEE has not
published judge identities or worked examples. Searches of IEEE Systems Council, IEEE EPS, and general
humanitarian-data-challenge sources returned only promotional material; `ieee.org/response-quest-challenge`
and the Systems Council article are not machine-fetchable (403 / empty body).

Conclusion: there is no competitor set to benchmark against. **The rubric text and the organiser
"Additional Information" Must-list are the only authoritative signals**, which is why this audit weights
them so heavily. General humanitarian-sector judging guidance (OCHA Centre for Humanitarian Data quality
measures; UNDP crisis-data challenge criteria) consistently emphasises the same axes the rubric names -
relevance, accuracy, timeliness, interpretability, and integration of crowdsourced with satellite data -
which the plan above already targets.

---

*Audit performed against a live stack. No code was modified, nothing was committed, no data was deleted.
Screenshots referenced: `audit-01-map-default.png`, `audit-02-freshness.png`, `audit-03-desktop-1440.png`,
`audit-04-mobile-375.png` (Playwright output directory, untracked).*
