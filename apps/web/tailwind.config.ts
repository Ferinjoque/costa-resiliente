import type { Config } from "tailwindcss";

// ─── Felt-style design system ────────────────────────────────────────────────
// Dark map canvas. Light warm-cream chrome. Solid surfaces, no glass, no blur.
// The map carries the visual weight; panels are clean cards with shadows.
//
// Inspired by: felt.com, Mapbox Studio, Linear.app, Perplexity dark.

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Canvas (the map's world) ──────────────────────────────────────
        canvas: {
          DEFAULT: "oklch(13% 0.005 240)",
          deep:    "oklch(9%  0.004 240)",
        },

        // ── Surface (light cream panels) ─────────────────────────────────
        surface: {
          DEFAULT: "oklch(97.5% 0.006 80)",   // warm off-white, panel bg
          raised:  "oklch(100%  0     0  )",   // pure white, cards inside panels
          sunken:  "oklch(94%   0.008 80 )",   // inputs, toggle tracks
          hover:   "oklch(92%   0.008 80 )",   // hover state on list items
        },

        // ── Ink (text on light surfaces) ─────────────────────────────────
        ink: {
          DEFAULT: "oklch(14% 0.008 240)",    // primary text
          muted:   "oklch(40% 0.006 240)",    // secondary text / captions
          subtle:  "oklch(60% 0.005 240)",    // very muted, placeholders
          inverse: "oklch(97% 0.006 80 )",    // text on dark surfaces
        },

        // ── Border ───────────────────────────────────────────────────────
        border: {
          DEFAULT: "oklch(88% 0.007 80)",     // standard divider
          strong:  "oklch(78% 0.009 80)",     // panel outer edge
          subtle:  "oklch(93% 0.006 80)",     // very light separator
        },

        // ── Accent (brand / interactive: coastal teal) ───────────────────
        // Used for buttons, active states, links. Not for danger/severity.
        accent: {
          DEFAULT: "oklch(47% 0.12 210)",    // mid teal
          hover:   "oklch(40% 0.14 210)",    // darker on hover
          soft:    "oklch(93% 0.04 210)",    // light tint (badges, pills)
          muted:   "oklch(65% 0.09 210)",    // secondary accent text
          inverse: "oklch(85% 0.07 210)",    // teal on dark bg
        },

        // ── Danger / severity ─────────────────────────────────────────────
        // Cinnabar: earthy, not pure red-500. Used ONLY for emergency signal.
        danger: {
          DEFAULT: "oklch(58% 0.20 28)",      // cinnabar
          soft:    "oklch(96% 0.04 28)",      // danger surface tint
          muted:   "oklch(72% 0.15 28)",      // lighter text
          deep:    "oklch(42% 0.18 28)",      // hover/active on danger
        },

        // ── Warning (amber: watch / AVISO level) ────────────────────────
        warn: {
          DEFAULT: "oklch(73% 0.13 78)",
          soft:    "oklch(96% 0.04 78)",
          muted:   "oklch(62% 0.12 78)",
        },

        // ── Positive (sage: ok / NORMAL) ────────────────────────────────
        ok: {
          DEFAULT: "oklch(62% 0.10 152)",
          soft:    "oklch(95% 0.04 152)",
          muted:   "oklch(55% 0.09 152)",
        },

        // ── Data accent (tide: chart fills, not chrome) ──────────────────
        tide: {
          100: "oklch(87% 0.05 210)",
          300: "oklch(68% 0.08 210)",
          500: "oklch(50% 0.09 210)",
          700: "oklch(34% 0.07 210)",
        },

        // ── Backwards-compat aliases (legacy markup in some components) ───
        costa:   { 300: "oklch(65% 0.09 210)", 400: "oklch(55% 0.10 210)", 500: "oklch(47% 0.12 210)", 700: "oklch(34% 0.07 210)", 900: "oklch(20% 0.05 215)" },
        paper:   { DEFAULT: "oklch(97% 0.006 80)", 300: "oklch(78% 0.006 90)", 400: "oklch(62% 0.007 90)" },
        "ink-600": "oklch(40% 0.006 240)",
        "ink-700": "oklch(30% 0.006 240)",
        "ink-800": "oklch(22% 0.006 240)",
        cinnabar: { DEFAULT: "oklch(58% 0.20 28)", soft: "oklch(70% 0.16 28)", muted: "oklch(45% 0.14 28)" },
        severity: { critical: "oklch(58% 0.20 28)", high: "oklch(58% 0.20 28)", medium: "oklch(73% 0.13 78)", low: "oklch(62% 0.10 152)" },
        amber: "oklch(73% 0.13 78)",
        sand:  { 300: "oklch(82% 0.06 75)", 500: "oklch(68% 0.09 70)", 700: "oklch(48% 0.08 65)" },
      },

      fontFamily: {
        sans:    ["var(--font-inter)",    "Inter",         "system-ui", "sans-serif"],
        display: ["var(--font-display)",  "Fraunces",      "Georgia",   "serif"],
        mono:    ["var(--font-mono)",     "JetBrains Mono","Fira Code", "monospace"],
      },

      fontSize: {
        "2xs": ["10px", { lineHeight: "1.4" }],
        "xs":  ["11px", { lineHeight: "1.5" }],
        "sm":  ["13px", { lineHeight: "1.55" }],
        "md":  ["15px", { lineHeight: "1.5" }],
        "lg":  ["17px", { lineHeight: "1.45" }],
      },

      letterSpacing: {
        caps:    "0.08em",     // section labels
        display: "-0.025em",   // big numerals
        tight:   "-0.01em",    // panel titles
      },

      borderRadius: {
        "xl":  "12px",
        "2xl": "16px",
        "3xl": "20px",
      },

      boxShadow: {
        // Felt-style shadows: multi-layer, soft, not harsh
        panel: "0 1px 2px oklch(14% 0.008 240 / 0.06), 0 4px 12px oklch(14% 0.008 240 / 0.08), 0 12px 32px oklch(14% 0.008 240 / 0.06)",
        card:  "0 1px 2px oklch(14% 0.008 240 / 0.05), 0 2px 8px oklch(14% 0.008 240 / 0.06)",
        sm:    "0 1px 3px oklch(14% 0.008 240 / 0.1)",
        none:  "none",
      },

      animation: {
        "panel-in":  "panel-in 0.22s cubic-bezier(0.2, 0.9, 0.4, 1)",
        "fade-in":   "fade-in 0.2s ease-out",
        "slide-up":  "slide-up 0.2s cubic-bezier(0.2, 0.9, 0.4, 1)",
        "ticker":    "ticker 50s linear infinite",
        "live-dot":  "live-dot 2.4s ease-in-out infinite",
        "radar":     "radar 6s linear infinite",
        "pulse-ring":"pulse-ring 2s ease-out infinite",
      },
      keyframes: {
        "panel-in":  { from: { opacity: "0", transform: "translateX(8px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        "fade-in":   { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up":  { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "ticker":    { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        "live-dot":  { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.3" } },
        "radar":     { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
        "pulse-ring":{ "0%": { transform: "scale(0.8)", opacity: "0.9" }, "100%": { transform: "scale(2.4)", opacity: "0" } },
      },
    },
  },
  plugins: [],
};

export default config;
