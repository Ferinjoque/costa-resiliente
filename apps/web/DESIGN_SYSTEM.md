# Costa Resiliente — Design System Reference

> **This file is the canonical visual spec.** Read it before any frontend work.
> Any agent or developer touching `apps/web/src` must follow these guidelines.

---

## Direction: Felt-style Studio

Dark map canvas. Warm-cream solid panels. No glass, no backdrop-blur.
Inspired by: felt.com, Mapbox Studio, Linear.app, Perplexity dark mode.

**The map is the product. Chrome is furniture.**

---

## Color tokens (`tailwind.config.ts` + `globals.css`)

### Canvas (dark map)
| Token | Value | Use |
|-------|-------|-----|
| `canvas` | `oklch(13% 0.005 240)` | Page background, map area |
| `canvas-deep` | `oklch(9% 0.004 240)` | Ticker strip, deepest bg |

### Surface (cream panels — the "furniture")
| Token | Value | Use |
|-------|-------|-----|
| `surface` | `oklch(97.5% 0.006 80)` | All panel backgrounds |
| `surface-raised` | `oklch(100% 0 0)` | Cards inside panels |
| `surface-sunken` | `oklch(94% 0.008 80)` | Inputs, toggle tracks, tags |
| `surface-hover` | `oklch(92% 0.008 80)` | Row hover state |

### Ink (text on light surfaces)
| Token | Value | Use |
|-------|-------|-----|
| `ink` | `oklch(14% 0.008 240)` | Primary text |
| `ink-muted` | `oklch(40% 0.006 240)` | Secondary text / captions |
| `ink-subtle` | `oklch(60% 0.005 240)` | Labels, placeholders, metadata |
| `ink-inverse` | `oklch(97% 0.006 80)` | Text on dark surfaces (ticker) |

### Border
| Token | Value | Use |
|-------|-------|-----|
| `border` | `oklch(88% 0.007 80)` | Standard divider |
| `border-strong` | `oklch(78% 0.009 80)` | Panel outer edge |
| `border-subtle` | `oklch(93% 0.006 80)` | Very light separator |

### Accent (coastal teal — brand + interactive)
| Token | Value | Use |
|-------|-------|-----|
| `accent` | `oklch(47% 0.12 210)` | Buttons, active states, links |
| `accent-hover` | `oklch(40% 0.14 210)` | Button hover |
| `accent-soft` | `oklch(93% 0.04 210)` | Light tint backgrounds |
| `accent-muted` | `oklch(65% 0.09 210)` | Secondary accent text |

### Semantic (SINAGERD-aligned, NEVER used as chrome decoration)
| Token | Value | SINAGERD level |
|-------|-------|----------------|
| `danger` | `oklch(58% 0.20 28)` | EMERGENCIA — cinnabar |
| `danger-soft` | `oklch(96% 0.04 28)` | Surface tint |
| `warn` | `oklch(73% 0.13 78)` | ALERTA/AVISO — amber |
| `warn-soft` | `oklch(96% 0.04 78)` | Surface tint |
| `ok` | `oklch(62% 0.10 152)` | NORMAL — sage |
| `ok-soft` | `oklch(95% 0.04 152)` | Surface tint |

---

## Typography

Three families. Never substitute.

| Family | Variable | Use |
|--------|----------|-----|
| **Inter** (`font-sans`) | `--font-inter` | All UI text — labels, body, buttons |
| **Fraunces** (`font-display`) | `--font-display` | SINAGERD level word only, hero metric numbers |
| **JetBrains Mono** (`font-mono`) | `--font-mono` | All numerals, timestamps, codes |

### Size scale
| Class | Size | Use |
|-------|------|-----|
| `text-2xs` | 10px | Section labels, captions, metadata |
| `text-xs` | 11px | Secondary body, timestamps |
| `text-sm` | 13px | Primary body, list items, buttons |
| `text-md` | 15px | Panel headers |

### Letter spacing
| Class | Value | Use |
|-------|-------|-----|
| `tracking-caps` | 0.08em | Section labels (all-caps) |
| `tracking-display` | -0.025em | Hero numerals |
| `tracking-tight` | -0.01em | Panel titles |

---

## Layout

### Structure
```
┌──────────────────────────────────────────────────────────────┐
│ LeftRail (220px, bg-surface, border-r)                       │
│  ├─ Brand mark (logo + name)                                 │
│  ├─ Primary nav (icon + label + active spine)                │
│  └─ Secondary nav (Share / Sources / Tutorial / EN)          │
├──────────────────────────────────────────────────────────────┤
│ Map canvas (bg-canvas, fills remaining space)                │
│  ├─ ScenarioPanel  — top-left, below HUD (top-20 left-4)    │
│  ├─ OperationalHUD — top-right (top-4 right-4)              │
│  ├─ Right drawers  — flush right edge, full height          │
│  │    AlertsPanel, Dashboard, Ask, Log, Social, Share, Sources│
│  ├─ FusionCallout  — bottom-left, above ticker (bottom-12)  │
│  ├─ MapLegend      — bottom-left (bottom-20 sm:bottom-16)   │
│  ├─ MapRadar       — bottom-right (bottom-32 right-5)       │
│  ├─ DataFreshness  — bottom-center, above ticker             │
│  └─ LiveTicker     — full-width bottom bar (h-9, dark)      │
└──────────────────────────────────────────────────────────────┘
```

### Panel (right-side drawer) pattern
```tsx
// Desktop: flush right, full height, no rounded corners
sm:absolute sm:top-0 sm:right-0 sm:h-full sm:w-[360px]
bg-surface border-l border-border-strong shadow-panel z-20 flex flex-col panel-animate

// Mobile: bottom sheet, rounded top
fixed bottom-14 left-0 right-0 h-[70vh] rounded-t-2xl
bg-surface border-t border-border-strong shadow-panel z-20
```

### Floating map card pattern (ScenarioPanel, FusionCallout, MapLegend)
```tsx
bg-surface border border-border-strong rounded-2xl shadow-panel
// NO backdrop-blur, NO bg-opacity, NO glass
```

---

## Shadows

```css
--shadow-panel: 0 1px 2px oklch(14% 0.008 240 / 0.06),
                0 4px 12px oklch(14% 0.008 240 / 0.08),
                0 12px 32px oklch(14% 0.008 240 / 0.06);

--shadow-card:  0 1px 2px oklch(14% 0.008 240 / 0.05),
                0 2px 8px oklch(14% 0.008 240 / 0.06);
```

Use `shadow-panel` on panels. Use `shadow-card` on small chips. Never use Tailwind default shadows.

---

## Shared primitives (`src/components/ui/primitives.tsx`)

Always use these — never write bespoke button/pill/toggle markup.

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
| `<Toggle checked onChange>` | Layer / feature switch (no `label` prop when label is inline) |
| `<PillSegment active onClick>` | Time-window selector segment |
| `<EmptyState title body icon>` | Empty panel state |

---

## Rules (non-negotiable)

1. **No glass.** `backdrop-blur-*` is banned everywhere except on map overlay components that already work without it.
2. **No dark panel surfaces.** All panels use `bg-surface` (cream). The map (`bg-canvas`) is the only dark area.
3. **No inline hex colors** in component JSX. Use token classes or CSS variables.
4. **Semantic color only.** `text-danger` / `bg-danger-soft` only when the state genuinely is dangerous. Never for decoration.
5. **No rounded-xl on full-height drawers** (desktop side panels are flush, no rounding on the outer edge).
6. **Toggle `label` prop** — only pass it when you want the Toggle to render the label itself. If the row already shows the label inline, omit the `label` prop to avoid duplication.
7. **MapLibre controls** — navigation at `bottom-right`, attribution + scale at `bottom-left`. CSS in `globals.css` lifts them 40px above ticker. Don't add controls at `top-right` (conflicts with HUD).
8. **LiveTicker** — uses `bg-canvas-deep` (very dark), text must be `oklch(72% 0 0)` minimum on dark. It is the only persistently dark chrome element.

---

## Anti-patterns (things that have been tried and rejected)

| Pattern | Why rejected |
|---------|--------------|
| Glass (`backdrop-blur + bg-opacity`) | Unreadable on flat dark map canvas |
| Editorial serif (Fraunces) in panel headers | Reads as magazine, not ops console |
| All-dark theme (Bulletin) | Panels blend into map, chrome unreadable |
| Multiple overlapping HUD surfaces | Clutter, fight for attention |
| Text-only sidebar (no icons) | Hard to scan quickly for operators |
| Emoji as iconography | OS-dependent rendering, AI-template tell |
| Gradient veils over map | Masks map data, adds visual noise |

---

## Map controls layout

```
top-right:    OperationalHUD (React, z-10)
bottom-right: MapLibre NavigationControl (+/-) + MapRadar (bottom-32)
bottom-left:  MapLibre AttributionControl + ScaleControl
bottom-center: DataFreshnessBar (above ticker at bottom-[42px])
bottom-0:     LiveTicker (full-width, h-9, dark)
```

MapLibre control CSS (in `globals.css`):
- `.maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left { margin-bottom: 40px }`
- Controls styled to match cream surface: `bg-surface`, `border-border-strong`, `rounded-10px`

---

## SINAGERD level visual mapping

| Level | Background | Text | Border | Dot |
|-------|-----------|------|--------|-----|
| EMERGENCIA | `bg-danger-soft` | `text-danger` | `border-danger/30` | `bg-danger animate-pulse` |
| ALERTA | `bg-warn-soft` | `text-warn-muted` | `border-warn/30` | `bg-warn animate-pulse` |
| AVISO | `bg-warn-soft/60` | `text-warn-muted` | `border-warn/20` | `bg-warn` |
| NORMAL | `bg-ok-soft` | `text-ok-muted` | `border-ok/20` | `bg-ok` |

---

## File ownership

| Area | Key files |
|------|-----------|
| Tokens | `tailwind.config.ts`, `src/app/globals.css` |
| Primitives | `src/components/ui/primitives.tsx` |
| LeftRail | `src/components/ui/LeftRail.tsx` |
| HUD | `src/components/map/OperationalHUD.tsx` |
| ScenarioPanel | `src/components/panels/ScenarioPanel.tsx` |
| Map setup | `src/components/map/MapView.tsx` |
| Ticker | `src/components/map/LiveTicker.tsx` |
| Design spec | `apps/web/DESIGN_SYSTEM.md` ← this file |
