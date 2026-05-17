"use client";

import { useState } from "react";
import { Info, ChevronDown, ChevronUp, ExternalLink, X } from "lucide-react";
import { clsx } from "clsx";
import { useUIStore } from "@/store/ui";

interface Source {
  id: string;
  name: string;
  provider: string;
  coverage: string;
  latency: string;
  url: string;
  notes?: string;
}

const SOURCES: Source[] = [
  {
    id: "sentinel1",
    name: "Sentinel-1 SAR",
    provider: "ESA / Microsoft Planetary Computer",
    coverage: "Lima AOI — 10 m resolución",
    latency: "~3 h tras adquisición",
    url: "https://planetarycomputer.microsoft.com/dataset/sentinel-1-grd",
  },
  {
    id: "imerg",
    name: "NASA IMERG Early Run v07B",
    provider: "NASA GES DISC",
    coverage: "Global — 0.1° (~11 km), cada 30 min",
    latency: "~4 h tras observación",
    url: "https://gpm.nasa.gov/data/imerg",
  },
  {
    id: "ana",
    name: "ANA Observatorio Chirilu + SNIRH",
    provider: "Autoridad Nacional del Agua, Perú",
    coverage: "Estaciones cuencas Rímac, Chillón, Lurín",
    latency: "15 min (scraper)",
    url: "https://observatoriochirilu.ana.gob.pe",
    notes: "Scraper HTML — puede ser frágil si el sitio cambia estructura.",
  },
  {
    id: "senamhi",
    name: "SENAMHI",
    provider: "Servicio Nacional de Meteorología e Hidrología",
    coverage: "Estaciones meteorológicas Lima",
    latency: "15 min (scraper)",
    url: "https://www.senamhi.gob.pe",
  },
  {
    id: "sinpad",
    name: "INDECI SINPAD 2003–2020",
    provider: "Instituto Nacional de Defensa Civil",
    coverage: "2 063 eventos Lima — inundación y huayco",
    latency: "Histórico (estático)",
    url: "https://sinpad2.indeci.gob.pe",
    notes: "Base de peligro derivada de densidad histórica de eventos. SIGRID nativo requiere autenticación SSO.",
  },
  {
    id: "osm",
    name: "OpenStreetMap",
    provider: "OpenStreetMap Contributors / Overpass API",
    coverage: "Hospitales, escuelas, puentes, subestaciones, bomberos",
    latency: "Actualización manual",
    url: "https://overpass-api.de",
  },
  {
    id: "bluesky",
    name: "Bluesky Jetstream v2",
    provider: "Bluesky PBC (AT Protocol)",
    coverage: "Firehose público — publicaciones con palabras clave de desastre",
    latency: "Tiempo real (15 min por lote)",
    url: "https://bsky.app",
  },
  {
    id: "rss",
    name: "RSS — 6 medios peruanos",
    provider: "RPP, Andina, Canal N, El Comercio, La República, Peru21",
    coverage: "Noticias filtradas por palabras clave — últimas 48 h",
    latency: "15 min",
    url: "https://andina.pe/agencia/rss.aspx",
  },
  {
    id: "reddit",
    name: "Reddit (r/Peru, r/Lima, r/Chosica)",
    provider: "Reddit Inc.",
    coverage: "Publicaciones recientes con palabras clave",
    latency: "15 min (API JSON pública)",
    url: "https://www.reddit.com/r/Peru",
  },
  {
    id: "telegram",
    name: "Telegram — Senamhi_Peru",
    provider: "Canal oficial SENAMHI en Telegram",
    coverage: "Alertas hidrometeorológicas oficiales",
    latency: "15 min",
    url: "https://t.me/Senamhi_Peru",
  },
];

function SourceRow({ source, locale }: { source: Source; locale: "es" | "en" }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="border-b border-slate-700/50 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-panel transition-colors text-left"
        aria-expanded={open}
        aria-controls={`source-body-${source.id}`}
      >
        <div>
          <p className="text-xs font-medium text-white">{source.name}</p>
          <p className="text-[10px] text-slate-400">{source.provider}</p>
        </div>
        {open ? (
          <ChevronUp size={13} className="text-slate-400 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronDown size={13} className="text-slate-400 shrink-0" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div
          id={`source-body-${source.id}`}
          className="px-4 pb-3 space-y-1"
        >
          <p className="text-[10px] text-slate-300">
            <span className="text-slate-400">{locale === "es" ? "Cobertura:" : "Coverage:"}</span> {source.coverage}
          </p>
          <p className="text-[10px] text-slate-300">
            <span className="text-slate-400">{locale === "es" ? "Latencia:" : "Latency:"}</span> {source.latency}
          </p>
          {source.notes && (
            <p className="text-[10px] text-amber-400">{source.notes}</p>
          )}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-costa-400 hover:text-costa-300 transition-colors focus-visible:ring-2 focus-visible:ring-costa-500 focus-visible:outline-none rounded"
            aria-label={locale === "es" ? `Abrir ${source.name} en nueva pestaña` : `Open ${source.name} in new tab`}
          >
            <ExternalLink size={10} aria-hidden="true" />
            {source.url.replace(/^https?:\/\//, "").split("/")[0]}
          </a>
        </div>
      )}
    </li>
  );
}

export function DataSourcesPanel() {
  const { activePanel, setActivePanel, locale } = useUIStore();

  if (activePanel !== "sources") return null;

  const title = locale === "es" ? "Sobre los datos" : "Data sources";
  const footer = locale === "es"
    ? `${SOURCES.length} fuentes activas · PII redactado (presidio) · retención 7 días`
    : `${SOURCES.length} active sources · PII redacted (presidio) · 7-day retention`;

  return (
    <aside
      className={[
        "fixed bottom-14 left-0 right-0 h-[70vh] rounded-t-2xl",
        "sm:absolute sm:top-4 sm:right-4 sm:bottom-4 sm:left-auto sm:h-auto sm:w-80 sm:max-w-sm sm:rounded-xl",
        "bg-surface-raised border border-slate-700 shadow-xl z-20 flex flex-col",
      ].join(" ")}
      aria-label={title}
      role="complementary"
    >
      <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
        <div className="w-8 h-1 rounded-full bg-slate-600" />
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
        <Info size={15} className="text-costa-500" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <button
          onClick={() => setActivePanel("map")}
          className="ml-auto text-slate-400 hover:text-white transition-colors rounded focus-visible:ring-2 focus-visible:ring-costa-500 focus-visible:outline-none"
          aria-label={locale === "es" ? "Cerrar panel" : "Close panel"}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      <div className="px-4 py-2 bg-costa-900/20 border-b border-slate-700">
        <p className="text-[10px] text-slate-400">{footer}</p>
      </div>

      <ul className="flex-1 overflow-y-auto" role="list" aria-label={locale === "es" ? "Fuentes de datos" : "Data sources"}>
        {SOURCES.map((s) => (
          <SourceRow key={s.id} source={s} locale={locale} />
        ))}
      </ul>
    </aside>
  );
}
