"use client";

import { useImergObserved, useFlood, useHuayco, useWeather } from "@/lib/queries";
import { useUIStore } from "@/store/ui";
import { timeAgo, stalenessLevel } from "@/lib/utils";

// Staleness thresholds in minutes per layer
const STALE_THRESHOLDS: Record<string, number> = {
  IMERG: 480,  // Early Run trails real time by ~4-5 h; stale past 8 h
  SAR: 360,    // daily revisit, 6h grace
  Huayco: 240, // derived from SAR, 4h grace
  Clima: 35,   // Open-Meteo, 15 min ingest cadence
};

// Color tokens by staleness level
const LEVEL_COLORS: Record<string, { label: string; time: string; dot: string }> = {
  ok:    { label: "oklch(80% 0 0 / 0.45)", time: "oklch(80% 0 0 / 0.6)", dot: "bg-ok/70" },
  warn:  { label: "oklch(78% 0.15 80 / 0.7)", time: "oklch(78% 0.15 80 / 0.85)", dot: "bg-warn/70" },
  stale: { label: "oklch(65% 0.18 25 / 0.8)", time: "oklch(65% 0.18 25 / 0.9)", dot: "bg-danger/60" },
};

// Compact freshness strip on the map canvas: dark surface, minimal.
export function DataFreshnessBar() {
  // IMERG shows the real NASA observations, not the scenario accumulations.
  const { data: imerg,  isPending: imergPending }  = useImergObserved();
  const { data: flood,  isPending: floodPending }  = useFlood();
  const { data: huayco, isPending: huaycoPending } = useHuayco();
  const { data: weather, isPending: weatherPending } = useWeather();
  const { locale }       = useUIStore();

  // "sin datos" is a claim about the feed, not about this component. Before the
  // queries resolve there is nothing to claim yet, and the first paint used to
  // assert that all three primary layers had received nothing — the worst
  // possible opening frame for a console judged on timeliness.
  //
  // A scenario layer reports "escenario", not an age. Its timestamps are
  // refreshed by the seeder, so "hace 1 min" on them claimed a freshness the
  // data never had. IMERG (real NASA observations, ~5 h latency) and Clima are
  // the live feeds, so theirs are the ages to watch advance.
  const items = [
    { label: "IMERG",  at: imerg?.data_updated_at ?? undefined,              pending: imergPending,  demo: false },
    { label: "SAR",    at: flood?.data_updated_at  ?? flood?.retrieved_at,  pending: floodPending,  demo: !!flood?.is_demo_data },
    { label: "Huayco", at: huayco?.data_updated_at ?? huayco?.retrieved_at, pending: huaycoPending, demo: !!huayco?.is_demo_data },
    { label: "Clima",  at: weather?.data_updated_at ?? undefined,           pending: weatherPending, demo: false },
  ];

  return (
    <div
      className="hidden sm:flex items-center gap-3 absolute bottom-[42px] left-1/2 -translate-x-1/2 z-10 pointer-events-none select-none"
      aria-label={locale === "en" ? "Data freshness" : "Frescura de datos"}
      role="status"
    >
      {items.map(({ label, at, pending, demo }, i) => {
        // While a query is in flight the layer is neither fresh nor empty, so it
        // reports neither: an ellipsis holds the space until the answer lands.
        const level = pending || demo ? "ok" : stalenessLevel(at, STALE_THRESHOLDS[label] ?? 60);
        const colors = LEVEL_COLORS[level];
        const ageText = pending
          ? "…"
          : demo ? (locale === "en" ? "scenario" : "escenario")
          : at ? timeAgo(at, locale === "en" ? "en" : "es") : (locale === "en" ? "no data" : "sin datos");
        const titleText = pending
          ? (locale === "en" ? `${label}: loading` : `${label}: cargando`)
          : demo
          ? (locale === "en" ? `${label}: scenario data, not a live observation` : `${label}: datos de escenario, no es una observación en vivo`)
          : at
          ? (locale === "en" ? `${label}: last update ${ageText}` : `${label}: última actualización ${ageText}`)
          : (locale === "en" ? `${label}: no data received` : `${label}: sin datos recibidos`);

        return (
          <span key={label} className="flex items-center gap-1.5" title={titleText}>
            {i > 0 && (
              <span className="w-px h-3" style={{ background: "oklch(80% 0 0 / 0.2)" }} aria-hidden="true" />
            )}
            {level !== "ok" && (
              <span className={`w-1 h-1 rounded-full shrink-0 ${colors.dot}`} aria-hidden="true" />
            )}
            <span className="text-2xs font-bold uppercase tracking-widest" style={{ color: colors.label }}>
              {label}
            </span>
            <span className="text-2xs font-mono tabular-nums" style={{ color: colors.time }}>
              {ageText}
            </span>
          </span>
        );
      })}
    </div>
  );
}
