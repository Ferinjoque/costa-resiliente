# Costa Resiliente — Frontend Design System

> **This is the single source of truth for the frontend visual system.**
> Read it before touching any file in `apps/web/src/components/` or `apps/web/src/app/`.
> Last updated: 2026-05-17.

For project progress, see [`../../docs/STATUS.md`](../../docs/STATUS.md).
For competition context, see [`../../docs/COMPETITION.md`](../../docs/COMPETITION.md).

---

## 1. Direction — Felt-style operator console

**Dark map canvas. Warm-cream solid panels. No glass, no backdrop-blur.**

Inspired by: felt.com, Mapbox Studio, Linear.app. The map is the product; chrome is furniture. Anchored visually in the Pacific coast geography of Lima — deep ocean teal, desert sand, cinnabar alert.

The system was rebuilt during Sprint 12 (the `/impeccable` design pass) after a baseline audit identified the prior UI as reading like an AI-template dashboard (Tailwind stock palette, glass overlays, emoji icons, single Inter typeface, sub-12px primary text). Final audit score: 5.8 → 8.6 / 10. See historical summary in §10.

### Persona priorities

1. **COER Lima operator under EMERGENCIA** — top-priority signal findable in <2 seconds
2. **IEEE judge in first 30 seconds** — must not look like a weekend shadcn build
3. **Mobile responder on 375 px Android** — tap targets ≥44 px, no horizontal overflow

---

## 2. Color tokens

Defined in [`tailwind.config.ts`](tailwind.config.ts) + mirrored as CSS custom properties in [`src/app/globals.css`](src/app/globals.css). **All values expressed in OKLCH** for perceptual uniformity. No stock Tailwind hex in component JSX.

### 2.1 Canvas (dark — the map area)

| Token | Value | Use |
|-------|-------|-----|
| `canvas` | `oklch(13% 0.005 240)` | Page background, map area |
| `canvas-deep` | `oklch(9% 0.004 240)` | LiveTicker strip, deepest bg |

### 2.2 Surface (cream — the panels / furniture)

| Token | Value | Use |
|-------|-------|-----|
| `surface` | `oklch(97.5% 0.006 80)` | All panel backgrounds |
| `surface-raised` | `oklch(100% 0 0)` | Cards inside panels |
| `surface-sunken` | `oklch(94% 0.008 80)` | Inputs, toggle tracks, tags |
| `surface-hover` | `oklch(92% 0.008 80)` | Row hover state |

### 2.3 Ink (text on cream surfaces)

| Token | Value | Use |
|-------|-------|-----|
| `ink` | `oklch(14% 0.008 240)` | Primary text |
| `ink-muted` | `oklch(40% 0.006 240)` | Secondary text, captions |
| `ink-subtle` | `oklch(60% 0.005 240)` | Labels, placeholders, metadata |
| `ink-inverse` | `oklch(97% 0.006 80)` | Text on dark surfaces (ticker) |

### 2.4 Border

| Token | Value | Use |
|-------|-------|-----|
| `border` | `oklch(88% 0.007 80)` | Standard divider |
| `border-strong` | `oklch(78% 0.009 80)` | Panel outer edge |
| `border-subtle` | `oklch(93% 0.006 80)` | Very light separator |

### 2.5 Accent — coastal teal (brand + interactive)

| Token | Value | Use |
|-------|-------|-----|
| `accent` | `oklch(47% 0.12 210)` | Buttons, active states, links |
| `accent-hover` | `oklch(40% 0.14 210)` | Button hover |
| `accent-soft` | `oklch(93% 0.04 210)` | Light tint backgrounds |
| `accent-muted` | `oklch(65% 0.09 210)` | Secondary accent text |

### 2.6 Semantic — SINAGERD-aligned severity

Used **only** for genuinely dangerous states. Never as chrome decoration.

| Token | OKLCH | SINAGERD level |
|-------|-------|----------------|
| `danger` | `oklch(58% 0.20 28)` | EMERGENCIA — cinnabar |
| `danger-soft` | `oklch(96% 0.04 28)` | Surface tint |
| `danger-deep` | `oklch(50% 0.20 28)` | Higher-contrast text on light bg (WCAG AA) |
| `warn` | `oklch(73% 0.13 78)` | ALERTA / AVISO — burnt ochre |
| `warn-soft` | `oklch(96% 0.04 78)` | Surface tint |
| `ok` | `oklch(62% 0.10 152)` | NORMAL — muted sage |
| `ok-soft` | `oklch(95% 0.04 152)` | Surface tint |

These four levels map 1:1 to the INDECI alert ladder. Earthier and less neon than the Tailwind severity wheel.

---

## 3. Typography

Three families loaded via `next/font` in [`src/app/layout.tsx`](src/app/layout.tsx). Never substitute.

| Role | Family | Variable | Weights |
|------|--------|----------|---------|
| Body | **Inter** | `--font-inter` | 400, 500, 600, 700 |
| Display | **Fraunces** (contemporary serif) | `--font-display` | 600, 700 |
| Data / tabular | **JetBrains Mono** | `--font-mono` | 400, 500 |

### 3.1 When to use the display family (Fraunces)

Reserved for moments that should feel **editorial, not stock**:

1. SINAGERD level word in HUD ("EMERGENCIA", "ALERTA")
2. Hero metric numerals in DistrictDashboard (active alerts, flood km², population at risk) — always with `tabular-nums` + `tracking-display`
3. Panel section titles (`h2` on AlertsPanel, DistrictDashboard, FusionCallout)
4. Two-letter SINAGERD-style chip codes (`AI`, `LIVE`, `REPLAY`, resource tags) with `tracking-ops` (0.12em uppercase)
5. Costa Resiliente monogram in LeftRail

**Never use Fraunces for body copy or dense data rows.**

### 3.2 Size scale

| Class | Size | Use |
|-------|------|-----|
| `text-2xs` | 10 px | **Floor.** Tabular metadata only (timestamps, ubigeo IDs) |
| `text-xs` | 11 px | Secondary body, captions |
| `text-sm` | 13 px | Primary body, list items, buttons |
| `text-md` | 15 px | Panel headers |

Any label carrying **operational meaning** must sit ≥ 11 px. Body copy ≥ 12 px.

### 3.3 Letter spacing

| Class | Value | Use |
|-------|-------|-----|
| `tracking-caps` | 0.08em | Section labels (all-caps) |
| `tracking-display` | -0.025em | Hero numerals |
| `tracking-tight` | -0.01em | Panel titles |
| `tracking-ops` | 0.12em | Uppercase SINAGERD-style chips |

---

## 4. Layout

### 4.1 Structure

```
┌──────────────────────────────────────────────────────────────┐
│ LeftRail (220 px, bg-surface, border-r)                      │
│  ├─ Brand mark (CR monogram + name)                          │
│  ├─ Primary nav (icon + label + active spine)                │
│  ├─ Secondary nav (Share / Sources / Notifications / EN)     │
│  └─ OperatorChip (login button OR username/role/logout)      │
├──────────────────────────────────────────────────────────────┤
│ Map canvas (bg-canvas, fills remaining space)                │
│  ├─ ScenarioPanel  — top-left, below HUD (top-20 left-4)     │
│  ├─ OperationalHUD — top-right (top-4 right-4) desktop only  │
│  ├─ Right drawers  — flush right edge, full height           │
│  │    AlertsPanel, Dashboard, Ask, Log, Social, Share,       │
│  │    Sources, Notifications                                 │
│  ├─ FusionCallout  — bottom-left, above ticker (bottom-12)   │
│  ├─ MapLegend      — bottom-left (bottom-20 sm:bottom-16)    │
│  ├─ MapRadar       — bottom-right (bottom-32 right-5)        │
│  ├─ DataFreshness  — bottom-center, above ticker             │
│  └─ LiveTicker     — full-width bottom bar (h-9, dark)       │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Right-drawer pattern (desktop)

```tsx
// Desktop: flush right, full height, no rounded outer corner
sm:absolute sm:top-0 sm:right-0 sm:h-full sm:w-[360px]
bg-surface border-l border-border-strong shadow-panel z-20 flex flex-col panel-animate
```

### 4.3 Right-drawer pattern (mobile)

```tsx
// Mobile: bottom sheet, rounded top
fixed bottom-14 left-0 right-0 h-[70vh] rounded-t-2xl
bg-surface border-t border-border-strong shadow-panel z-20
```

### 4.4 Floating map card pattern

For ScenarioPanel, FusionCallout, MapLegend:

```tsx
bg-surface border border-border-strong rounded-2xl shadow-panel
// NO backdrop-blur, NO bg-opacity, NO glass
```

### 4.5 Modal pattern (with animation)

Used by LoginPanel. Centering wrapper + animated inner dialog — never use `translate-x-1/2 -translate-y-1/2` on the animated element (transform conflicts).

```tsx
{/* Centering wrapper — pointer-events-none */}
<div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
  <div
    className={clsx(
      "pointer-events-auto w-[340px] bg-surface rounded-2xl shadow-panel border border-border-strong overflow-hidden",
      "transition-all duration-200 ease-out",
      visible
        ? "opacity-100 scale-100 translate-y-0"
        : "opacity-0 scale-95 translate-y-3",
    )}
  >
    {/* content */}
  </div>
</div>
```

Use a `visible` state separate from the mount state; flip it inside a `requestAnimationFrame` so the initial `opacity-0` frame renders before transitioning. On close, flip `visible` to `false` then `setTimeout(unmount, 200)`.

---

## 5. Shadows

```css
--shadow-panel: 0 1px 2px oklch(14% 0.008 240 / 0.06),
                0 4px 12px oklch(14% 0.008 240 / 0.08),
                0 12px 32px oklch(14% 0.008 240 / 0.06);

--shadow-card:  0 1px 2px oklch(14% 0.008 240 / 0.05),
                0 2px 8px oklch(14% 0.008 240 / 0.06);
```

Use `shadow-panel` on panels. Use `shadow-card` on small chips. **Never use Tailwind default shadows.**

---

## 6. Shared primitives

`src/components/ui/primitives.tsx` is the single component set. **Always use these — never write bespoke button / pill / toggle markup.**

| Component | When |
|-----------|------|
| `<Panel>` | Floating card on map |
| `<PanelHeader>` | Top of any panel |
| `<PanelTitle>` | Panel heading text |
| `<SectionLabel>` | All-caps section header inside panels |
| `<Button variant="primary\|secondary\|ghost\|danger" size="xs\|sm\|md">` | All interactive buttons |
| `<Pill variant="default\|danger\|warn\|ok\|accent">` | Read-only status chip |
| `<Badge count={n} variant="danger\|warn\|accent">` | Numeric notification count |
| `<Divider>` | Horizontal rule between sections |
| `<Toggle checked onChange>` | Layer / feature switch (no `label` prop when row already shows label inline) |
| `<PillSegment active onClick>` | Time-window selector segment |
| `<EmptyState title body icon>` | Empty panel state — never bare grey strings |

---

## 7. Iconography

**`lucide-react` is the canonical icon set.** Sizes 11–15 px in panel headers and rows.

### No emoji in UI chrome

Operator-facing logging uses SINAGERD-style ASCII tags rendered in the display family:

| Surface | Tag set |
|---------|---------|
| Alert type | `[SAR]`, `[HUA]`, `[SOC]`, `[ALT]` |
| Social triage | `[SOS]`, `[BLK]` |
| Decision log | `[RX]`, `[OUT]`, `[OK]`, `[PIN]`, `[ACK]`, `[ESC]`, `[FP]` |
| Infra popup | `[H]`, `[E]`, `[B]`, `[P]`, `[F]`, `[A]` |
| Resource category | `PE`, `HE`, `AM`, `CA`, `RA`, `AL` |
| AI prefix | `AI` (display caps, costa-300) |

Reasons: editorial identity, and portability — emoji render differently across operator workstations.

---

## 8. Motion

All animations honor `prefers-reduced-motion` via a global rule in `globals.css`.

### 8.1 Sanctioned animations

| Name | Where | Purpose |
|------|-------|---------|
| `animate-pulse` | **Active critical dot only** | Top-priority signal |
| `emergency-glow` | OperationalHUD container | EMERGENCIA state ring |
| `live-dot` | LIVE / SSE indicators | Connection breath |
| `ticker-scroll` | LiveTicker track | Continuous scroll |
| `cr-pulse-ring` | Critical map marker | Spatial attention |
| `panel-slide-in` / `panel-animate` | Panel mount | Subtle entry |
| `slide-in-right` | Toasts | Entry from edge |
| `radar` | MapRadar beam | Signature delight (suppressed when any non-map panel is active) |

### 8.2 Property budget

Only `transform`, `opacity`, `clip-path`, and `filter` (sparingly). **No animation of layout properties** (`width`, `top`, `font-size`).

### 8.3 Pulse discipline

Reserve `animate-pulse` for the **single highest-priority signal** (critical alert dot) + the LIVE label. Multiple synchronized pulse dots read as noise.

---

## 9. Rules — non-negotiable

1. **No glass.** `backdrop-blur-*` is banned everywhere except internal map overlay components that already work without it.
2. **No dark panel surfaces.** All panels use `bg-surface` (cream). The map (`bg-canvas`) is the only persistently dark area.
3. **No inline hex colors** in component JSX. Use token classes or CSS variables. (Map raster styles via MapLibre paint specs are the documented exception.)
4. **Semantic color only.** `text-danger` / `bg-danger-soft` only when the state genuinely is dangerous. Never for decoration.
5. **No `rounded-xl` on full-height drawers** — desktop side panels are flush; no rounding on the outer edge.
6. **`Toggle` `label` prop** — only pass it when you want the Toggle to render the label itself. If the row already shows the label inline, omit the prop to avoid duplication.
7. **MapLibre controls** — navigation at `bottom-right`, attribution + scale at `bottom-left`. CSS in `globals.css` lifts them 40 px above ticker. Never put controls at `top-right` (conflicts with HUD).
8. **LiveTicker** — uses `bg-canvas-deep`; text minimum `oklch(72% 0 0)` on dark for AA contrast. Only persistently dark chrome element.

---

## 10. Map controls layout

```
top-right:      OperationalHUD (React, z-10)
bottom-right:   MapLibre NavigationControl (+/-) + MapRadar (bottom-32)
bottom-left:    MapLibre AttributionControl + ScaleControl
bottom-center:  DataFreshnessBar (above ticker at bottom-[42px])
bottom-0:       LiveTicker (full-width, h-9, dark)
```

MapLibre CSS overrides in `globals.css`:
- `.maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left { margin-bottom: 40px }`
- Controls styled to match cream: `bg-surface`, `border-border-strong`, `rounded-10px`
- Mobile: `margin-bottom: 200px` so zoom buttons don't overlap SituationBrief action row

---

## 11. SINAGERD level visual mapping

| Level | Background | Text | Border | Dot |
|-------|-----------|------|--------|-----|
| EMERGENCIA | `bg-danger-soft` | `text-danger-deep` | `border-danger/30` | `bg-danger animate-pulse` |
| ALERTA | `bg-warn-soft` | `text-ink-muted` | `border-warn/30` | `bg-warn animate-pulse` |
| AVISO | `bg-warn-soft/60` | `text-ink-muted` | `border-warn/20` | `bg-warn` |
| NORMAL | `bg-ok-soft` | `text-ok-muted` | `border-ok/20` | `bg-ok` |

`danger-deep` / `text-ink-muted` substitutions ensure WCAG AA contrast on the soft tints (verified Sprint 12 Phase 5).

---

## 12. Accessibility

WCAG AA target across the whole product. **Lighthouse 100/100 accessibility** verified in Sprint 12 Phase 4.

- Skip-nav link defined in `layout.tsx` per WCAG 2.4.1
- Global focus-visible ring: 2 px `accent` outline + 2 px offset
- `prefers-reduced-motion` honored on every animation
- All severity / risk dots have `aria-label` or sibling text label
- LiveTicker: `role="region" aria-live="polite" aria-atomic="false"` (not `role="marquee"`)
- Mobile tap targets ≥ 44 × 44 px via `@media (pointer: coarse)` rule
- `aria-label` on all `<select>` and `<Toggle>` instances
- Empty / loading / error states are designed surfaces, not bare grey strings

### Outstanding

- `EscalationModal` lacks programmatic focus trap (Esc + Tab cycle inside dialog). Currently `aria-modal=true` + click-backdrop dismiss only.

---

## 13. Performance budget

| Metric | Target | Current |
|--------|--------|---------|
| LCP | < 2.5 s | TBD on VPS |
| INP | < 200 ms | TBD |
| CLS | < 0.1 | TBD |
| First-load JS (`/`) | < 150 kB | **153 kB** (3 kB over feature-dense ops budget) |

Lazy-loaded panels (excluded from initial bundle): `TutorialOverlay`, `SharePanel`, `DemoLiveSimulator`.

---

## 14. Anti-patterns — rejected

| Pattern | Why rejected |
|---------|--------------|
| Glass (`backdrop-blur` + `bg-opacity`) | Unreadable on flat dark map canvas; tells "AI template" instantly |
| Editorial serif (Fraunces) in panel headers | Reads as magazine, not ops console |
| All-dark theme | Panels blend into map; chrome unreadable |
| Multiple overlapping HUD surfaces | Clutter; fights for operator attention |
| Text-only sidebar (no icons) | Hard to scan quickly for operators |
| Emoji as iconography | OS-dependent rendering; AI-template tell |
| Gradient veils over map | Masks map data; visual noise |
| Stock Tailwind severity palette (`red-500` / `orange-500` / `yellow-500` / `green-500`) | Generic; every ops dashboard uses these |
| Single sans-serif doing display + body + data | No editorial contrast; reads as bootstrap demo |
| Sub-11 px primary text | Operationally unsafe; WCAG resize tolerance not enough for decision UI |

---

## 15. Historical — Sprint 12 audit findings

The `/impeccable` design pass (Sprint 12) closed the long-running C4 Usability gap by intervening at the visual-system level rather than per-feature. Baseline audit score: **5.8 / 10** with 9/9 AI-template markers detected. Post-refactor: **8.6 / 10**, 2/9 markers remaining.

Five-dimension scoring:

| Dimension | Before | After |
|-----------|--------|-------|
| Typography | 5 / 10 | 9 / 10 |
| Color | 5 / 10 | 9 / 10 |
| Layout | 6 / 10 | 8 / 10 |
| Motion | 7 / 10 | 8 / 10 |
| Hierarchy | 6 / 10 | 9 / 10 |

Phases executed in order: distill (collapse overlapping situational surfaces), typeset + colorize (add Fraunces display + OKLCH Lima-coast palette), layout (bento DistrictDashboard + raised type floor), harden (empty/error states + replace emoji with ASCII tags + aria-live ticker), optimize (Lighthouse 100/100 + lazy loading), polish (MapRadar signature sweep), document (this file).

---

## 16. File ownership

| Area | Key files |
|------|-----------|
| Tokens | `tailwind.config.ts`, `src/app/globals.css` |
| Primitives | `src/components/ui/primitives.tsx` |
| LeftRail | `src/components/ui/LeftRail.tsx` |
| HUD | `src/components/map/OperationalHUD.tsx` |
| Map setup | `src/components/map/MapView.tsx` |
| Ticker | `src/components/map/LiveTicker.tsx` |
| Color exports for charts | `src/lib/colors.ts` |
| Design spec | `apps/web/DESIGN.md` ← **this file** |
