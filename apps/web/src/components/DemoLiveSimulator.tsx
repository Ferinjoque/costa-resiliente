"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApiHealth } from "@/lib/queries";
import { useUIStore } from "@/store/ui";
import type { SocialSignalCollection, Alert } from "@/lib/api";

interface IncomingSignal {
  coords: [number, number];
  source: string;
  label: string;
  confidence: number;
  district_id: number | null;
  district_name: string;
}

const SIGNAL_POOL: IncomingSignal[] = [
  { coords: [-76.848, -11.963], source: "bluesky",  label: "needs_help",            confidence: 0.91, district_id: 1,    district_name: "Lurigancho" },
  { coords: [-76.862, -11.971], source: "telegram", label: "road_blocked",           confidence: 0.87, district_id: 1,    district_name: "Lurigancho" },
  { coords: [-77.051, -11.882], source: "reddit",   label: "infrastructure_damage",  confidence: 0.78, district_id: 6,    district_name: "Carabayllo" },
  { coords: [-76.793, -11.968], source: "bluesky",  label: "weather_observation",    confidence: 0.65, district_id: null, district_name: "Chaclacayo" },
  { coords: [-76.924, -11.953], source: "bluesky",  label: "road_blocked",           confidence: 0.83, district_id: null, district_name: "San Juan de Lurigancho" },
  { coords: [-77.063, -11.875], source: "telegram", label: "needs_help",             confidence: 0.94, district_id: 6,    district_name: "Carabayllo" },
  { coords: [-76.853, -11.977], source: "bluesky",  label: "infrastructure_damage",  confidence: 0.76, district_id: 1,    district_name: "Lurigancho" },
  { coords: [-76.793, -11.954], source: "reddit",   label: "weather_observation",    confidence: 0.71, district_id: null, district_name: "Chaclacayo" },
  { coords: [-76.910, -12.045], source: "bluesky",  label: "road_blocked",           confidence: 0.88, district_id: 2,    district_name: "Ate" },
  { coords: [-76.948, -12.038], source: "telegram", label: "needs_help",             confidence: 0.93, district_id: 2,    district_name: "Ate" },
  { coords: [-77.035, -11.878], source: "bluesky",  label: "road_blocked",           confidence: 0.80, district_id: 6,    district_name: "Carabayllo" },
  { coords: [-76.870, -11.965], source: "bluesky",  label: "needs_help",             confidence: 0.86, district_id: 1,    district_name: "Lurigancho" },
];

let _nextId = 200;

export function DemoLiveSimulator() {
  const { data: health, isError } = useApiHealth();
  const queryClient = useQueryClient();
  const { addToast } = useUIStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(0);

  const isDemo = !health || health.status !== "ok" || isError;

  useEffect(() => {
    if (!isDemo) return;

    function injectNextSignal() {
      const signal = SIGNAL_POOL[indexRef.current % SIGNAL_POOL.length];
      indexRef.current++;

      queryClient.setQueryData<SocialSignalCollection>(
        ["social-signals", 48, undefined],
        (old) => {
          if (!old) return old;
          const newFeature: SocialSignalCollection["features"][number] = {
            type: "Feature",
            geometry: { type: "Point", coordinates: signal.coords },
            properties: {
              id: _nextId++,
              source: signal.source,
              triage_label: signal.label,
              triage_confidence: signal.confidence,
              ingested_at: new Date().toISOString(),
              district_id: signal.district_id,
              district_name: signal.district_name,
            },
          };
          // Keep a rolling window of ~15 features max
          const trimmed = old.features.length >= 15
            ? old.features.slice(old.features.length - 14)
            : old.features;
          return { ...old, features: [...trimmed, newFeature] };
        },
      );

      // Also bump alerts query timestamp to keep freshness bar feeling live
      queryClient.setQueryData<Alert[]>(["alerts", undefined], (old) => old ?? []);

      addToast({ source: signal.source, label: signal.label, district: signal.district_name });

      const delay = 28_000 + Math.random() * 17_000;
      timerRef.current = setTimeout(injectNextSignal, delay);
    }

    // First injection after 20s — gives map time to finish loading
    timerRef.current = setTimeout(injectNextSignal, 20_000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isDemo, queryClient, addToast]);

  return null;
}
