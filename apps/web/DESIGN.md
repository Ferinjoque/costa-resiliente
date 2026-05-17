# Costa Resiliente — Design System

> Captures the visual + interaction system used across `apps/web`.
> Source-of-truth for any agent or human extending the UI.
> Audit basis: [docs/IMPECCABLE_AUDIT.md](../../docs/IMPECCABLE_AUDIT.md).

---

## 1. Mission of the visual system

Operator-grade emergency-ops console for SINAGERD managers responding to
El Niño Costero events in Lima Metropolitana. Reads as **a real product**,
not as a generic AI-template dashboard. Anchored visually in the Pacific
coast: deep ocean teal, desert sand, cinnabar alert.

Persona priorities:
1. COER Lima operator under EMERGENCIA — needs the top-priority signal
   findable in <2 seconds.
2. IEEE judge on the first 30 seconds — the product must not look like a
   weekend shadcn build.
3. Mobile responder on 375px — touch targets ≥44px, no overflow.

---

## 2. Color tokens

Defined in [tailwind.config.ts](tailwind.config.ts) + mirrored as CSS
custom properties in [src/app/globals.css](src/app/globals.css). All values
expressed in **OKLCH** for perceptual uniformity and to avoid stock
Tailwind hex.

### 2.1 Surface ramp

| Token | Value | Use |
|-------|-------|-----|
| `surface.ink` / `surface.base` | `oklch(14% 0.012 240)` | Page background, map canvas under-layer |
| `surface.raised` | `oklch(19% 0.015 240)` | Panels (Alerts, Dashboard, Sources) |
| `surface.panel` | `oklch(24% 0.018 240)` | Nested cards inside panels |
| `surface.line` | `oklch(30% 0.015 240)` | Borders, dividers |
| `surface.muted` | `oklch(40% 0.012 240)` | Disabled / placeholder text |

Cool-tinted graphite — distinct from the Tailwind slate ramp that ships
with every shadcn project.

### 2.2 SINAGERD-aligned severity

The four levels map 1:1 to the official INDECI alert ladder. Earthier
and less neon than the default Tailwind severity wheel.

| Level | Token | OKLCH | Notes |
|-------|-------|-------|-------|
| EMERGENCIA | `severity.critical` | `oklch(60% 0.20 28)` | Cinnabar (rust-red) — was `red-500` |
| ALERTA     | `severity.high`     | `oklch(70% 0.16 55)` | Burnt ochre — was `orange-500` |
| AVISO      | `severity.medium`   | `oklch(80% 0.14 85)` | Mustard amber — was `yellow-500` |
| NORMAL     | `severity.low`      | `oklch(65% 0.11 155)` | Muted sage — was `green-500` |

Background tints use `/12`–`/15` alpha, borders `/35`–`/60`. Body text on
these surfaces is the same token at solid opacity — verified ≥4.5:1
contrast against `surface.ink`.

### 2.3 Costa (brand) — Pacific-coast teal

11-step ramp anchored on a deep ocean navy, not sky-blue. The `costa-300`
sits as the brand accent (logo `C`, AI prefix, copilot icons, freshness
text). Use `costa-700` for active nav background, `costa-900` for low-emphasis
tinted panels (flood-area card).

### 2.4 Sand — operational accent

Warm desert neutral for non-alert callouts (tutorial accents, replay
chrome, "population at risk" card).

---

## 3. Typography

Three families loaded via `next/font` in [src/app/layout.tsx](src/app/layout.tsx):

| Role | Family | Variable | Weights |
|------|--------|----------|---------|
| Body | **Inter** | `--font-inter` | 400, 500, 600, 700 |
| Display | **Fraunces** | `--font-display` | 600, 700 |
| Data / tabular | **JetBrains Mono** | `--font-mono` | 400, 500 |

### Display family — when to use

Fraunces (a contemporary serif with strong optical sizing) is reserved
for moments that should feel **editorial, not stock**:

1. SINAGERD level word in HUD / SituationBrief / SituationSummary
   ("EMERGENCIA", "ALERTA").
2. Hero metric numerals in DistrictDashboard (active alerts count, flood
   km², pop at risk). Always paired with `tabular-nums` +
   `tracking-display-tight`.
3. Panel section titles (`h2` on AlertsPanel, DistrictDashboard,
   FusionCallout).
4. Two-letter SINAGERD-style chip codes (`AI`, `LIVE`, `REPLAY`, resource
   tags `PE`/`HE`/`AM`/`CA`/`RA`/`AL`). Always with `tracking-ops` (0.12em
   uppercase tracking).
5. Costa Resiliente monogram in the LeftRail.

Never use Fraunces for body copy or dense data rows.

### Type floor

`text-[10px]` is the absolute floor and only allowed for tabular
metadata (timestamps, ubigeo IDs). Any label that carries operational
meaning sits at `text-[11px]` minimum. Body copy ≥ `text-xs` (12px).

### Letter-spacing tokens

| Token | Value | Use |
|-------|-------|-----|
| `tracking-display-tight` | `-0.02em` | Display numerals + panel titles |
| `tracking-ops` | `0.12em` | Uppercase SINAGERD-style chips |

---

## 4. Surface composition

### 4.1 Panel elevations

| Tier | Recipe | Used by |
|------|--------|---------|
| Primary panel | `bg-surface-raised border border-surface-line/–slate-700 rounded-xl shadow-xl` | AlertsPanel, DistrictDashboard, SocialFeedPanel |
| Secondary panel | flat `bg-surface-raised`, no border, lighter shadow | DataSourcesPanel, SharePanel |
| Nested card | `bg-surface-panel/60 border border-surface-line/60 rounded-xl` | MetricCard, Forecast section, Resource status |
| Hero tile | severity-tinted background + 2×-row grid span | DistrictDashboard CityOverview active-alerts cell |

### 4.2 Bento composition

`DistrictDashboard.CityOverview` breaks the symmetric 2-col grid that
read as template. Current layout:

```
┌───────────────────────────────────┬──────────────────┐
│                                   │  Flood km²       │
│   ACTIVE ALERTS (hero, 3×2 cols)  ├──────────────────┤
│                                   │  Pop. at risk    │
├───────────────────────────────────┴──────────────────┤
│   ● 5 high-risk distr.  ● 12 moderate (footer strip) │
└──────────────────────────────────────────────────────┘
```

5-column grid (`grid-cols-5`), hero takes 3 cols × 2 rows.

### 4.3 Map overlay placement

Map area is a stage; chrome is anchored to corners with no overlap:

```
┌────────────────────────────────────────────────────────┐
│ [LeftRail]                  [OperationalHUD]           │
│                                                        │
│ [ScenarioPanel]                                        │
│                                                        │
│                                                        │
│                                            [AlertsPanel│
│                                             when active]│
│                                                        │
│ [MapLegend]                            [MapRadar]      │
│ [FusionCallout]                                        │
│ ─────────────[DataFreshnessBar]──────────────────────  │
│ ████████████████ LiveTicker (full-width) ████████████  │
└────────────────────────────────────────────────────────┘
```

- `OperationalHUD` is the canonical situational pill — top-center, desktop only.
- `SituationBrief` is the mobile equivalent (bottom-right) — desktop hides via `sm:hidden`.
- `MapRadar` is signature delight — bottom-right, desktop only, suppressed when any panel ≠ map is active.
- `LiveTicker` always occupies bottom-0; `DataFreshnessBar` sits above it at `sm:bottom-10`.

---

## 5. Iconography

`lucide-react` is the canonical icon set. Use the existing imports
(AlertTriangle, Waves, Mountain, Bell, Radio, etc.) at size 11–15px in
panel headers and rows.

**No emoji in UI chrome.** Operator logging uses short SINAGERD-style
ASCII tags rendered in the display family:

| Surface | Tag set |
|---------|---------|
| Alert type | `[SAR]`, `[HUA]`, `[SOC]`, `[ALT]` |
| Social triage | `[SOS]`, `[BLK]` |
| Decision log | `[RX]`, `[OUT]`, `[OK]`, `[PIN]`, `[ACK]`, `[ESC]`, `[FP]` |
| Infra popup | `[H]`, `[E]`, `[B]`, `[P]`, `[F]`, `[A]` |
| Resource cat. | `PE`, `HE`, `AM`, `CA`, `RA`, `AL` |
| AI prefix | `AI` (display caps, costa-300) |

This serves both an editorial purpose (the typography pair carries the
identity) and a portability purpose (emoji render differently across
operator workstations).

---

## 6. Motion

All animations honor `prefers-reduced-motion` via a global rule in
[globals.css](src/app/globals.css) (lines 202–224).

### 6.1 Sanctioned animations

| Name | Where | Purpose |
|------|-------|---------|
| `animate-pulse` | Active critical dot only | Top-priority signal |
| `emergency-glow` | OperationalHUD container | EMERGENCIA state ring |
| `live-dot` | LIVE / SSE indicators | Connection breath |
| `ticker-scroll` | LiveTicker track | Continuous scroll |
| `cr-pulse-ring` | Critical map marker | Spatial attention |
| `panel-slide-in` | Panel mount | Subtle entry |
| `slide-in-right` | Toasts | Entry from edge |
| `radar` | MapRadar beam | Signature delight |

### 6.2 Property budget

Only `transform`, `opacity`, `clip-path`, and `filter` (sparingly). No
animation of layout properties (`width`, `top`, `font-size`, etc.).

### 6.3 Pulse discipline

Reserve `animate-pulse` for the **single highest-priority signal**
(critical alert dot) + the LIVE label. Multiple synchronized pulse dots
read as noise rather than information.

---

## 7. Accessibility

- WCAG AA target across the whole product. Skip-nav link defined in
  [src/app/layout.tsx](src/app/layout.tsx) per WCAG 2.4.1.
- Global focus-visible ring: 2px `costa-400` outline with 2px offset.
  Defined in [globals.css](src/app/globals.css) line 33.
- `prefers-reduced-motion` honored.
- All severity/risk dots have a `aria-label` or sibling text label.
- LiveTicker uses `role="region" aria-live="polite" aria-atomic="false"`.
- Mobile tap targets ≥44×44 via the `@media (pointer: coarse)` rule.
- Empty / loading / error states are designed surfaces, not bare grey
  strings — see AlertsPanel, DistrictDashboard.TopRiskList.

Outstanding (deferred):
- Focus-trap on `EscalationModal` in AlertsPanel (Esc + initial focus
  ring on cancel + tab-cycle inside dialog). Currently `aria-modal=true`
  + click-backdrop dismiss works, but no programmatic trap.

---

## 8. Performance budget

Per [rules/web/performance.md](../../../.claude/rules/web/performance.md):

| Metric | Target | Current |
|--------|--------|---------|
| LCP | < 2.5s | TBD (Lighthouse on VPS) |
| INP | < 200ms | TBD |
| CLS | < 0.1 | TBD |
| First-load JS (`/`) | < 150 kB | **153 kB** (3 kB over feature-dense ops budget) |

Lazy-loaded panels (excluded from initial bundle):
- `TutorialOverlay`
- `SharePanel`
- `DemoLiveSimulator`

---

## 9. Migration debts

Tracked here so future work can address incrementally without breaking
the visual system contract.

1. Some Tailwind palette utilities (`bg-red-900/...`, `text-blue-300`,
   etc.) still appear inside AlertsPanel, FusionCallout T strings,
   SocialPill, MapLegend swatches, ResponseProtocol, ForecastSection.
   These resolve to stock Tailwind hex and should migrate to severity
   / costa / sand tokens.
2. `SVG` charts (Sparkline, BarMini, ForecastChart) use raw
   `stroke="#38bdf8"` etc. — should accept color via prop and source
   the brand token via `useMemo`.
3. `MapLegend` `RISK_ITEMS` / `SOCIAL_ITEMS` / `HUAYCO_ITEMS` /
   `ALERT_ITEMS` / `STATION_ITEMS` arrays use hex literals. Replace
   with token references when the legend gets a Phase 8 polish.
4. EDAN-Perú report builder is Spanish-only inside `buildReport()` —
   should branch on locale.
5. Inline `_actionId = 700` module-level mutable counter in AlertsPanel
   — replace with a `useRef` or a store-backed sequence.

---

## 10. Glossary

- **SINAGERD** — Sistema Nacional de Gestión del Riesgo de Desastres (Peru).
- **INDECI** — Instituto Nacional de Defensa Civil. Issues EMERGENCIA / ALERTA / AVISO levels.
- **COEN** — Centro de Operaciones de Emergencia Nacional.
- **COER** — Centro de Operaciones de Emergencia Regional (Lima Metropolitana, etc.).
- **EDAN-Perú** — Evaluación de Daños y Análisis de Necesidades (post-event report format).
- **Huayco** — Andean term for a debris flow / mudslide, the second primary hazard alongside flooding.
- **Quebrada** — narrow valley / dry ravine, the geographic feature where huaycos channel.
