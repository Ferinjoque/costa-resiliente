"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApiHealth } from "@/lib/queries";
import { useUIStore } from "@/store/ui";
import type { SocialSignalCollection, Alert, DecisionLogEntry } from "@/lib/api";

// Primary crisis centroid: Lurigancho-Chosica Quebrada Jicamarca area
const CRISIS_CENTER: [number, number] = [-76.855, -11.968];

interface IncomingSignal {
  coords: [number, number];
  source: string;
  label: string;
  confidence: number;
  district_id: number | null;
  district_name: string;
  text: string;
}

const SIGNAL_POOL: IncomingSignal[] = [
  { coords: [-76.848, -11.963], source: "bluesky",  label: "needs_help",            confidence: 0.91, district_id: 1,    district_name: "Lurigancho", text: "Sector Ñaña bajo agua, familia en segundo piso pide ayuda. Nivel sube rápido. [PII eliminado]" },
  { coords: [-76.862, -11.971], source: "telegram", label: "road_blocked",           confidence: 0.87, district_id: 1,    district_name: "Lurigancho", text: "Carretera Central km 23 cortada por huayco. No pasen. Desvío por Av. Las Torres." },
  { coords: [-77.051, -11.882], source: "reddit",   label: "infrastructure_damage",  confidence: 0.78, district_id: 6,    district_name: "Carabayllo", text: "Puente sobre Chillón tiene grietas visibles cerca de Carabayllo norte. Alguien avisó a la muni?" },
  { coords: [-76.793, -11.968], source: "bluesky",  label: "weather_observation",    confidence: 0.65, district_id: null, district_name: "Chaclacayo", text: "Lluvia muy fuerte en Chaclacayo desde las 2am, ya cayó más que ayer todo el día." },
  { coords: [-76.924, -11.953], source: "bluesky",  label: "road_blocked",           confidence: 0.83, district_id: null, district_name: "San Juan de Lurigancho", text: "Av. Wiesse bloqueada por lodo cerca de paradero 10. Tráfico paralizado." },
  { coords: [-77.063, -11.875], source: "telegram", label: "needs_help",             confidence: 0.94, district_id: 6,    district_name: "Carabayllo", text: "Asentamiento El Progreso inundado. Hay adultos mayores que no pueden moverse. Necesitamos bote. [PII eliminado]" },
  { coords: [-76.853, -11.977], source: "bluesky",  label: "infrastructure_damage",  confidence: 0.76, district_id: 1,    district_name: "Lurigancho", text: "Muro de contención en Jicamarca cedió. El agua está pasando hacia las casas de abajo." },
  { coords: [-76.793, -11.954], source: "reddit",   label: "weather_observation",    confidence: 0.71, district_id: null, district_name: "Chaclacayo", text: "r/Lima: La estación de Chaclacayo marcó 38mm en 6h. Alguien más con datos del ANA?" },
  { coords: [-76.910, -12.045], source: "bluesky",  label: "road_blocked",           confidence: 0.88, district_id: 2,    district_name: "Ate", text: "Entrada a Huachipa completamente bloqueada, agua sobre la calzada. Tomo foto: [imagen]" },
  { coords: [-76.948, -12.038], source: "telegram", label: "needs_help",             confidence: 0.93, district_id: 2,    district_name: "Ate", text: "Hospital Huachipa rodeado de agua, ambulancias no pueden entrar ni salir. Urgente coordinación. [PII eliminado]" },
  { coords: [-77.035, -11.878], source: "bluesky",  label: "road_blocked",           confidence: 0.80, district_id: 6,    district_name: "Carabayllo", text: "Canta–Lima cortada en km 4. Hay un deslizamiento. Vehículos parados en ambos lados." },
  { coords: [-76.870, -11.965], source: "bluesky",  label: "needs_help",             confidence: 0.86, district_id: 1,    district_name: "Lurigancho", text: "Quebrada Jicamarca activa, escucho rugido, piedras bajando. Vecinos corriendo. Alguien llame a defensa civil!" },
];

let _nextId = 200;
let _logId = 500;

export function DemoLiveSimulator() {
  const { data: health, isError } = useApiHealth();
  const queryClient = useQueryClient();
  const { addToast, setFlyToPoint } = useUIStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(0);
  const zoomedRef = useRef(false);

  const isDemo = !health || health.status !== "ok" || isError;

  // Fly to the primary crisis area shortly after page loads so the flood
  // zone is immediately visible without needing to interact.
  useEffect(() => {
    if (!isDemo || zoomedRef.current) return;
    const t = setTimeout(() => {
      if (zoomedRef.current) return;
      zoomedRef.current = true;
      setFlyToPoint(CRISIS_CENTER);
    }, 1_500);
    return () => clearTimeout(t);
  }, [isDemo, setFlyToPoint]);

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
              text: signal.text,
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

      // Inject a decision log entry so the log panel shows live activity
      queryClient.setQueryData<DecisionLogEntry[]>(["decision-log", 100], (old) => {
        if (!old) return old;
        const entry: DecisionLogEntry = {
          id: _logId++,
          logged_at: new Date().toISOString(),
          operator_id: "sistema-auto",
          action_type: "social_signal_received",
          alert_id: null,
          payload: {
            source: signal.source,
            label: signal.label,
            district: signal.district_name,
            confidence: signal.confidence,
          },
          session_id: "demo",
        };
        return [entry, ...old].slice(0, 100);
      });

      addToast({ source: signal.source, label: signal.label, district: signal.district_name });

      const delay = 28_000 + Math.random() * 17_000;
      timerRef.current = setTimeout(injectNextSignal, delay);
    }

    timerRef.current = setTimeout(injectNextSignal, 4_000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isDemo, queryClient, addToast]);

  return null;
}
