"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Link2, Loader2, RefreshCw, X } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { mintShareToken } from "@/lib/api";
import {
  PanelHeader,
  PanelTitle,
  SectionLabel,
  Button,
} from "@/components/ui/primitives";

// ─── i18n ──────────────────────────────────────────────────────────────────────

const T = {
  es: {
    title:       "Compartir escenario",
    desc:        "Genera un enlace de solo lectura con el estado actual del mapa para coordinadores o evaluadores.",
    scenarioHdr: "Escenario incluido",
    district:    "Distrito",
    window:      "Ventana temporal",
    replay:      "Replay El Niño 2017",
    layers:      "Capas activas",
    hours:       (h: number) => `${h} h`,
    generate:    "Generar enlace",
    regenerate:  "Regenerar enlace",
    generating:  "Generando…",
    linkHdr:     "Enlace generado",
    copy:        "Copiar",
    copied:      "¡Copiado!",
    open:        "Abrir",
    validUntil:  (d: string) => `Válido hasta ${d}`,
    validDays:   "Válido por 30 días",
    error:       "No se pudo generar el enlace. Intenta de nuevo.",
    readOnly:    "Solo lectura — los receptores no pueden modificar alertas ni el registro.",
    none:        "Ninguno",
  },
  en: {
    title:       "Share scenario",
    desc:        "Generate a read-only link with the current map state to share with coordinators or reviewers.",
    scenarioHdr: "Included scenario",
    district:    "District",
    window:      "Time window",
    replay:      "El Niño 2017 Replay",
    layers:      "Active layers",
    hours:       (h: number) => `${h} h`,
    generate:    "Generate link",
    regenerate:  "Regenerate link",
    generating:  "Generating…",
    linkHdr:     "Generated link",
    copy:        "Copy",
    copied:      "Copied!",
    open:        "Open",
    validUntil:  (d: string) => `Valid until ${d}`,
    validDays:   "Valid for 30 days",
    error:       "Failed to generate link. Please try again.",
    readOnly:    "Read-only — recipients cannot modify alerts or the decision log.",
    none:        "None",
  },
};

const LAYER_LABELS: Record<string, { es: string; en: string }> = {
  districts:      { es: "Distritos",             en: "Districts" },
  imerg:          { es: "Lluvia IMERG",           en: "IMERG Rainfall" },
  flood:          { es: "Inundaciones SAR",       en: "SAR Floods" },
  huayco:         { es: "Huaycos",                en: "Huaycos" },
  hazard:         { es: "Zonas de peligro",        en: "Hazard Zones" },
  infrastructure: { es: "Infraestructura crítica", en: "Critical Infra" },
  social:         { es: "Señales sociales",        en: "Social Signals" },
  stations:       { es: "Estaciones ANA",          en: "ANA Stations" },
};

function formatExpiry(iso: string, locale: "es" | "en"): string {
  const d = new Date(iso);
  return locale === "es"
    ? d.toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── SharePanel ────────────────────────────────────────────────────────────────

export function SharePanel() {
  const { activePanel, scenario, activeLayers, locale, setActivePanel } = useUIStore();
  const t = T[locale];

  const [shareUrl,  setShareUrl]  = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [copied,    setCopied]    = useState(false);

  if (activePanel !== "share") return null;

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await mintShareToken({
        districtUbigeo:   scenario.districtUbigeo,
        districtName:     scenario.districtName,
        timeWindowHours:  scenario.timeWindowHours,
        isReplayMode:     scenario.isReplayMode,
        replayDate:       scenario.replayDate,
        activeLayers:     [...activeLayers],
      });
      setShareUrl(res.url);
      setExpiresAt(res.expires_at ?? null);
    } catch {
      // Offline fallback — encode state in URL so ShareLoader can hydrate it
      const state = btoa(JSON.stringify({
        districtUbigeo:  scenario.districtUbigeo,
        districtName:    scenario.districtName,
        timeWindowHours: scenario.timeWindowHours,
        isReplayMode:    scenario.isReplayMode,
        replayDate:      scenario.replayDate,
        activeLayers:    [...activeLayers],
      }));
      const base = typeof window !== "undefined"
        ? window.location.origin + window.location.pathname
        : "";
      setShareUrl(`${base}?state=${state}`);
      setExpiresAt(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(locale === "es"
        ? "No se pudo copiar. Seleccione el enlace manualmente."
        : "Could not copy. Select the link manually.");
    }
  };

  const handleOpen = () => {
    if (shareUrl) window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  const activeLayerList = [...activeLayers]
    .map((k) => LAYER_LABELS[k]?.[locale] ?? k)
    .join(", ");

  const expiryLabel = expiresAt
    ? t.validUntil(formatExpiry(expiresAt, locale))
    : t.validDays;

  return (
    <div
      className={[
        "fixed bottom-14 left-0 right-0 rounded-t-2xl",
        "sm:absolute sm:top-0 sm:right-0 sm:h-full sm:w-[320px] sm:rounded-none sm:bottom-auto sm:left-auto",
        "bg-surface border-t border-border-strong sm:border-t-0 sm:border-l shadow-panel z-20 flex flex-col panel-animate",
      ].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
        <div className="w-8 h-1 rounded-full bg-border-strong" />
      </div>

      {/* Header */}
      <PanelHeader>
        <Link2 size={15} className="text-accent shrink-0" aria-hidden="true" />
        <PanelTitle>{t.title}</PanelTitle>
        <button
          onClick={() => setActivePanel("map")}
          className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors focus-visible:outline-2 focus-visible:outline-accent ml-auto"
          aria-label={locale === "es" ? "Cerrar" : "Close"}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </PanelHeader>

      {/* Body */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-4 px-4 py-4">

        {/* Description */}
        <p className="text-sm text-ink-muted leading-relaxed">{t.desc}</p>

        {/* Generate / Regenerate button — primary action at top */}
        <Button
          variant="primary"
          size="md"
          onClick={handleGenerate}
          disabled={loading}
          className="w-full gap-2"
        >
          {loading
            ? <><Loader2 size={14} className="animate-spin" />{t.generating}</>
            : shareUrl
              ? <><RefreshCw size={14} />{t.regenerate}</>
              : <><Link2 size={14} />{t.generate}</>
          }
        </Button>

        {/* Error */}
        {error && (
          <p className="text-sm text-danger flex items-center gap-1.5 bg-danger-soft rounded-lg px-3 py-2">
            <X size={13} className="shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        {/* Generated link */}
        {shareUrl && (
          <div className="flex flex-col gap-2">
            <SectionLabel>{t.linkHdr}</SectionLabel>

            {/* URL row */}
            <div className="flex items-center gap-1 bg-surface-sunken border border-border rounded-xl px-3 py-2.5">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 font-mono text-xs text-ink bg-transparent outline-none truncate min-w-0"
                onClick={(e) => (e.target as HTMLInputElement).select()}
                aria-label={locale === "es" ? "URL compartida" : "Share URL"}
              />
              {/* Copy */}
              <button
                onClick={handleCopy}
                title={copied ? t.copied : t.copy}
                aria-label={copied ? t.copied : t.copy}
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors hover:bg-surface-hover text-ink-muted hover:text-ink"
              >
                {copied
                  ? <Check size={13} className="text-ok" aria-hidden="true" />
                  : <Copy size={13} aria-hidden="true" />
                }
                <span>{copied ? t.copied : t.copy}</span>
              </button>
              {/* Open */}
              <button
                onClick={handleOpen}
                title={t.open}
                aria-label={t.open}
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors hover:bg-surface-hover text-ink-muted hover:text-ink"
              >
                <ExternalLink size={13} aria-hidden="true" />
                <span>{t.open}</span>
              </button>
            </div>

            {/* Expiry */}
            <p className="text-xs text-ink-subtle text-center">{expiryLabel}</p>
          </div>
        )}

        {/* Scenario summary */}
        <div>
          <SectionLabel className="mb-2">{t.scenarioHdr}</SectionLabel>
          <div className="bg-surface-sunken border border-border rounded-xl divide-y divide-border text-sm overflow-hidden">
            <Row label={t.district} value={scenario.districtName ?? t.none} />
            <Row label={t.window}   value={t.hours(scenario.timeWindowHours)} />
            {scenario.isReplayMode && (
              <Row label={t.replay} value={scenario.replayDate ?? "2017"} />
            )}
            <Row
              label={t.layers}
              value={activeLayerList || t.none}
              valueClass="text-right break-words"
            />
          </div>
        </div>

        {/* Read-only notice */}
        <p className="text-xs text-ink-subtle text-center leading-relaxed pb-2">{t.readOnly}</p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between gap-3 px-3 py-2">
      <span className="text-ink-muted shrink-0 text-xs">{label}</span>
      <span className={`text-ink text-xs ${valueClass}`}>{value}</span>
    </div>
  );
}
