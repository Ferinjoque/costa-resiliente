import { describe, it, expect } from "vitest";
import { HUAYCO_COLOR, INFRA_COLOR, RISK_COLOR, SEVERITY_COLOR, SOCIAL_LABEL_COLOR } from "./colors";

/**
 * The map paints infrastructure with a MapLibre `match` expression and the
 * legend reads INFRA_COLOR. When the two drift, a layer renders in the fallback
 * grey with a legend swatch that claims otherwise — an operator then cannot tell
 * a hospital from a school on a live map.
 */
describe("infrastructure colours", () => {
  const EXPECTED_TYPES = [
    "hospital",
    "shelter",
    "fire_station",
    "relief_warehouse",
    "police_station",
    "bridge",
    "school",
  ];

  it("covers every infrastructure type the API can return", () => {
    for (const type of EXPECTED_TYPES) {
      expect(INFRA_COLOR, `missing colour for ${type}`).toHaveProperty(type);
    }
  });

  it("gives each type a distinct colour", () => {
    const values = Object.values(INFRA_COLOR);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("severity and risk scales", () => {
  it("defines all four severities used by the alerts feed", () => {
    for (const severity of ["critical", "high", "medium", "low"]) {
      expect(SEVERITY_COLOR).toHaveProperty(severity);
    }
  });

  it("defines every district risk level the API can emit", () => {
    // Backend vocabulary: districts.risk_level() and fusion._overall_risk() both
    // return exactly alto | moderado | bajo. A missing key renders as undefined
    // and the district silently loses its shading on the map.
    for (const level of ["alto", "moderado", "bajo"]) {
      expect(RISK_COLOR, `missing colour for ${level}`).toHaveProperty(level);
    }
  });

  it("defines every huayco risk level the ML model can emit", () => {
    for (const level of ["very_high", "high", "moderate", "low"]) {
      expect(HUAYCO_COLOR, `missing colour for ${level}`).toHaveProperty(level);
    }
  });

  it("colours every triage label the social feed can render", () => {
    for (const label of [
      "needs_help",
      "road_blocked",
      "infrastructure_damage",
      "huayco_observation",
      "flood_observation",
      "weather_observation",
    ]) {
      expect(SOCIAL_LABEL_COLOR, `missing colour for ${label}`).toHaveProperty(label);
    }
  });
});
