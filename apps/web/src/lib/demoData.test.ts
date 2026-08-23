import { describe, it, expect } from "vitest";
import { DEMO_DISTRICTS } from "./demoData";

/**
 * Offline demo data is what a judge sees if the API is unreachable mid-demo, so
 * it has to carry the same official codes as the live database. The Lima UBIGEO
 * map was wrong until 2026-08-23: "Pueblo Libre" and "Magdalena Vieja" were
 * listed as two districts (they are one, INEI 150121), shifting every code from
 * 150125 onward and putting San Juan de Lurigancho on 150133 — which is really
 * San Juan de Miraflores.
 *
 * Authoritative source: CENEPRED COEN FEN 2023 service, field id_dist.
 */
const OFFICIAL_UBIGEOS: Record<string, string> = {
  Lima: "150101",
  Ate: "150103",
  Carabayllo: "150106",
  Chaclacayo: "150107",
  Chorrillos: "150108",
  Comas: "150110",
  "La Molina": "150114",
  Lurigancho: "150118",
  "Puente Piedra": "150125",
  "San Juan de Lurigancho": "150132",
  "San Martín de Porres": "150135",
  "Santa Anita": "150137",
  "Santiago de Surco": "150140",
  "Villa El Salvador": "150142",
  "Villa María del Triunfo": "150143",
};

describe("demo district catalogue", () => {
  const byName = new Map(
    DEMO_DISTRICTS.features.map((f) => [f.properties.name as string, f.properties]),
  );

  it("uses official INEI UBIGEO codes", () => {
    for (const [name, ubigeo] of Object.entries(OFFICIAL_UBIGEOS)) {
      const district = byName.get(name);
      if (!district) continue; // not every district is part of the demo subset
      expect(district.ubigeo, `${name} has the wrong UBIGEO`).toBe(ubigeo);
    }
  });

  it("has no duplicate UBIGEO codes", () => {
    const codes = DEMO_DISTRICTS.features.map((f) => f.properties.ubigeo);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("uses six-digit numeric UBIGEO codes throughout", () => {
    for (const feature of DEMO_DISTRICTS.features) {
      expect(String(feature.properties.ubigeo)).toMatch(/^\d{6}$/);
    }
  });

  it("never reuses one district's population figure for another", () => {
    // A duplicated population means one of them was copied rather than sourced;
    // San Juan de Miraflores carried Puente Piedra's count until 2026-08-23.
    const populations = DEMO_DISTRICTS.features
      .map((f) => f.properties.population)
      .filter((p): p is number => typeof p === "number" && p > 0);
    expect(new Set(populations).size).toBe(populations.length);
  });
});
