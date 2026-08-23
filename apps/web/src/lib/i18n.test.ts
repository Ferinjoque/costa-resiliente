import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { t, useT } from "./i18n";

describe("t()", () => {
  it("returns the Spanish string by default locale usage", () => {
    expect(t("nav", "alerts", "es")).toBe("Alertas");
    expect(t("nav", "alerts", "en")).toBe("Alerts");
  });

  it("binds a locale via useT", () => {
    const tr = useT("en");
    expect(tr("nav", "map")).toBe("Map");
  });
});

describe("next-intl message catalogues", () => {
  const load = (file: string) =>
    JSON.parse(readFileSync(resolve(__dirname, "../../messages", file), "utf-8"));

  const flatten = (obj: Record<string, unknown>, prefix = ""): string[] =>
    Object.entries(obj).flatMap(([key, value]) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? [`${prefix}${key}`, ...flatten(value as Record<string, unknown>, `${prefix}${key}.`)]
        : [`${prefix}${key}`],
    );

  it("es and en define exactly the same keys", () => {
    // A key present in one catalogue only renders as a raw key path in the UI —
    // a Spanish-first emergency console must not show `alerts.title` to a duty
    // officer who toggled to English mid-shift.
    const es = flatten(load("es.json")).sort();
    const en = flatten(load("en.json")).sort();
    expect(es).toEqual(en);
  });

  it("has no empty translation values", () => {
    const collectEmpty = (obj: Record<string, unknown>, prefix = ""): string[] =>
      Object.entries(obj).flatMap(([key, value]) => {
        if (value && typeof value === "object") {
          return collectEmpty(value as Record<string, unknown>, `${prefix}${key}.`);
        }
        return typeof value === "string" && value.trim() === "" ? [`${prefix}${key}`] : [];
      });

    expect(collectEmpty(load("es.json"))).toEqual([]);
    expect(collectEmpty(load("en.json"))).toEqual([]);
  });
});
