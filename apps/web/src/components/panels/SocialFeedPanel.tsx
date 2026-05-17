"use client";

import { useState } from "react";
import { Radio, MapPin, X, Filter, Send, PlusCircle } from "lucide-react";
import { clsx } from "clsx";
import { useUIStore } from "@/store/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useSocialSignals } from "@/lib/queries";
import type { SocialSignalProperties, SocialSignalCollection, DecisionLogEntry } from "@/lib/api";
import {
  PanelHeader,
  PanelTitle,
  SectionLabel,
  Button,
  Pill,
  EmptyState,
} from "@/components/ui/primitives";

// ─── Label maps ───────────────────────────────────────────────────────────────

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

// Map triage_label → Pill variant
function labelToPillVariant(label: string): "danger" | "warn" | "accent" | "default" {
  if (label === "needs_help") return "danger";
  if (label === "road_blocked") return "warn";
  if (label === "infrastructure_damage") return "accent";
  return "default";
}

function timeAgoShort(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

const ALL_LABELS = ["needs_help", "road_blocked", "infrastructure_damage", "weather_observation"] as const;
type Label = typeof ALL_LABELS[number];

let _fieldId = 9000;

// ─── SignalRow ─────────────────────────────────────────────────────────────────

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
  const pillVariant = labelToPillVariant(label);

  return (
    <li
      className={clsx(
        "border-b border-border-subtle last:border-0 px-4 py-3 hover:bg-surface-hover transition-colors",
        isNew && "border-l-2 border-l-accent",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <Pill variant={pillVariant}>{labelText}</Pill>
            <Pill variant="default">{props.source}</Pill>
          </div>
          {props.text && (
            <p className="text-sm text-ink leading-snug line-clamp-2">{props.text}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5">
            <p className="text-xs text-ink-muted truncate flex-1">
              {props.district_name ?? "—"}
            </p>
            <p className="text-xs text-ink-subtle font-mono shrink-0">
              {timeAgoShort(props.ingested_at)}
            </p>
            {props.triage_confidence != null && (
              <p className="text-xs text-ink-subtle shrink-0">
                {Math.round(props.triage_confidence * 100)}%
              </p>
            )}
            <Button
              variant="ghost"
              size="xs"
              onClick={onFly}
              title={locale === "es" ? "Ver en mapa" : "Show on map"}
              aria-label={locale === "es" ? "Ver en mapa" : "Show on map"}
              className="shrink-0 p-1"
            >
              <MapPin size={12} />
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

// ─── FieldReport ──────────────────────────────────────────────────────────────

function FieldReport({ locale, onClose }: { locale: "es" | "en"; onClose: () => void }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState<Label>("needs_help");
  const [text, setText] = useState("");

  function submit() {
    if (!text.trim()) return;
    const now = new Date().toISOString();
    const id = String(_fieldId++);

    qc.setQueryData<SocialSignalCollection>(["social-signals", 48, undefined], (old) => {
      if (!old) return old;
      const feature = {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [-77.042, -12.046] as [number, number] },
        properties: {
          id,
          source: "campo",
          triage_label: label,
          triage_confidence: 1.0,
          text: text.trim(),
          district_name: "Lima Cercado",
          district_id: null,
          ingested_at: now,
        } as unknown as SocialSignalProperties,
      };
      return { ...old, features: [...old.features, feature] };
    });

    qc.setQueryData<DecisionLogEntry[]>(["decision-log", 100], (old) => {
      if (!old) return old;
      return [
        {
          id: _fieldId,
          logged_at: now,
          operator_id: "operator-1",
          action_type: "map_pin",
          alert_id: null,
          payload: { label: LABEL_ES[label] ?? label, district: "Lima Cercado", source: "campo" },
          session_id: "demo",
        },
        ...old,
      ].slice(0, 100);
    });

    setText("");
    onClose();
  }

  return (
    <div className="px-4 py-3 border-b border-border">
      <SectionLabel className="mb-2">
        {locale === "es" ? "Reporte de campo" : "Field report"}
      </SectionLabel>

      {/* Label selector */}
      <div className="flex flex-wrap gap-1 mb-3">
        {ALL_LABELS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLabel(l)}
            className={clsx(
              "text-xs px-2.5 py-1 rounded-full border transition-colors",
              label === l
                ? "bg-ink text-surface border-ink"
                : "bg-surface-sunken border-border text-ink-muted hover:border-border-strong hover:text-ink",
            )}
          >
            {locale === "es" ? LABEL_ES[l] : LABEL_EN[l]}
          </button>
        ))}
      </div>

      {/* Text input */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 140))}
        placeholder={
          locale === "es"
            ? "Descripción del reporte de campo…"
            : "Field report description…"
        }
        className="w-full bg-surface-sunken border border-border rounded-xl text-sm text-ink placeholder:text-ink-subtle px-3 py-2 resize-none focus:outline-none focus:border-border-strong transition-colors"
        rows={2}
      />

      {/* Footer row */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-ink-subtle">{text.length}/140</span>
        <Button
          variant="primary"
          size="xs"
          onClick={submit}
          disabled={!text.trim()}
          aria-label={locale === "es" ? "Enviar reporte" : "Send report"}
        >
          <Send size={11} />
          {locale === "es" ? "Enviar" : "Send"}
        </Button>
      </div>
    </div>
  );
}

// ─── SocialFeedPanel ──────────────────────────────────────────────────────────

export function SocialFeedPanel() {
  const { activePanel, setActivePanel, locale, setFlyToPoint } = useUIStore();
  const { data: signals, dataUpdatedAt } = useSocialSignals(48);
  const [labelFilter, setLabelFilter] = useState<Label | "all">("all");
  const [showFilter, setShowFilter] = useState(false);
  const [showReport, setShowReport] = useState(false);

  if (activePanel !== "social") return null;

  const features = (signals?.features ?? []).slice().reverse();
  const filtered = labelFilter === "all"
    ? features
    : features.filter((f) => f.properties.triage_label === labelFilter);

  const newestId = features[0]?.properties.id;

  const FILTER_LABELS: Array<{ value: Label | "all"; es: string; en: string }> = [
    { value: "all",                   es: "Todos",          en: "All" },
    { value: "needs_help",            es: "Ayuda",          en: "Help" },
    { value: "road_blocked",          es: "Vía",            en: "Road" },
    { value: "infrastructure_damage", es: "Infraestructura",en: "Infra" },
    { value: "weather_observation",   es: "Meteo",          en: "Weather" },
  ];

  return (
    <aside
      className={[
        /* mobile */
        "fixed bottom-14 left-0 right-0 h-[70vh] rounded-t-2xl",
        /* desktop */
        "sm:absolute sm:top-0 sm:right-0 sm:h-full sm:w-[360px] sm:rounded-none sm:bottom-auto sm:left-auto",
        /* common */
        "bg-surface border-t border-border-strong sm:border-t-0 sm:border-l shadow-panel z-20 flex flex-col panel-animate",
      ].join(" ")}
      aria-label={locale === "es" ? "Señales sociales en tiempo real" : "Real-time social signals"}
      role="complementary"
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
        <div className="w-8 h-1 rounded-full bg-border-strong" />
      </div>

      {/* Header */}
      <PanelHeader>
        <Radio size={15} className="text-danger shrink-0" aria-hidden="true" />
        <PanelTitle>
          {locale === "es" ? "Señales sociales" : "Social signals"}
        </PanelTitle>

        {/* Live badge */}
        <span className="flex items-center gap-1 text-xs text-ok-muted font-medium" aria-label="Live">
          <span className="w-1.5 h-1.5 rounded-full bg-ok-muted animate-pulse" aria-hidden="true" />
          {locale === "es" ? "En vivo" : "Live"}
        </span>

        {features.length > 0 && (
          <span className="text-xs bg-surface-sunken text-ink-muted font-mono px-1.5 py-0.5 rounded-full">
            {features.length}
          </span>
        )}

        <button
          onClick={() => setShowFilter((o) => !o)}
          className={clsx(
            "p-1 rounded transition-colors",
            showFilter
              ? "text-accent bg-accent-soft"
              : "text-ink-muted hover:text-ink hover:bg-surface-hover",
          )}
          aria-label={locale === "es" ? "Filtrar por tipo" : "Filter by type"}
          aria-pressed={showFilter}
        >
          <Filter size={14} />
        </button>

        <button
          onClick={() => setShowReport((o) => !o)}
          className={clsx(
            "p-1 rounded transition-colors",
            showReport
              ? "text-accent bg-accent-soft"
              : "text-ink-muted hover:text-ink hover:bg-surface-hover",
          )}
          aria-label={locale === "es" ? "Añadir reporte de campo" : "Add field report"}
          aria-pressed={showReport}
        >
          <PlusCircle size={14} />
        </button>

        <button
          onClick={() => setActivePanel("map")}
          className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={locale === "es" ? "Cerrar panel" : "Close panel"}
        >
          <X size={15} />
        </button>
      </PanelHeader>

      {/* Filter pills */}
      {showFilter && (
        <div className="px-4 py-2.5 border-b border-border flex gap-1.5 flex-wrap">
          {FILTER_LABELS.map(({ value, es, en }) => (
            <button
              key={value}
              type="button"
              onClick={() => setLabelFilter(value)}
              className={clsx(
                "text-xs px-2.5 py-1 rounded-full border transition-colors",
                labelFilter === value
                  ? "bg-ink text-surface border-ink"
                  : "bg-surface-sunken border-border text-ink-muted hover:border-border-strong hover:text-ink",
              )}
            >
              {locale === "es" ? es : en}
            </button>
          ))}
        </div>
      )}

      {/* Field report form */}
      {showReport && (
        <FieldReport locale={locale} onClose={() => setShowReport(false)} />
      )}

      {/* Source legend row */}
      <div className="px-4 py-2 border-b border-border flex gap-1.5 flex-wrap items-center">
        {(["bluesky", "telegram", "reddit", "campo"] as const).map((src) => (
          <Pill key={src} variant="default">{src}</Pill>
        ))}
        <span className="text-xs text-ink-subtle ml-auto">
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
          <li>
            <EmptyState
              title={locale === "es" ? "Sin señales" : "No signals"}
              body={
                locale === "es"
                  ? "No hay señales en el período seleccionado."
                  : "No signals in the selected period."
              }
              icon={<Radio size={20} />}
            />
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
      <div className="px-4 py-2 border-t border-border text-xs text-ink-subtle text-center font-mono">
        {dataUpdatedAt
          ? `${locale === "es" ? "Actualizado" : "Updated"} · ${timeAgoShort(new Date(dataUpdatedAt).toISOString())}`
          : (locale === "es" ? "Esperando señales…" : "Waiting for signals…")}
      </div>
    </aside>
  );
}
