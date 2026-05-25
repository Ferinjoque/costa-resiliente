"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useUIStore } from "@/store/ui";
import { fetchShareToken } from "@/lib/api";

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
        applyScenario(decoded);
      } catch {
        // malformed — ignore
      }
      return;
    }

    if (!token) return;
    loaded.current = true;
    fetchShareToken(token)
      .then(({ scenario }) => applyScenario(scenario))
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

  function applyScenario(scenario: {
    districtUbigeo?: string | null;
    districtName?: string | null;
    timeWindowHours?: number;
    isReplayMode?: boolean;
    replayDate?: string | null;
    activeLayers?: string[];
  }) {
    setScenario({
      districtUbigeo: scenario.districtUbigeo ?? null,
      districtName: scenario.districtName ?? null,
      timeWindowHours: scenario.timeWindowHours ?? 24,
      isReplayMode: scenario.isReplayMode ?? false,
      replayDate: scenario.replayDate ?? null,
    });
    const target = new Set(scenario.activeLayers ?? []);
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
