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
  const { setScenario, toggleLayer, activeLayers, setShareMode } = useUIStore();

  useEffect(() => {
    if (!token || loaded.current) return;
    loaded.current = true;

    fetchShareToken(token)
      .then(({ scenario }) => {
        setScenario({
          districtUbigeo: scenario.districtUbigeo,
          districtName: scenario.districtName,
          timeWindowHours: scenario.timeWindowHours,
          isReplayMode: scenario.isReplayMode,
          replayDate: scenario.replayDate,
        });

        // Sync activeLayers: remove layers not in snapshot, add layers in snapshot
        const target = new Set(scenario.activeLayers);
        for (const key of activeLayers) {
          if (!target.has(key)) toggleLayer(key);
        }
        for (const key of target) {
          if (!activeLayers.has(key)) toggleLayer(key);
        }

        setShareMode(true);
      })
      .catch(() => {
        // Invalid/expired token — ignore silently, continue in normal mode
      });
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
