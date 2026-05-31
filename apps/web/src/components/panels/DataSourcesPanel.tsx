"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  ExternalLink,
  Globe,
  X,
  RefreshCw,
} from "lucide-react";
import { clsx } from "clsx";
import { useUIStore } from "@/store/ui";
import { useScraperHealth } from "@/lib/queries";
import type { ScraperSourceHealth } from "@/lib/api";
import {
  PanelHeader,
  PanelTitle,
  SectionLabel,
  Pill,
  Divider,
} from "@/components/ui/primitives";

// ─── Types & data ──────────────────────────────────────────────────────────────

interface Source {
  id: string;
  name: string;
  provider: string;
  coverage: string;
  latency: string;
  url: string;
  notes?: string;
  status?: "ok" | "warn" | "danger";
  healthKey?: string; // maps to ScraperHealth.sources key
}

const SOURCES: Source[] = [
  {
    id: "sentinel1",
    name: "Sentinel-1 SAR",
    provider: "ESA / Microsoft Planetary Computer",
    coverage: "Lima AOI — 10 m resolución",
    latency: "~3 h tras adquisición",
    url: "https://planetarycomputer.microsoft.com/dataset/sentinel-1-grd",
    status: "ok",
  },
  {
    id: "imerg",
    name: "NASA IMERG Early Run v07B",
    provider: "NASA GES DISC",
    coverage: "Global — 0.1° (~11 km), cada 30 min",
    latency: "~4 h tras observación",
    url: "https://gpm.nasa.gov/data/imerg",
    status: "ok",
    healthKey: "imerg",
  },
  {
    id: "ana",
    name: "ANA Observatorio Chirilu + SNIRH",
    provider: "Autoridad Nacional del Agua, Perú",
    coverage: "Estaciones cuencas Rímac, Chillón, Lurín",
    latency: "30 min (scraper)",
    url: "https://observatoriochirilu.ana.gob.pe",
    notes: "Scraper HTML — puede ser frágil si el sitio cambia su estructura.",
    status: "warn",
    healthKey: "stations",
  },
  {
    id: "senamhi",
    name: "SENAMHI",
    provider: "Servicio Nacional de Meteorología e Hidrología",
    coverage: "Estaciones meteorológicas Lima",
    latency: "30 min (scraper)",
    url: "https://www.senamhi.gob.pe",
    status: "ok",
    healthKey: "stations",
  },
  {
    id: "sinpad",
    name: "INDECI SINPAD 2003–2020",
    provider: "Instituto Nacional de Defensa Civil",
    coverage: "2 063 eventos Lima — inundación y huayco",
    latency: "Histórico (estático)",
    url: "https://sinpad2.indeci.gob.pe",
    notes: "Base de peligro derivada de densidad histórica. SIGRID nativo requiere autenticación SSO.",
    status: "warn",
  },
  {
    id: "osm",
    name: "OpenStreetMap",
    provider: "OpenStreetMap Contributors / Overpass API",
    coverage: "Hospitales, escuelas, puentes, subestaciones, bomberos",
    latency: "Actualización manual",
    url: "https://overpass-api.de",
    status: "ok",
  },
  {
    id: "bluesky",
    name: "Bluesky Jetstream v2",
    provider: "Bluesky PBC (AT Protocol)",
    coverage: "Firehose público — publicaciones con palabras clave de desastre",
    latency: "Tiempo real (lotes de 15 min)",
    url: "https://bsky.app",
    status: "ok",
    healthKey: "bluesky",
  },
  {
    id: "rss",
    name: "RSS — 6 medios peruanos",
    provider: "RPP, Andina, Canal N, El Comercio, La República, Peru21",
    coverage: "Noticias filtradas por palabras clave — últimas 48 h",
    latency: "15 min",
    url: "https://andina.pe/agencia/rss.aspx",
    status: "ok",
    healthKey: "rss",
  },
  {
    id: "reddit",
    name: "Reddit (r/Peru, r/Lima, r/Chosica)",
    provider: "Reddit Inc.",
    coverage: "Publicaciones recientes con palabras clave",
    latency: "15 min (API JSON pública)",
    url: "https://www.reddit.com/r/Peru",
    status: "ok",
    healthKey: "reddit",
  },
  {
    id: "telegram",
    name: "Telegram — Senamhi_Peru",
    provider: "Canal oficial SENAMHI en Telegram",
    coverage: "Alertas hidrometeorológicas oficiales",
    latency: "15 min",
    url: "https://t.me/Senamhi_Peru",
    status: "ok",
    healthKey: "telegram",
  },
];

const GROUPS: { labelEs: string; labelEn: string; ids: string[] }[] = [
  { labelEs: "Teledetección",              labelEn: "Remote sensing",       ids: ["sentinel1", "imerg"] },
  { labelEs: "Estaciones e institucional", labelEn: "Stations & institutional", ids: ["ana", "senamhi", "sinpad"] },
  { labelEs: "Infraestructura",            labelEn: "Infrastructure",       ids: ["osm"] },
  { labelEs: "Señales sociales",           labelEn: "Social signals",       ids: ["bluesky", "rss", "reddit", "telegram"] },
];

const STATUS_LABEL: Record<string, { es: string; en: string }> = {
  ok:     { es: "Activo",    en: "Active"  },
  warn:   { es: "Frágil",    en: "Fragile" },
  danger: { es: "Bloqueado", en: "Blocked" },
};

function formatAgo(isoDate: string | null, locale: "es" | "en"): string {
  if (!isoDate) return locale === "es" ? "nunca" : "never";
  const mins = Math.round((Date.now() - new Date(isoDate).getTime()) / 60000);
  if (mins < 1) return locale === "es" ? "ahora" : "now";
  if (mins < 60) return locale === "es" ? `hace ${mins} min` : `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return locale === "es" ? `hace ${hrs} h` : `${hrs}h ago`;
}

// ─── SourceRow ─────────────────────────────────────────────────────────────────

function SourceRow({
  source,
  locale,
  health,
}: {
  source: Source;
  locale: "es" | "en";
  health?: ScraperSourceHealth;
}) {
  const [open, setOpen] = useState(false);

  const liveStatus: "ok" | "warn" | "danger" | undefined = health
    ? health.status === "ok" ? "ok"
    : health.status === "stale" ? "warn"
    : "danger"
    : undefined;

  const status = liveStatus ?? source.status ?? "ok";
  const statusLabel = STATUS_LABEL[status]?.[locale] ?? status;

  const coverageLabel = locale === "es" ? "Cobertura"  : "Coverage";
  const latencyLabel  = locale === "es" ? "Latencia"   : "Latency";

  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors text-left gap-3"
        aria-expanded={open}
        aria-controls={`source-body-${source.id}`}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink truncate">{source.name}</p>
          <p className="text-xs text-ink-muted truncate">{source.provider}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Pill variant={status as "ok" | "warn" | "danger"}>{statusLabel}</Pill>
          {open
            ? <ChevronUp  size={13} className="text-ink-subtle" aria-hidden="true" />
            : <ChevronDown size={13} className="text-ink-subtle" aria-hidden="true" />
          }
        </div>
      </button>

      {open && (
        <div
          id={`source-body-${source.id}`}
          className="px-4 pb-4 space-y-2"
        >
          {/* Coverage */}
          <div className="flex items-start gap-2">
            <Globe size={12} className="text-ink-subtle mt-0.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wide mb-0.5">
                {coverageLabel}
              </p>
              <p className="text-xs text-ink-muted leading-snug">{source.coverage}</p>
            </div>
          </div>

          {/* Latency + live last-seen */}
          <div className="flex items-start gap-2">
            <Clock size={12} className="text-ink-subtle mt-0.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wide mb-0.5">
                {latencyLabel}
              </p>
              <p className="text-xs font-mono text-ink-muted">{source.latency}</p>
              {health && (
                <p className="text-xs text-ink-subtle mt-0.5">
                  {locale === "es" ? "Último dato" : "Last seen"}:{" "}
                  <span className={clsx(
                    "font-mono",
                    health.status === "ok" ? "text-ok" :
                    health.status === "stale" ? "text-warn-muted" : "text-danger"
                  )}>
                    {formatAgo(health.last_seen_at, locale)}
                  </span>
                  {" · "}{health.count.toLocaleString()} {locale === "es" ? "registros" : "records"}
                </p>
              )}
            </div>
          </div>

          {/* Notes */}
          {source.notes && (
            <div className="flex items-start gap-2 bg-warn-soft rounded-lg px-2.5 py-2">
              <AlertTriangle size={12} className="text-warn-muted mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-xs text-ink-muted leading-snug">{source.notes}</p>
            </div>
          )}

          {/* Link */}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent rounded"
            aria-label={
              locale === "es"
                ? `Abrir ${source.name} en nueva pestaña`
                : `Open ${source.name} in new tab`
            }
          >
            <ExternalLink size={11} aria-hidden="true" />
            {source.url.replace(/^https?:\/\//, "").split("/")[0]}
          </a>
        </div>
      )}
    </li>
  );
}

// ─── DataSourcesPanel ─────────────────────────────────────────────────────────

export function DataSourcesPanel() {
  const { activePanel, setActivePanel, locale } = useUIStore();
  const { data: scraperHealth, isError: healthError, isFetching: healthFetching, refetch: refetchHealth } = useScraperHealth();

  if (activePanel !== "sources") return null;

  const title = locale === "es" ? "Fuentes de datos" : "Data sources";

  const getLiveStatus = (s: Source): "ok" | "warn" | "danger" => {
    if (!scraperHealth || !s.healthKey) return s.status ?? "ok";
    const h = scraperHealth.sources[s.healthKey];
    if (!h) return s.status ?? "ok";
    return h.status === "ok" ? "ok" : h.status === "stale" ? "warn" : "danger";
  };

  const okCount     = SOURCES.filter((s) => getLiveStatus(s) === "ok").length;
  const warnCount   = SOURCES.filter((s) => getLiveStatus(s) === "warn").length;
  const dangerCount = SOURCES.filter((s) => getLiveStatus(s) === "danger").length;

  const sourceMap = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

  return (
    <aside
      className={[
        "fixed bottom-14 left-0 right-0 h-[70vh] rounded-t-2xl",
        "sm:absolute sm:top-0 sm:right-0 sm:h-full sm:w-[360px] sm:rounded-none sm:bottom-auto sm:left-auto",
        "bg-surface border-t border-border-strong sm:border-t-0 sm:border-l shadow-panel z-20 flex flex-col panel-animate",
      ].join(" ")}
      aria-label={title}
      role="complementary"
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
        <div className="w-8 h-1 rounded-full bg-border-strong" />
      </div>

      {/* Header */}
      <PanelHeader>
        <Database size={15} className="text-accent shrink-0" aria-hidden="true" />
        <PanelTitle>{title}</PanelTitle>
        <span className="text-xs font-mono tabular-nums text-ink-subtle bg-surface-sunken rounded px-1.5 py-0.5 shrink-0">
          {SOURCES.length}
        </span>
        <button
          onClick={() => setActivePanel("map")}
          className="ml-auto p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={locale === "es" ? "Cerrar panel" : "Close panel"}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </PanelHeader>

      {/* Grouped source list */}
      <div
        className="flex-1 overflow-y-auto"
        role="list"
        aria-label={locale === "es" ? "Fuentes de datos" : "Data sources"}
      >
        {GROUPS.map((group, gi) => {
          const groupSources = group.ids
            .map((id) => sourceMap[id])
            .filter(Boolean) as Source[];
          if (groupSources.length === 0) return null;

          return (
            <div key={group.labelEn}>
              {gi > 0 && <Divider />}
              <div className="px-4 pt-3 pb-1">
                <SectionLabel>
                  {locale === "es" ? group.labelEs : group.labelEn}
                </SectionLabel>
              </div>
              <ul>
                {groupSources.map((s) => (
                  <SourceRow
                    key={s.id}
                    source={s}
                    locale={locale}
                    health={s.healthKey ? scraperHealth?.sources[s.healthKey] : undefined}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Footer — status summary + privacy */}
      <div className="border-t border-border px-4 py-3 flex flex-col gap-1.5">
        {/* Status dots */}
        <div className="flex items-center gap-3">
          <StatusDot color="bg-ok"          count={okCount}     label={locale === "es" ? "activas"    : "active"}  />
          <StatusDot color="bg-warn-muted"  count={warnCount}   label={locale === "es" ? "frágiles"   : "fragile"} />
          <StatusDot color="bg-danger"      count={dangerCount} label={locale === "es" ? "bloqueadas" : "blocked"} />
          <button
            onClick={() => refetchHealth()}
            disabled={healthFetching}
            className="ml-auto flex items-center gap-1 text-[10px] text-ink-subtle hover:text-ink transition-colors disabled:opacity-40 rounded focus-visible:outline-2 focus-visible:outline-accent"
            aria-label={locale === "es" ? "Actualizar estado de fuentes" : "Refresh source status"}
          >
            <RefreshCw size={9} className={healthFetching ? "animate-spin" : ""} aria-hidden="true" />
            {healthError
              ? <span className="text-danger">{locale === "es" ? "error" : "error"}</span>
              : scraperHealth
                ? formatAgo(scraperHealth.retrieved_at, locale)
                : (locale === "es" ? "actualizar" : "refresh")}
          </button>
        </div>
        {/* Privacy / retention */}
        <p className="text-[10px] text-ink-subtle">
          {locale === "es"
            ? "PII redactado (presidio) · retención 7 días"
            : "PII redacted (presidio) · 7-day retention"}
        </p>
        {/* Redis health */}
        {scraperHealth?.redis && (
          <p className={clsx(
            "text-[10px]",
            scraperHealth.redis.status === "ok" ? "text-ok-muted" : "text-danger",
          )}>
            Redis: {scraperHealth.redis.status === "ok"
              ? (locale === "es" ? "conectado" : "connected")
              : (locale === "es" ? "desconectado ⚠" : "offline ⚠")}
          </p>
        )}
      </div>
    </aside>
  );
}

function StatusDot({
  color,
  count,
  label,
}: {
  color: string;
  count: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", color)} aria-hidden="true" />
      <span className="text-[10px] tabular-nums text-ink-subtle">
        <span className="font-semibold text-ink">{count}</span> {label}
      </span>
    </div>
  );
}
