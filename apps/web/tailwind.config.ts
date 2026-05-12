import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Severity palette — WCAG AA contrast on dark backgrounds
        severity: {
          critical: "#ef4444",  // red-500
          high:     "#f97316",  // orange-500
          medium:   "#eab308",  // yellow-500
          low:      "#22c55e",  // green-500
        },
        // Brand
        costa: {
          50:  "#f0f9ff",
          100: "#e0f2fe",
          500: "#0ea5e9",
          700: "#0369a1",
          900: "#0c4a6e",
        },
        // Dark operational surface
        surface: {
          base:   "#0f172a",  // slate-900
          raised: "#1e293b",  // slate-800
          panel:  "#334155",  // slate-700
        },
      },
      fontFamily: {
        sans: ["Inter var", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
