"use client";

import { useState } from "react";
import { Link2, Copy, Check, X } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { mintShareToken } from "@/lib/api";
import {
  PanelHeader,
  PanelTitle,
  SectionLabel,
  Button,
  Divider,
} from "@/components/ui/primitives";

// ─── i18n ──────────────────────────────────────────────────────────────────────

const T = {
  es: {
    title: "Compartir escenario",
    desc: "Genera un enlace de solo lectura con el estado actual del mapa para compartir con coordinadores o evaluadores.",
    layers: "Capas activas",
    district: "Distrito",
    window: "Ventana temporal",
    replay: "Modo Replay El Niño 2017",
    hours: (h: number) => `${h}h`,
    generate: "Generar enlace",
    generating: "Generando…",
    copy: "Copiar enlace",
    copied: "¡Copiado!",
    expires: "Válido por 30 días",
    error: "Error al generar enlace. Intenta de nuevo.",
    readOnly: "Solo lectura — los receptores no pueden modificar alertas ni el registro.",
    none: "Ninguno",
  },
  en: {
    title: "Share scenario",
    desc: "Generate a read-only link with the current map state to share with coordinators or reviewers.",
    layers: "Active layers",
    district: "District",
    window: "Time window",
    replay: "El Niño 2017 Replay mode",
    hours: (h: number) => `${h}h`,
    generate: "Generate link",
    generating: "Generating…",
    copy: "Copy link",
    copied: "Copied!",
    expires: "Valid for 30 days",
    error: "Failed to generate link. Please try again.",
    readOnly: "Read-only — recipients cannot modify alerts or the decision log.",
    none: "None",
  },
};

const LAYER_LABELS: Record<string, { es: string; en: string }> = {
  districts:      { es: "Distritos",            en: "Districts" },
  imerg:          { es: "Lluvia IMERG",          en: "IMERG Rainfall" },
  flood:          { es: "Inundaciones SAR",      en: "SAR Floods" },
  huayco:         { es: "Huaycos",               en: "Huaycos" },
  hazard:         { es: "Zonas de peligro",       en: "Hazard Zones" },
  infrastructure: { es: "Infraestructura crítica",en: "Critical Infrastructure" },
  social:         { es: "Señales sociales",       en: "Social Signals" },
  stations:       { es: "Estaciones ANA",         en: "ANA Stations" },
};

// ─── SharePanel ────────────────────────────────────────────────────────────────

export function SharePanel() {
  const { activePanel, scenario, activeLayers, locale, setActivePanel } = useUIStore();
  const t = T[locale];
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (activePanel !== "share") return null;

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setShareUrl(null);
    try {
      const res = await mintShareToken({
        districtUbigeo: scenario.districtUbigeo,
        districtName: scenario.districtName,
        timeWindowHours: scenario.timeWindowHours,
        isReplayMode: scenario.isReplayMode,
        replayDate: scenario.replayDate,
        activeLayers: [...activeLayers],
      });
      setShareUrl(res.url);
    } catch {
      // Backend unavailable — generate a self-contained URL
      const state = btoa(JSON.stringify({
        districtUbigeo: scenario.districtUbigeo,
        districtName: scenario.districtName,
        timeWindowHours: scenario.timeWindowHours,
        isReplayMode: scenario.isReplayMode,
        replayDate: scenario.replayDate,
        activeLayers: [...activeLayers],
      }));
      const base = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
      setShareUrl(`${base}?state=${state}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const activeLayerList = [...activeLayers]
    .map((k) => LAYER_LABELS[k]?.[locale] ?? k)
    .join(", ");

  return (
    <div
      className={[
        /* mobile */
        "fixed bottom-14 left-0 right-0 rounded-t-2xl",
        /* desktop */
        "sm:absolute sm:top-0 sm:right-0 sm:h-full sm:w-[320px] sm:rounded-none sm:bottom-auto sm:left-auto",
        /* common */
        "bg-surface border-t border-border-strong sm:border-t-0 sm:border-l shadow-panel z-20 flex flex-col panel-animate",
      ].join(" ")}
      role="dialog"
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
          className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={locale === "es" ? "Cerrar panel" : "Close panel"}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </PanelHeader>

      {/* Body */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-4 px-4 py-4">
        {/* Description */}
        <p className="text-sm text-ink-muted leading-relaxed">{t.desc}</p>

        {/* Scenario summary */}
        <div>
          <SectionLabel className="mb-2">
            {locale === "es" ? "Escenario actual" : "Current scenario"}
          </SectionLabel>
          <div className="bg-surface-sunken border border-border rounded-xl px-3 py-2.5 flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-ink-muted shrink-0">{t.district}</span>
              <span className="text-ink text-right">{scenario.districtName ?? t.none}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-ink-muted shrink-0">{t.window}</span>
              <span className="text-ink">{t.hours(scenario.timeWindowHours)}</span>
            </div>
            {scenario.isReplayMode && (
              <div className="flex justify-between gap-2">
                <span className="text-ink-muted shrink-0">{t.replay}</span>
                <span className="text-ink">{scenario.replayDate ?? "2017"}</span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="text-ink-muted shrink-0">{t.layers}</span>
              <span className="text-ink text-right break-words">{activeLayerList || t.none}</span>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-danger flex items-center gap-1.5">
            <X size={13} aria-hidden="true" />
            {error}
          </p>
        )}

        {/* Share URL display */}
        {shareUrl && (
          <div>
            <SectionLabel className="mb-2">
              {locale === "es" ? "Enlace generado" : "Generated link"}
            </SectionLabel>
            <div className="flex items-center gap-2 bg-surface-sunken border border-border rounded-xl px-3 py-2.5">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 font-mono text-xs text-ink bg-transparent outline-none truncate"
                onClick={(e) => (e.target as HTMLInputElement).select()}
                aria-label={locale === "es" ? "URL compartida" : "Share URL"}
              />
              <button
                onClick={handleCopy}
                aria-label={copied ? t.copied : t.copy}
                title={copied ? t.copied : t.copy}
                className="shrink-0 p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors"
              >
                {copied
                  ? <Check size={14} className="text-ok-muted" aria-hidden="true" />
                  : <Copy size={14} aria-hidden="true" />
                }
              </button>
            </div>
            <p className="text-xs text-ink-muted mt-1.5 text-center">{t.expires}</p>
          </div>
        )}

        <Divider />

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            size="md"
            onClick={handleGenerate}
            disabled={loading}
            className="w-full"
          >
            {loading ? t.generating : t.generate}
          </Button>

          {shareUrl && (
            <Button
              variant="secondary"
              size="md"
              onClick={handleCopy}
              disabled={!shareUrl}
              className="w-full"
            >
              {copied
                ? <><Check size={14} />{t.copied}</>
                : <><Copy size={14} />{t.copy}</>
              }
            </Button>
          )}
        </div>

        {/* Read-only notice */}
        <p className="text-xs text-ink-subtle text-center leading-relaxed">{t.readOnly}</p>
      </div>
    </div>
  );
}
