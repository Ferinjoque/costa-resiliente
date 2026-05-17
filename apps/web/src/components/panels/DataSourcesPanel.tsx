"use client";

import { useState } from "react";
import { Database, ChevronDown, ChevronUp, ExternalLink, X } from "lucide-react";
import { clsx } from "clsx";
import { useUIStore } from "@/store/ui";
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
  /** Inferred status for Pill: ok = operational, warn = may be fragile, danger = blocked */
  status?: "ok" | "warn" | "danger";
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
  },
  {
    id: "ana",
    name: "ANA Observatorio Chirilu + SNIRH",
    provider: "Autoridad Nacional del Agua, Perú",
    coverage: "Estaciones cuencas Rímac, Chillón, Lurín",
    latency: "15 min (scraper)",
    url: "https://observatoriochirilu.ana.gob.pe",
    notes: "Scraper HTML — puede ser frágil si el sitio cambia estructura.",
    status: "warn",
  },
  {
    id: "senamhi",
    name: "SENAMHI",
    provider: "Servicio Nacional de Meteorología e Hidrología",
    coverage: "Estaciones meteorológicas Lima",
    latency: "15 min (scraper)",
    url: "https://www.senamhi.gob.pe",
    status: "ok",
  },
  {
    id: "sinpad",
    name: "INDECI SINPAD 2003–2020",
    provider: "Instituto Nacional de Defensa Civil",
    coverage: "2 063 eventos Lima — inundación y huayco",
    latency: "Histórico (estático)",
    url: "https://sinpad2.indeci.gob.pe",
    notes: "Base de peligro derivada de densidad histórica de eventos. SIGRID nativo requiere autenticación SSO.",
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
    latency: "Tiempo real (15 min por lote)",
    url: "https://bsky.app",
    status: "ok",
  },
  {
    id: "rss",
    name: "RSS — 6 medios peruanos",
    provider: "RPP, Andina, Canal N, El Comercio, La República, Peru21",
    coverage: "Noticias filtradas por palabras clave — últimas 48 h",
    latency: "15 min",
    url: "https://andina.pe/agencia/rss.aspx",
    status: "ok",
  },
  {
    id: "reddit",
    name: "Reddit (r/Peru, r/Lima, r/Chosica)",
    provider: "Reddit Inc.",
    coverage: "Publicaciones recientes con palabras clave",
    latency: "15 min (API JSON pública)",
    url: "https://www.reddit.com/r/Peru",
    status: "ok",
  },
  {
    id: "telegram",
    name: "Telegram — Senamhi_Peru",
    provider: "Canal oficial SENAMHI en Telegram",
    coverage: "Alertas hidrometeorológicas oficiales",
    latency: "15 min",
    url: "https://t.me/Senamhi_Peru",
    status: "ok",
  },
];

// Group sources by broad category
const GROUPS: { labelEs: string; labelEn: string; ids: string[] }[] = [
  {
    labelEs: "Teledetección",
    labelEn: "Remote sensing",
    ids: ["sentinel1", "imerg"],
  },
  {
    labelEs: "Estaciones e institucional",
    labelEn: "Stations & institutional",
    ids: ["ana", "senamhi", "sinpad"],
  },
  {
    labelEs: "Infraestructura",
    labelEn: "Infrastructure",
    ids: ["osm"],
  },
  {
    labelEs: "Señales sociales",
    labelEn: "Social signals",
    ids: ["bluesky", "rss", "reddit", "telegram"],
  },
];

const STATUS_LABEL: Record<string, { es: string; en: string }> = {
  ok:     { es: "Activo",   en: "Active" },
  warn:   { es: "Frágil",   en: "Fragile" },
  danger: { es: "Bloqueado",en: "Blocked" },
};

// ─── SourceRow ─────────────────────────────────────────────────────────────────

function SourceRow({ source, locale }: { source: Source; locale: "es" | "en" }) {
  const [open, setOpen] = useState(false);
  const status = source.status ?? "ok";
  const pillVariant: "ok" | "warn" | "danger" = status;
  const statusLabel = STATUS_LABEL[status]?.[locale] ?? status;

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
          <Pill variant={pillVariant}>{statusLabel}</Pill>
          {open
            ? <ChevronUp size={13} className="text-ink-subtle" aria-hidden="true" />
            : <ChevronDown size={13} className="text-ink-subtle" aria-hidden="true" />
          }
        </div>
      </button>

      {open && (
        <div
          id={`source-body-${source.id}`}
          className="px-4 pb-3 space-y-1.5"
        >
          <p className="text-xs text-ink-muted">
            <span className="text-ink-subtle">{locale === "es" ? "Cobertura: " : "Coverage: "}</span>
            {source.coverage}
          </p>
          <p className="text-xs text-ink-muted font-mono">
            <span className="text-ink-subtle font-sans">{locale === "es" ? "Latencia: " : "Latency: "}</span>
            {source.latency}
          </p>
          {source.notes && (
            <p className="text-xs text-warn-muted leading-snug">{source.notes}</p>
          )}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent rounded"
            aria-label={locale === "es" ? `Abrir ${source.name} en nueva pestaña` : `Open ${source.name} in new tab`}
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

  if (activePanel !== "sources") return null;

  const title = locale === "es" ? "Fuentes de datos" : "Data sources";
  const footer = locale === "es"
    ? `${SOURCES.length} fuentes activas · PII redactado (presidio) · retención 7 días`
    : `${SOURCES.length} active sources · PII redacted (presidio) · 7-day retention`;

  // Build a map for quick lookup
  const sourceMap = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

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
        <button
          onClick={() => setActivePanel("map")}
          className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={locale === "es" ? "Cerrar panel" : "Close panel"}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </PanelHeader>

      {/* Meta bar */}
      <div className="px-4 py-2 bg-surface-sunken border-b border-border">
        <p className="text-xs text-ink-subtle">{footer}</p>
      </div>

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
                  <SourceRow key={s.id} source={s} locale={locale} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
