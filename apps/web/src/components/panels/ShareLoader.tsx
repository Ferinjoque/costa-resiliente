"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useUIStore } from "@/store/ui";
import { fetchShareToken } from "@/lib/api";

const KNOWN_LAYERS = new Set([
  "districts", "imerg", "flood", "huayco", "hazard",
  "infrastructure", "social", "stations", "shelters",
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UBIGEO_RE   = /^\d{6}$/;

/**
 * Reads ?share=<token> on mount and hydrates Zustand store from the resolved
 * scenario. Enables read-only mode so judges can load a shared link without auth.
 * Renders nothing visible — side-effects only.
 */
export function ShareLoader() {
  const searchParams = useSearchParams();
  const token = searchParams.get("share");
  const loaded = useRef(false);
  const { setScenario, toggleLayer, activeLayers, setShareMode, addToast, locale } = useUIStore();

  const stateParam = searchParams.get("state");

  useEffect(() => {
    if (loaded.current) return;

    // Client-side encoded state (no backend needed)
    if (stateParam) {
      loaded.current = true;
      try {
        const decoded = JSON.parse(atob(stateParam));
        applyScenario(sanitize(decoded));
      } catch {
        // malformed — ignore
      }
      return;
    }

    if (!token) return;
    loaded.current = true;
    fetchShareToken(token)
      .then(({ scenario }) => applyScenario(sanitize(scenario)))
      .catch(() => {
        addToast({
          message: locale === "es"
            ? "Enlace de compartición no válido o expirado"
            : "Share link is invalid or expired",
          variant: "danger",
        });
      });
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reject out-of-range / wrong-type values from untrusted URL params.
  function sanitize(raw: unknown) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const ubigeo =
      typeof r.districtUbigeo === "string" && UBIGEO_RE.test(r.districtUbigeo)
        ? r.districtUbigeo
        : null;
    const name =
      typeof r.districtName === "string" && r.districtName.length <= 120
        ? r.districtName
        : null;
    const hours = typeof r.timeWindowHours === "number"
      ? Math.min(Math.max(Math.round(r.timeWindowHours), 1), 168)
      : 24;
    const replay = r.isReplayMode === true;
    const replayDate =
      typeof r.replayDate === "string" && ISO_DATE_RE.test(r.replayDate)
        ? r.replayDate
        : null;
    const layers = Array.isArray(r.activeLayers)
      ? (r.activeLayers as unknown[])
          .filter((k): k is string => typeof k === "string" && KNOWN_LAYERS.has(k))
          .slice(0, KNOWN_LAYERS.size)
      : [];
    return {
      districtUbigeo: ubigeo,
      districtName: name,
      timeWindowHours: hours,
      isReplayMode: replay,
      replayDate,
      activeLayers: layers,
    };
  }

  function applyScenario(scenario: {
    districtUbigeo: string | null;
    districtName: string | null;
    timeWindowHours: number;
    isReplayMode: boolean;
    replayDate: string | null;
    activeLayers: string[];
  }) {
    setScenario({
      districtUbigeo: scenario.districtUbigeo,
      districtName: scenario.districtName,
      timeWindowHours: scenario.timeWindowHours,
      isReplayMode: scenario.isReplayMode,
      replayDate: scenario.replayDate,
    });
    const target = new Set(scenario.activeLayers);
    for (const key of activeLayers) {
      if (!target.has(key)) toggleLayer(key);
    }
    for (const key of target) {
      if (!activeLayers.has(key)) toggleLayer(key);
    }
    setShareMode(true);
  }

  return null;
}
