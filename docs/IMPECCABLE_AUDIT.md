# Impeccable Audit — Costa Resiliente Frontend

> Output of `/impeccable audit` + `/impeccable critique` against `apps/web` at branch `develop`.
> Date: 2026-05-16. Auditor: Claude (Opus 4.7).
> Method: static read of `page.tsx`, `globals.css`, `tailwind.config.ts`, and the 7 highest-traffic components (LeftRail, AlertsPanel, OperationalHUD, SituationBrief, LiveTicker, DistrictDashboardPanel, MapView wrapper).

---

## TL;DR

Score: **6.4 / 10**.

The platform is functionally dense and information-rich, which is the right instinct for an emergency-operations console. But it currently reads as **AI-generated dashboard template**:

- one font (Inter) doing every job — body, heading, monospaced data
- a tri-tone slate palette + the standard "red/orange/yellow/green = severity" color wheel
- every card uses the same `bg-surface-raised border border-slate-700 rounded-xl` recipe
- four overlay surfaces fight for the operator's eye on the map (HUD, SituationBrief, LiveTicker, MapLegend)
- ultra-tiny type (`text-[9px]` / `text-[10px]`) is used for primary information
- emoji icons sprinkled inline (🌊 ⛰️ 📡 🆘 🚁 ✅) read as decorative, not operational

Verdict: a **type + color + hierarchy** intervention plus subtraction of one or two redundant overlays will lift the product from "looks AI" to "looks like Palantir Foundry built for SINAGERD".

---

## 5-Dimension Technical Quality

| Dim | Score | Headline finding |
|-----|-------|------------------|
| Typography | 5 / 10 | Single sans-serif; aggressive 9–11px sizing; no display family |
| Color | 5 / 10 | Stock Tailwind severity wheel; cyan-only brand; no editorial palette |
| Layout | 6 / 10 | Uniform card recipe; competing overlays on map; no rhythm |
| Motion | 7 / 10 | Reduced-motion honored, pulse uses, ticker scroll fine; over-uses `animate-pulse` |
| Hierarchy | 6 / 10 | Three "status" surfaces overlap (HUD + Brief + Ticker); little visual priority |

Overall: **5.8 / 10** → target after refactor: **8.5 / 10**.

---

## P0 — Defects to fix this sprint

### P0-1 Three overlapping situational-awareness surfaces
`OperationalHUD` (top-center pill), `SituationBrief` (bottom-right card), and `LiveTicker` (bottom strip) all carry overlapping SINAGERD level + active alert count + flood km² + affected population. On a 1280px viewport they fight for attention with the MapLegend. Pick **one** primary status surface; demote the others.

**Action:** keep `OperationalHUD` as canonical (top-anchor), retire `SituationBrief` in default view (or merge its bullets into the HUD's expandable drawer). Keep `LiveTicker` strictly for incoming events, no derived metrics.

### P0-2 Stock Tailwind palette
`severity.critical/high/medium/low` = `red-500 / orange-500 / yellow-500 / green-500` straight off the Tailwind shelf. `costa.500` = `sky-500`. Every emergency-ops dashboard on the planet uses these exact swatches. Replace with a deliberate Lima-coast set:

- **Sentinel** (data/brand): deep ocean teal `oklch(58% 0.10 220)`
- **Coast** (surface neutrals): sand-on-graphite `oklch(8–22% 0.01 60)` ramp instead of slate
- **Ochre** (high): a desaturated burnt ochre, not pure orange
- **Lava** (critical): cinnabar with a hint of brown — not `#ef4444`
- **Lichen** (ok/safe): muted sage, not `#22c55e`

Maintain WCAG AA contrast (text-on-bg ≥ 4.5:1).

### P0-3 Single font family doing every job
`var(--font-inter)` for body, headings, and operator metrics; JetBrains Mono only on tabular numbers. No display weight, no editorial contrast. Operator dashboards from disaster-ops references (NHC, NASA Worldview, BBC live) all pair a **condensed/serif headline** with a sans body.

**Action:** add a display family. Candidates: **Söhne**, **Roobert**, **GT America Condensed**, or open: **Inter Display** / **Geist** (display) + **Inter** (body) + **JetBrains Mono** (data). Reserve display weights for: SINAGERD level word, panel section titles, hero numeric metrics.

### P0-4 Sub-12px type for primary information
`text-[9px]` is used for SINAGERD chips, ticker source labels, dispatch buttons, AI recommendation badge, and stat sub-labels. WCAG 1.4.4 (resize text) tolerates small type if the user can scale, but for **operational-decision UI** these labels carry weight and should sit ≥ 11px minimum.

**Action:** raise floor to `12px` (`text-xs` 0.75rem) for any label that is read; reserve `text-[10px]` for tabular metadata only.

### P0-5 Emoji as iconography in operational rows
`🌊 ⛰️ 📡 🆘 🚧 🚁 ✅ 📨 ❌ 👁 🔺 📍` are scattered through LiveTicker, IncidentTimeline, MapView popups, AlertsPanel rows, and the EDAN report. Emoji rendering varies wildly by OS/browser, leaks personality, and instantly reads as AI-template. Replace with the existing `lucide-react` set (Waves, Mountain, Radio, AlertCircle, Truck, CheckCircle, Inbox, X, Eye, ChevronUp, MapPin) or a custom 16px icon sprite.

---

## P1 — High severity

### P1-1 Uniform card recipe
Every panel: `bg-surface-raised border border-slate-700 rounded-xl shadow-xl`. Every inner card: `bg-surface-panel rounded-lg`. No hierarchy through surface. The HUD pill, the AI recommendation, the QuickDispatch row, the metric cards, the resource bars all read at the same visual weight.

**Action:**
- distinguish **primary surfaces** (Alerts, DistrictDashboard) with a different elevation: raised + subtle inner top-light gradient + 1px bottom shadow
- distinguish **secondary surfaces** (DataSources, Share) with a flat treatment, no border
- **inline cards** (metric tiles) go borderless, separated only by gap

### P1-2 Costa logo
The inline SVG in `LeftRail.tsx` (wave + alert triangle) reads as a stock-icon mashup. For a project named *Costa Resiliente* there is an opportunity for a real wordmark or monogram. Replace with: simple **CR** monogram in a custom geometric grotesque + a single sentinel-blue accent dot, *or* a stylized contour line (Lima coast silhouette) as a 24×24 mark.

### P1-3 No empty-state design for panels
AlertsPanel "no alerts" = grey centered string. DistrictDashboard "no districts" = grey centered string. SocialFeedPanel idle = blank. Each panel needs a designed empty state (icon + headline + one-line context + faint demo CTA) — judges will sometimes land on a quiet state.

### P1-4 Animate-pulse overuse
Critical alert dots, SINAGERD dot, urgent badge, AI dot, dispatch deploying, ticker LIVE label — all use `animate-pulse`. With three or four pulsing red dots on screen the effect is noise, not signal.

**Action:** reserve pulse for the **single highest-priority alert** + the LIVE label. Lower severities → static.

### P1-5 SVG charts are functional but flat
Sparklines, BarMini, ForecastChart use raw polylines with no axes, no gridlines, no hover state, no tooltip. They communicate trend but not value at a point.

**Action:** add minimal y-axis tick labels (3 values: 0, mid, max), faint x-axis baseline, and hover dots that show exact value. Or swap for a small dependency (Visx / Recharts already on the table?). If keeping inline, at least add invisible `<rect>` per data point for hover.

### P1-6 No reference to Lima as a geography
The brand color is generic sky-blue. The palette has no nod to: the desert coast, the Pacific, El Niño, SINAGERD red. Naming a token "Costa" but using sky-blue is the AI tell.

---

## P2 — Medium severity

- **Mobile bottom nav** uses `text-[10px]` labels and `flex-1` width — labels wrap awkwardly when locale switches ES↔EN (e.g. "Consultar" vs "Ask").
- **Skip-nav link** styling is correct semantically but the focus state is sky-blue-on-costa-700 — meets AA but visually unbranded.
- **Locale toggle** is a single `Languages` icon — judges may miss it. Show current locale text (`ES`/`EN`) next to icon, or a two-letter pill.
- **Tutorial overlay** auto-opens on first visit and on `?` key — good. But there is no breadcrumb / progress dot pattern; users don't know how many steps remain. (Existing has step counter — verify visible.)
- **DataFreshnessBar** placement: it competes for the bottom strip with `LiveTicker`. Pick one bottom-anchored element.
- **FusionCallout + SituationBrief + DistrictDashboard** all surface the same fusion prose. Pick one canonical surface.
- **Toasts** slide in from right — verify they don't cover the right-anchored AlertsPanel.

---

## P3 — Low severity / polish notes

- Use of `oklch()` everywhere we currently use hex would improve perceptual uniformity across the severity ramp.
- The EDAN report copy is Spanish-only inside `buildReport()` — should branch on locale.
- Inline `style={{ width: ${pct}% }}` on the resource bars — use Tailwind arbitrary or CSS custom prop (`--w`).
- `_actionId = 700` mutable module-level counter is fragile across HMR; use a ref or store.
- `role="marquee"` is non-standard ARIA — use `role="region" aria-live="polite"` for the ticker.

---

## Persona Tests

### Persona A — COER Lima operator under EMERGENCIA
**Goal:** find the most-affected district, dispatch a boat, log the action.
**Friction:** must scan three different status surfaces (HUD, SituationBrief, top-of-AlertsPanel) to find the same number. Once in AlertsPanel, the QuickDispatch row sits below an AI recommendation card and a population-exposure callout — three intermediate cards before the action.
**Fix:** condense to single status pill + a "Dispatch + Acknowledge" floating action at top of AlertsPanel when EMERGENCIA.

### Persona B — IEEE judge on first 30 seconds
**Goal:** "is this real? does it look like an actual EOC product?"
**Friction:** dark slate-900 + cyan + Tailwind severity ramp + Inter-only signals "v0/shadcn weekend build" before they read the data. Emoji icons confirm the read.
**Fix:** type pair, palette swap, replace emoji.

### Persona C — Mobile responder on 375px Android
**Goal:** triage the top three alerts and dispatch.
**Friction:** bottom nav + ticker + share button + freshness bar + AlertsPanel mobile bottom-sheet at 62vh — vertical clutter. Tap targets fine.
**Fix:** hide LiveTicker on mobile (already done), collapse DataFreshnessBar into the LeftRail Info screen.

---

## Automated detection markers (AI-template smell)

| Marker | Present | Notes |
|--------|---------|-------|
| Tailwind default palette as severity | ✅ | red-500 / orange-500 / yellow-500 / green-500 |
| `bg-gradient-to-br` blue→blue logo box | ✅ | LeftRail line 82 |
| `rounded-xl` + `border border-slate-700` everywhere | ✅ | every panel |
| `backdrop-blur-md` + `bg-surface-base/85` glass overlays | ✅ | HUD, Brief, Ticker |
| Inline emoji as UI icons | ✅ | 12+ instances |
| Sub-11px primary text | ✅ | 30+ instances |
| Generic "✦ AI" star prefix | ✅ | AlertsPanel line 319 — replace |
| Single sans + single mono font | ✅ | tailwind.config.ts |
| Symmetric grid of metric tiles | ✅ | DistrictDashboard CityOverview |

9 / 9 markers present. After phases 2–4 we want this ≤ 2 / 9.

---

## Recommended order of operations

1. **Phase 2 — `/impeccable distill`**: remove `SituationBrief` from default view, merge into HUD drawer; gate DataFreshnessBar behind LeftRail Info.
2. **Phase 3 — `/impeccable typeset` + `/impeccable colorize`**: introduce display family + Lima-coast OKLCH palette; CSS tokens file; remove hex from components.
3. **Phase 4 — `/impeccable layout`**: distinguish panel elevations; bento DistrictDashboard; raise text floor to 12px.
4. **Phase 5 — `/impeccable harden`**: empty/error/loading states per panel; replace emoji with lucide icons; aria-live on ticker; focus-trap on modals.
5. **Phase 6 — `/impeccable optimize`**: Lighthouse pass; preload one display weight only; dynamic-import demo simulator.
6. **Phase 7 — `/impeccable polish` + `/impeccable delight`**: one signature interaction (radar sweep on idle map, or compass-locking transition on district select).
7. **Phase 9 — `/impeccable document`**: capture all of the above in `apps/web/DESIGN.md`.

---

## Score after refactor (target)

| Criterion | Now | After |
|-----------|-----|-------|
| Typography | 5 | 9 |
| Color | 5 | 9 |
| Layout | 6 | 8 |
| Motion | 7 | 8 |
| Hierarchy | 6 | 9 |
| **Overall** | **5.8** | **8.6** |

Maps to rubric C4 Usability **4.9 → 5.0** and C5 Scenario Fit **4.8 → 4.95** through stronger Lima-geographic signaling.
