"use client";

import { useState } from "react";
import { Radio, MapPin, X, Filter } from "lucide-react";
import { clsx } from "clsx";
import { useUIStore } from "@/store/ui";
import { useSocialSignals } from "@/lib/queries";
import type { SocialSignalProperties } from "@/lib/api";

const LABEL_ES: Record<string, string> = {
  needs_help:            "Ayuda urgente",
  road_blocked:          "Vía bloqueada",
  infrastructure_damage: "Daño infraestructura",
  weather_observation:   "Observación meteo",
};

const LABEL_EN: Record<string, string> = {
  needs_help:            "Urgent help",
  road_blocked:          "Road blocked",
  infrastructure_damage: "Infrastructure damage",
  weather_observation:   "Weather observation",
};

const LABEL_COLOR: Record<string, string> = {
  needs_help:            "bg-red-900/40 text-red-300 border-red-700/50",
  road_blocked:          "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
  infrastructure_damage: "bg-orange-900/40 text-orange-300 border-orange-700/50",
  weather_observation:   "bg-blue-900/40 text-blue-300 border-blue-700/50",
};

const LABEL_DOT: Record<string, string> = {
  needs_help:            "bg-red-500",
  road_blocked:          "bg-yellow-400",
  infrastructure_damage: "bg-orange-400",
  weather_observation:   "bg-blue-400",
};

const SOURCE_BADGE: Record<string, string> = {
  bluesky:  "text-sky-400 bg-sky-900/30 border-sky-700/50",
  telegram: "text-blue-400 bg-blue-900/30 border-blue-700/50",
  reddit:   "text-orange-400 bg-orange-900/30 border-orange-700/50",
};

function timeAgoShort(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

const ALL_LABELS = ["needs_help", "road_blocked", "infrastructure_damage", "weather_observation"] as const;
type Label = typeof ALL_LABELS[number];

function SignalRow({
  props,
  locale,
  onFly,
  isNew,
}: {
  props: SocialSignalProperties;
  locale: "es" | "en";
  onFly: () => void;
  isNew: boolean;
}) {
  const label = props.triage_label ?? "unknown";
  const labelText = locale === "es" ? (LABEL_ES[label] ?? label) : (LABEL_EN[label] ?? label);
  const dotColor = LABEL_DOT[label] ?? "bg-slate-400";
  const badgeCls = LABEL_COLOR[label] ?? "bg-slate-800 text-slate-300 border-slate-600";
  const srcCls = SOURCE_BADGE[props.source] ?? "text-slate-400 bg-slate-800 border-slate-600";

  return (
    <li
      className={clsx(
        "px-3 py-2.5 border-b border-slate-700/50 last:border-0 transition-all",
        isNew && "bg-costa-900/20 border-l-2 border-l-costa-500",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={clsx("mt-1 w-2 h-2 rounded-full shrink-0", dotColor)}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={clsx("text-[10px] border rounded-full px-1.5 py-0.5 font-medium", badgeCls)}>
              {labelText}
            </span>
            <span className={clsx("text-[10px] border rounded-full px-1.5 py-0.5", srcCls)}>
              {props.source}
            </span>
          </div>
          {props.text && (
            <p className="text-[11px] text-slate-200 mt-1 leading-snug line-clamp-2">
              {props.text}
            </p>
          )}
          <div className="flex items-center gap-1 mt-1">
            <p className="text-[10px] text-slate-500 truncate flex-1">
              {props.district_name ?? "—"}
            </p>
            <p className="text-[10px] text-slate-500 shrink-0">{timeAgoShort(props.ingested_at)}</p>
            {props.triage_confidence != null && (
              <p className="text-[10px] text-slate-500 shrink-0">
                {Math.round(props.triage_confidence * 100)}%
              </p>
            )}
            <button
              onClick={onFly}
              className="shrink-0 text-slate-600 hover:text-costa-400 transition-colors"
              title={locale === "es" ? "Ver en mapa" : "Show on map"}
              aria-label={locale === "es" ? "Ver en mapa" : "Show on map"}
            >
              <MapPin size={11} />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

export function SocialFeedPanel() {
  const { activePanel, setActivePanel, locale, setFlyToPoint } = useUIStore();
  const { data: signals, dataUpdatedAt } = useSocialSignals(48);
  const [labelFilter, setLabelFilter] = useState<Label | "all">("all");
  const [showFilter, setShowFilter] = useState(false);

  if (activePanel !== "social") return null;

  const features = (signals?.features ?? []).slice().reverse();
  const filtered = labelFilter === "all"
    ? features
    : features.filter((f) => f.properties.triage_label === labelFilter);

  const newestId = features[0]?.properties.id;

  const FILTER_LABELS: Array<{ value: Label | "all"; es: string; en: string }> = [
    { value: "all",                  es: "Todos",          en: "All" },
    { value: "needs_help",           es: "Ayuda",          en: "Help" },
    { value: "road_blocked",         es: "Vía",            en: "Road" },
    { value: "infrastructure_damage",es: "Infraestructura",en: "Infra" },
    { value: "weather_observation",  es: "Meteo",          en: "Weather" },
  ];

  return (
    <aside
      className={[
        "fixed bottom-14 left-0 right-0 h-[65vh] rounded-t-2xl",
        "sm:absolute sm:top-4 sm:right-4 sm:bottom-4 sm:left-auto sm:h-auto sm:w-80 sm:max-w-sm sm:rounded-xl",
        "bg-surface-raised border border-slate-700 shadow-xl z-20 flex flex-col panel-animate",
      ].join(" ")}
      aria-label={locale === "es" ? "Señales sociales en tiempo real" : "Real-time social signals"}
      role="complementary"
    >
      <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
        <div className="w-8 h-1 rounded-full bg-slate-600" />
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
        <Radio size={15} className="text-costa-500 animate-pulse" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-white">
          {locale === "es" ? "Señales sociales" : "Social signals"}
        </h2>
        {features.length > 0 && (
          <span className="text-[9px] bg-costa-700 text-white px-1.5 rounded-full">
            {features.length}
          </span>
        )}
        <button
          onClick={() => setShowFilter((o) => !o)}
          className={clsx(
            "ml-auto text-slate-400 hover:text-white transition-colors rounded",
            showFilter && "text-costa-400",
          )}
          aria-label={locale === "es" ? "Filtrar por tipo" : "Filter by type"}
          aria-pressed={showFilter}
        >
          <Filter size={14} />
        </button>
        <button
          onClick={() => setActivePanel("map")}
          className="text-slate-400 hover:text-white transition-colors rounded focus-visible:ring-2 focus-visible:ring-costa-500 focus-visible:outline-none"
          aria-label={locale === "es" ? "Cerrar panel" : "Close panel"}
        >
          <X size={15} />
        </button>
      </div>

      {/* Filter pills */}
      {showFilter && (
        <div className="px-3 py-2 border-b border-slate-700 flex gap-1 flex-wrap">
          {FILTER_LABELS.map(({ value, es, en }) => (
            <button
              key={value}
              onClick={() => setLabelFilter(value)}
              className={clsx(
                "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                labelFilter === value
                  ? "bg-costa-700 border-costa-600 text-white"
                  : "bg-surface-panel border-slate-600 text-slate-300 hover:border-costa-600",
              )}
            >
              {locale === "es" ? es : en}
            </button>
          ))}
        </div>
      )}

      {/* Source legend row */}
      <div className="px-3 py-1.5 border-b border-slate-700/50 flex gap-2 flex-wrap">
        {(["bluesky", "telegram", "reddit"] as const).map((src) => (
          <span key={src} className={clsx("text-[9px] border rounded-full px-1.5 py-0.5", SOURCE_BADGE[src])}>
            {src}
          </span>
        ))}
        <span className="text-[9px] text-slate-500 ml-auto">
          {locale === "es" ? "triaje IA · Presidio PII" : "AI triage · Presidio PII"}
        </span>
      </div>

      {/* Feed */}
      <ul
        className="flex-1 overflow-y-auto"
        role="list"
        aria-label={locale === "es" ? "Feed de señales" : "Signal feed"}
        aria-live="polite"
      >
        {filtered.length === 0 && (
          <li className="px-4 py-8 text-xs text-slate-400 text-center">
            {locale === "es" ? "Sin señales en el período seleccionado" : "No signals in selected period"}
          </li>
        )}
        {filtered.map((f) => (
          <SignalRow
            key={f.properties.id}
            props={f.properties}
            locale={locale}
            isNew={f.properties.id === newestId}
            onFly={() => {
              const [lng, lat] = f.geometry.type === "Point"
                ? (f.geometry.coordinates as [number, number])
                : [null, null];
              if (lng != null && lat != null) {
                setFlyToPoint([lng, lat]);
                setActivePanel("map");
              }
            }}
          />
        ))}
      </ul>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-700 text-[10px] text-slate-500 text-center">
        {dataUpdatedAt
          ? `${locale === "es" ? "Actualizado" : "Updated"} · ${timeAgoShort(new Date(dataUpdatedAt).toISOString())}`
          : (locale === "es" ? "Esperando señales…" : "Waiting for signals…")}
      </div>
    </aside>
  );
}
