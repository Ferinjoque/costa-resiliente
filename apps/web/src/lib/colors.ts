/**
 * Token-derived color constants for SVG / inline-style consumers that can't
 * use Tailwind utility classes. Keep in sync with:
 *   - tailwind.config.ts (theme.extend.colors.severity / costa / sand)
 *   - src/app/globals.css (:root --color-* properties)
 *
 * Anything outside that file or this module that defines a raw hex for a
 * brand / severity color is a regression — replace with these constants.
 */

// ── SINAGERD-aligned severity (OKLCH) ──────────────────────────────────────
export const SEVERITY_CRITICAL = "oklch(60% 0.20 28)";   // cinnabar
export const SEVERITY_HIGH     = "oklch(70% 0.16 55)";   // burnt ochre
export const SEVERITY_MEDIUM   = "oklch(80% 0.14 85)";   // mustard amber
export const SEVERITY_LOW      = "oklch(65% 0.11 155)";  // muted sage

// ── Costa (brand, Pacific-coast teal) ──────────────────────────────────────
export const COSTA_300 = "oklch(75% 0.105 208)";
export const COSTA_400 = "oklch(65% 0.115 207)";
export const COSTA_500 = "oklch(55% 0.115 207)";
export const COSTA_700 = "oklch(36% 0.085 210)";
export const COSTA_900 = "oklch(20% 0.045 215)";

// ── Sand (warm operational accent) ─────────────────────────────────────────
export const SAND_300 = "oklch(82% 0.05 70)";
export const SAND_500 = "oklch(70% 0.08 65)";

// ── Semantic aliases for chart series + map legend swatches ────────────────
export const RISK_COLOR = {
  alto:     SEVERITY_CRITICAL,
  moderado: SEVERITY_HIGH,
  bajo:     SEVERITY_LOW,
} as const;

export const HUAYCO_COLOR = {
  very_high: SEVERITY_CRITICAL,
  high:      SEVERITY_HIGH,
  moderate:  SEVERITY_MEDIUM,
  low:       SEVERITY_LOW,
} as const;

export const SEVERITY_COLOR = {
  critical: SEVERITY_CRITICAL,
  high:     SEVERITY_HIGH,
  medium:   SEVERITY_MEDIUM,
  low:      COSTA_400,
} as const;

export const SOCIAL_LABEL_COLOR = {
  needs_help:            SEVERITY_CRITICAL,
  infrastructure_damage: SEVERITY_HIGH,
  road_blocked:          SEVERITY_MEDIUM,
  huayco_observation:    SEVERITY_CRITICAL,  // huayco sighting = same urgency as help request
  flood_observation:     SEVERITY_HIGH,      // flood sighting = high priority situational awareness
  weather_observation:   COSTA_300,
} as const;

export const STATION_COLOR = {
  alert:  SEVERITY_HIGH,
  warn:   SEVERITY_MEDIUM,
  normal: SEVERITY_LOW,
} as const;

export const INFRA_COLOR = {
  hospital:         SEVERITY_CRITICAL,
  shelter:          SEVERITY_LOW,
  fire_station:     SEVERITY_HIGH,
  relief_warehouse: "#38bdf8",
  police_station:   "#818cf8",
  bridge:           SAND_500,
  school:           SEVERITY_MEDIUM,
} as const;

// ── IMERG rainfall gradient (rain accumulation) ────────────────────────────
// Dry deep-water → soaked critical; preserves the original visual progression.
export const RAIN_STOPS = [
  COSTA_900,
  COSTA_700,
  COSTA_300,
  SEVERITY_MEDIUM,
  SEVERITY_HIGH,
  SEVERITY_CRITICAL,
] as const;
