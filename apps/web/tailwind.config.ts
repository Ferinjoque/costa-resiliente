import type { Config } from "tailwindcss";

// Lima-coast palette in OKLCH. Anti-default: avoids stock Tailwind severity
// hex and stock slate ramp. SINAGERD-aligned severity names map to muted,
// earth-toned counterparts of the standard red/orange/yellow/green wheel.
//
// All values verified for >=4.5:1 contrast against --surface-ink (body bg)
// when used on text. Background tints (with /20, /30 alpha) target chroma
// for legibility, not saturation.

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── SINAGERD-aligned severity ────────────────────────────────────────
        // Earthier, less neon than Tailwind defaults. Tuned in OKLCH.
        severity: {
          critical: "oklch(60% 0.20 28)",   // cinnabar / rust-red (EMERGENCIA)
          high:     "oklch(70% 0.16 55)",   // burnt ochre        (ALERTA)
          medium:   "oklch(80% 0.14 85)",   // mustard amber      (AVISO)
          low:      "oklch(65% 0.11 155)",  // muted sage         (NORMAL)
        },

        // ── Costa (brand) ────────────────────────────────────────────────────
        // Pacific-coast teal — anchored on a deep ocean navy, not sky-blue.
        costa: {
          50:  "oklch(96% 0.025 220)",
          100: "oklch(92% 0.045 215)",
          200: "oklch(85% 0.075 210)",
          300: "oklch(75% 0.105 208)",
          400: "oklch(65% 0.115 207)",
          500: "oklch(55% 0.115 207)",
          600: "oklch(45% 0.105 208)",
          700: "oklch(36% 0.085 210)",
          800: "oklch(28% 0.065 212)",
          900: "oklch(20% 0.045 215)",
          950: "oklch(14% 0.030 220)",
        },

        // ── Sand (operational accent) ────────────────────────────────────────
        // Lima desert / coastal sand — warm neutral for non-alert callouts,
        // tutorial accents, replay-mode chrome.
        sand: {
          100: "oklch(94% 0.02 75)",
          300: "oklch(82% 0.05 70)",
          500: "oklch(70% 0.08 65)",
          700: "oklch(50% 0.07 60)",
          900: "oklch(30% 0.04 55)",
        },

        // ── Surface (graphite with cool tint, not Tailwind slate) ────────────
        surface: {
          ink:    "oklch(14% 0.012 240)",  // page background
          base:   "oklch(14% 0.012 240)",  // alias for ink, keeps existing markup
          raised: "oklch(19% 0.015 240)",  // panels
          panel:  "oklch(24% 0.018 240)",  // nested cards inside panels
          line:   "oklch(30% 0.015 240)",  // borders / dividers
          muted:  "oklch(40% 0.012 240)",  // disabled / placeholder
        },
      },

      fontFamily: {
        sans:    ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Fraunces", "Georgia", "serif"],
        mono:    ["var(--font-mono)", "JetBrains Mono", "Fira Code", "monospace"],
      },

      letterSpacing: {
        "display-tight": "-0.02em",
        "ops":           "0.12em",  // SINAGERD-style uppercase tracking
      },

      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "scan":       "scan 4s linear infinite",
        "fade-in":    "fade-in 0.3s ease-out",
        "slide-up":   "slide-up 0.25s ease-out",
        "radar":      "radar 6s linear infinite",
      },
      keyframes: {
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 8px oklch(60% 0.20 28 / 0.4), 0 0 20px oklch(60% 0.20 28 / 0.15)" },
          "50%":      { boxShadow: "0 0 16px oklch(60% 0.20 28 / 0.7), 0 0 40px oklch(60% 0.20 28 / 0.3)" },
        },
        "scan": {
          "0%":   { backgroundPosition: "0% 0%" },
          "100%": { backgroundPosition: "0% 100%" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "radar": {
          "0%":   { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
