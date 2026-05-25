"use client";

import { useState } from "react";
import { Radio, MapPin, X, Filter, Send, PlusCircle, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { clsx } from "clsx";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useSocialSignals, useDistrictList } from "@/lib/queries";
import { submitFieldReport } from "@/lib/api";
import type { SocialSignalProperties, SocialSignalCollection } from "@/lib/api";
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
  huayco_observation:    "Observación huayco",
  flood_observation:     "Observación inundación",
  weather_observation:   "Observación meteo",
  false_alarm:           "Falsa alarma",
  irrelevant:            "Irrelevante",
};

const LABEL_EN: Record<string, string> = {
  needs_help:            "Urgent help",
  road_blocked:          "Road blocked",
  infrastructure_damage: "Infrastructure damage",
  huayco_observation:    "Huayco sighting",
  flood_observation:     "Flood sighting",
  weather_observation:   "Weather observation",
  false_alarm:           "False alarm",
  irrelevant:            "Irrelevant",
};

const SOURCE_LABEL: Record<string, string> = {
  bluesky:  "Bluesky",
  telegram: "Telegram",
  reddit:   "Reddit",
  campo:    "Campo",
  rss:      "RSS",
  rss_rpp:  "RSS RPP",
};

function formatSource(src: string): string {
  const key = src.toLowerCase();
  return SOURCE_LABEL[key] ?? src.charAt(0).toUpperCase() + src.slice(1);
}

function buildSourceUrl(source: string, sourceId?: string | null): string | null {
  if (!sourceId) return null;
  const s = source.toLowerCase();
  if (s === "bluesky") {
    // stored format: "did:plc:xxx/rkey"  (not full AT-URI)
    const slash = sourceId.lastIndexOf("/");
    if (slash > 0) {
      const did = sourceId.slice(0, slash);
      const rkey = sourceId.slice(slash + 1);
      if (did && rkey) return `https://bsky.app/profile/${did}/post/${rkey}`;
    }
  }
  if (s === "reddit") return `https://reddit.com/${sourceId}`;
  // All RSS sources store the article URL as source_id
  if (s.startsWith("rss")) return sourceId;
  // Telegram stores "ChannelName/messageId"
  if (s === "telegram") {
    if (sourceId.startsWith("https://")) return sourceId;
    return `https://t.me/${sourceId}`;
  }
  return null;
}

function formatSignalDate(published_at: string | null | undefined, ingested_at: string, locale: "es" | "en"): string {
  const iso = published_at ?? ingested_at;
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const timeStr = d.toLocaleTimeString(locale === "es" ? "es-PE" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (sameDay) return timeStr;
  if (isYesterday) return locale === "es" ? `ayer ${timeStr}` : `yest. ${timeStr}`;

  const dateStr = d.toLocaleDateString(locale === "es" ? "es-PE" : "en-US", {
    day: "numeric",
    month: "short",
  });
  return `${dateStr} ${timeStr}`;
}

// Urgency sort: needs_help first, then chronological desc
const LABEL_PRIORITY: Record<string, number> = {
  needs_help:            0,
  road_blocked:          1,
  huayco_observation:    2,
  flood_observation:     2,
  infrastructure_damage: 3,
  weather_observation:   4,
};

function labelPriority(label: string | null): number {
  return LABEL_PRIORITY[label ?? ""] ?? 99;
}

function labelToPillVariant(label: string): "danger" | "warn" | "accent" | "default" {
  if (label === "needs_help") return "danger";
  if (label === "road_blocked" || label === "huayco_observation" || label === "flood_observation") return "warn";
  if (label === "infrastructure_damage") return "accent";
  return "default";
}

function timeAgoShort(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

const ALL_LABELS = ["needs_help", "road_blocked", "huayco_observation", "flood_observation", "infrastructure_damage", "weather_observation"] as const;
type Label = typeof ALL_LABELS[number];

// ─── ConfidenceBadge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls =
    pct >= 80 ? "text-ok-muted" :
    pct >= 60 ? "text-warn-muted" :
    "text-ink-subtle";
  return (
    <span
      className={clsx("text-xs font-mono shrink-0", cls)}
      title={`Confianza del modelo de IA: ${pct}%`}
    >
      IA {pct}%
    </span>
  );
}

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
  const [expanded, setExpanded] = useState(false);
  const label = props.triage_label ?? "unknown";
  const labelText = locale === "es" ? (LABEL_ES[label] ?? label) : (LABEL_EN[label] ?? label);
  const pillVariant = labelToPillVariant(label);
  // At text-sm (13px) and ~328px panel width, ~45 chars fit per line.
  // Only show "More" when text is genuinely longer than 2 visual lines.
  const hasLongText = (props.text?.length ?? 0) > 100;
  const sourceUrl = buildSourceUrl(props.source ?? "", props.source_id);
  const dateLabel = formatSignalDate(props.published_at, props.ingested_at, locale);

  return (
    <li
      className={clsx(
        "border-b border-border-subtle last:border-0 px-4 py-3 hover:bg-surface-hover transition-colors",
        isNew && "border-l-2 border-l-accent",
      )}
    >
      <div className="flex-1 min-w-0">
        {/* Label + source */}
        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
          <Pill variant={pillVariant}>{labelText}</Pill>
          <Pill variant="default">{formatSource(props.source ?? "")}</Pill>
        </div>

        {/* Content */}
        {props.text && (
          <div className="mb-1.5">
            <p className={clsx("text-sm text-ink leading-snug", !expanded && "line-clamp-2")}>
              {props.text}
            </p>
            {hasLongText && (
              <button
                type="button"
                onClick={() => setExpanded((o) => !o)}
                className="text-xs text-accent hover:underline mt-0.5 flex items-center gap-0.5"
              >
                {expanded
                  ? <><ChevronUp size={11} />{locale === "es" ? "Menos" : "Less"}</>
                  : <><ChevronDown size={11} />{locale === "es" ? "Más" : "More"}</>
                }
              </button>
            )}
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-2 flex-wrap">
          {props.district_name && (
            <span className="text-xs text-ink-muted font-medium truncate max-w-[130px]">
              {props.district_name}
            </span>
          )}
          <span
            className="text-xs text-ink-subtle font-mono shrink-0"
            title={locale === "es" ? `Publicado: ${new Date(props.published_at ?? props.ingested_at).toLocaleString("es-PE")}` : `Published: ${new Date(props.published_at ?? props.ingested_at).toLocaleString("en-US")}`}
          >
            {dateLabel}
          </span>
          {props.triage_confidence != null && (
            <ConfidenceBadge value={props.triage_confidence} />
          )}
          <div className="ml-auto flex items-center gap-1 shrink-0">
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={locale === "es" ? "Ver fuente original" : "View original source"}
                aria-label={locale === "es" ? "Ver fuente original" : "View original source"}
                className="p-1 rounded text-ink-subtle hover:text-accent transition-colors"
              >
                <ExternalLink size={12} />
              </a>
            )}
            <Button
              variant="ghost"
              size="xs"
              onClick={onFly}
              title={locale === "es" ? "Ver en mapa" : "Show on map"}
              aria-label={locale === "es" ? "Ver en mapa" : "Show on map"}
              className="p-1"
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
  const { addToast } = useUIStore();
  const operator = useAuthStore((s) => s.operator);
  const { data: districtList } = useDistrictList();
  const [label, setLabel] = useState<Label>("needs_help");
  const [text, setText] = useState("");
  const [districtUbigeo, setDistrictUbigeo] = useState("");
  const [sending, setSending] = useState(false);

  const selectedDistrict = districtList?.find((d) => d.ubigeo === districtUbigeo);

  async function submit() {
    if (!text.trim()) return;
    setSending(true);

    try {
      // Persist to social.signals via the dedicated field-report endpoint
      // (also writes ops.decision_log under the authenticated operator).
      const result = await submitFieldReport({
        operator_id: operator?.username ?? "field_anonymous",
        text: text.trim(),
        label,
        district_ubigeo: districtUbigeo || null,
        session_id: "demo",
      });

      // Optimistic update to social feed cache — backed by a real DB row now.
      qc.setQueryData<SocialSignalCollection>(["social-signals", 48, undefined], (old) => {
        if (!old) return old;
        const feature = {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [-77.042, -12.046] as [number, number] },
          properties: {
            id: result.signal_id,
            source: "campo",
            triage_label: label,
            triage_confidence: 1.0,
            text: text.trim(),
            district_name: selectedDistrict?.name ?? null,
            district_id: null,
            ingested_at: result.ingested_at ?? new Date().toISOString(),
          } as unknown as SocialSignalProperties,
        };
        return { ...old, features: [...old.features, feature] };
      });

      addToast({
        message: locale === "es" ? "Reporte de campo registrado" : "Field report stored",
        variant: "success",
      });
      setText("");
      setDistrictUbigeo("");
      onClose();
    } catch {
      addToast({
        message: locale === "es"
          ? "No se pudo registrar el reporte. Reintenta."
          : "Could not store the report. Retry.",
        variant: "danger",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="px-4 py-3 border-b border-border bg-surface-sunken">
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
                : "bg-surface border-border text-ink-muted hover:border-border-strong hover:text-ink",
            )}
          >
            {locale === "es" ? LABEL_ES[l] : LABEL_EN[l]}
          </button>
        ))}
      </div>

      {/* District selector */}
      {districtList && districtList.length > 0 && (
        <select
          value={districtUbigeo}
          onChange={(e) => setDistrictUbigeo(e.target.value)}
          className="w-full bg-surface border border-border rounded-xl text-xs text-ink px-3 py-1.5 mb-2 focus:outline-none focus:border-border-strong transition-colors"
          aria-label={locale === "es" ? "Distrito" : "District"}
        >
          <option value="">
            {locale === "es" ? "Seleccionar distrito (opcional)" : "Select district (optional)"}
          </option>
          {districtList.map((d) => (
            <option key={d.ubigeo} value={d.ubigeo}>{d.name}</option>
          ))}
        </select>
      )}

      {/* Text input */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 140))}
        placeholder={
          locale === "es"
            ? "Descripción del reporte de campo…"
            : "Field report description…"
        }
        className="w-full bg-surface border border-border rounded-xl text-sm text-ink placeholder:text-ink-subtle px-3 py-2 resize-none focus:outline-none focus:border-border-strong transition-colors"
        rows={2}
      />

      {/* Footer */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-ink-subtle">{text.length}/140</span>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="xs" onClick={onClose}>
            {locale === "es" ? "Cancelar" : "Cancel"}
          </Button>
          <Button
            variant="primary"
            size="xs"
            onClick={submit}
            disabled={!text.trim() || sending}
            aria-label={locale === "es" ? "Enviar reporte" : "Send report"}
          >
            <Send size={11} />
            {sending
              ? (locale === "es" ? "Enviando…" : "Sending…")
              : (locale === "es" ? "Enviar" : "Send")
            }
          </Button>
        </div>
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

  // Sort by urgency then reverse-chronological
  const features = (signals?.features ?? []).slice().sort((a, b) => {
    const pa = labelPriority(a.properties.triage_label);
    const pb = labelPriority(b.properties.triage_label);
    if (pa !== pb) return pa - pb;
    return new Date(b.properties.ingested_at).getTime() - new Date(a.properties.ingested_at).getTime();
  });

  const filtered =
    labelFilter === "all"
      ? features
      : features.filter((f) => f.properties.triage_label === labelFilter);

  const newestAt = features[0]?.properties.ingested_at;
  const urgentCount = features.filter((f) => f.properties.triage_label === "needs_help").length;

  const FILTER_TABS: Array<{ value: Label | "all"; es: string; en: string }> = [
    { value: "all",                   es: "Todos",   en: "All"      },
    { value: "needs_help",            es: "Ayuda",   en: "Help"     },
    { value: "road_blocked",          es: "Vías",    en: "Roads"    },
    { value: "huayco_observation",    es: "Huayco",  en: "Huayco"   },
    { value: "flood_observation",     es: "Inund.",  en: "Flood"    },
    { value: "infrastructure_damage", es: "Infra",   en: "Infra"    },
    { value: "weather_observation",   es: "Meteo",   en: "Weather"  },
  ];

  return (
    <aside
      className={[
        "fixed bottom-14 left-0 right-0 h-[70vh] rounded-t-2xl",
        "sm:absolute sm:top-0 sm:right-0 sm:h-full sm:w-[360px] sm:rounded-none sm:bottom-auto sm:left-auto",
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

        {urgentCount > 0 && (
          <span
            className="text-xs text-danger font-semibold bg-danger-soft px-1.5 py-0.5 rounded-full shrink-0"
            title={locale === "es" ? "Señales de ayuda urgente" : "Urgent help signals"}
          >
            {urgentCount}
          </span>
        )}

        <span className="flex items-center gap-1 text-xs text-ok-muted font-medium ml-auto" aria-label="Live">
          <span className="w-1.5 h-1.5 rounded-full bg-ok-muted animate-pulse" aria-hidden="true" />
          {locale === "es" ? "En vivo" : "Live"}
        </span>

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

      {/* Filter tabs */}
      {showFilter && (
        <div className="px-4 py-2.5 border-b border-border flex gap-1.5 flex-wrap">
          {FILTER_TABS.map(({ value, es, en }) => {
            const count = value === "all"
              ? features.length
              : features.filter((f) => f.properties.triage_label === value).length;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setLabelFilter(value)}
                className={clsx(
                  "text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1",
                  labelFilter === value
                    ? "bg-ink text-surface border-ink"
                    : "bg-surface-sunken border-border text-ink-muted hover:border-border-strong hover:text-ink",
                )}
              >
                {locale === "es" ? es : en}
                {count > 0 && (
                  <span className={clsx(
                    "font-mono text-[10px]",
                    labelFilter === value ? "text-surface/70" : "text-ink-subtle",
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Field report form */}
      {showReport && (
        <FieldReport locale={locale} onClose={() => setShowReport(false)} />
      )}

      {/* Source legend */}
      <div className="px-4 py-2 border-b border-border flex gap-1.5 flex-wrap items-center">
        {(["bluesky", "telegram", "reddit", "campo"] as const).map((src) => (
          <Pill key={src} variant="default">{formatSource(src)}</Pill>
        ))}
        <span
          className="text-xs text-ink-subtle ml-auto cursor-help"
          title={
            locale === "es"
              ? "Señales clasificadas automáticamente por IA. Datos personales anonimizados antes del almacenamiento."
              : "Signals classified automatically by AI. Personal data anonymised before storage."
          }
        >
          {locale === "es" ? "IA · anonimizado" : "AI · anonymised"}
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
          <li className="flex flex-col items-center">
            <EmptyState
              title={locale === "es" ? "Sin señales" : "No signals"}
              body={
                locale === "es"
                  ? "No hay señales en el período seleccionado."
                  : "No signals in the selected period."
              }
              icon={<Radio size={20} />}
            />
            <Button
              variant="primary"
              size="xs"
              onClick={() => setShowReport(true)}
              className="mb-4"
            >
              <PlusCircle size={12} />
              {locale === "es" ? "Añadir reporte de campo" : "Add field report"}
            </Button>
          </li>
        )}
        {filtered.map((f) => (
          <SignalRow
            key={f.properties.id}
            props={f.properties}
            locale={locale}
            isNew={f.properties.ingested_at === newestAt}
            onFly={() => {
              const [lng, lat] =
                f.geometry.type === "Point"
                  ? (f.geometry.coordinates as [number, number])
                  : [null, null];
              if (lng != null && lat != null) {
                setFlyToPoint([lng, lat]);
                // intentionally NOT closing sidebar — map pans without leaving social view
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
