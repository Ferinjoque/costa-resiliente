import { describe, it, expect, vi, afterEach } from "vitest";
import { timeAgo, ageMinutes, stalenessLevel } from "./utils";

const NOW = new Date("2026-08-23T12:00:00Z").getTime();

function at(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * 60_000).toISOString();
}

afterEach(() => vi.useRealTimers());

function freezeClock() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
}

describe("timeAgo", () => {
  it("renders an em dash for a missing timestamp", () => {
    expect(timeAgo(null)).toBe("-");
    expect(timeAgo(undefined)).toBe("-");
    expect(timeAgo("")).toBe("-");
  });

  it("renders Spanish relative time across each unit boundary", () => {
    freezeClock();
    expect(timeAgo(at(0))).toBe("ahora");
    expect(timeAgo(at(1))).toBe("hace 1 min");
    expect(timeAgo(at(59))).toBe("hace 59 min");
    expect(timeAgo(at(60))).toBe("hace 1h");
    expect(timeAgo(at(23 * 60))).toBe("hace 23h");
    expect(timeAgo(at(24 * 60))).toBe("hace 1d");
  });
});

describe("ageMinutes", () => {
  it("returns null when there is no timestamp", () => {
    expect(ageMinutes(null)).toBeNull();
  });

  it("floors to whole minutes", () => {
    freezeClock();
    expect(ageMinutes(at(0))).toBe(0);
    expect(ageMinutes(at(90))).toBe(90);
  });
});

describe("stalenessLevel", () => {
  it("treats a missing timestamp as stale rather than fresh", () => {
    // A layer that never reported must never render as healthy on an
    // operational dashboard.
    expect(stalenessLevel(null)).toBe("stale");
  });

  it("crosses ok -> warn -> stale at the documented thresholds", () => {
    freezeClock();
    expect(stalenessLevel(at(10), 60)).toBe("ok");
    expect(stalenessLevel(at(59), 60)).toBe("ok");
    expect(stalenessLevel(at(60), 60)).toBe("warn");
    expect(stalenessLevel(at(179), 60)).toBe("warn");
    expect(stalenessLevel(at(180), 60)).toBe("stale");
  });

  it("honours a custom threshold (IMERG uses 70 min, SAR 360)", () => {
    freezeClock();
    expect(stalenessLevel(at(65), 70)).toBe("ok");
    expect(stalenessLevel(at(75), 70)).toBe("warn");
    expect(stalenessLevel(at(300), 360)).toBe("ok");
  });
});
