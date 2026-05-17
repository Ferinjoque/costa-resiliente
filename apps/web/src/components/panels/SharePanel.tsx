"use client";

import { useState } from "react";
import { Link2, Copy, Check, X } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { mintShareToken } from "@/lib/api";

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
  districts:      { es: "Distritos", en: "Districts" },
  imerg:          { es: "Lluvia IMERG", en: "IMERG Rainfall" },
  flood:          { es: "Inundaciones SAR", en: "SAR Floods" },
  huayco:         { es: "Huaycos", en: "Huaycos" },
  hazard:         { es: "Zonas de peligro", en: "Hazard Zones" },
  infrastructure: { es: "Infraestructura crítica", en: "Critical Infrastructure" },
  social:         { es: "Señales sociales", en: "Social Signals" },
  stations:       { es: "Estaciones ANA", en: "ANA Stations" },
};

export function SharePanel() {
  const { activePanel, scenario, activeLayers, locale } = useUIStore();
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

  const { setActivePanel } = useUIStore();

  return (
    <div
      className="fixed bottom-14 left-0 right-0 sm:absolute sm:top-4 sm:right-4 sm:bottom-auto sm:left-auto sm:w-80 z-20 bg-surface-raised border border-slate-700 rounded-t-2xl sm:rounded-xl shadow-xl p-4 flex flex-col gap-3 panel-animate"
      role="dialog"
      aria-label={t.title}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-costa-400" aria-hidden="true" />
          <span className="text-sm font-semibold text-slate-100">{t.title}</span>
        </div>
        <button
          onClick={() => setActivePanel("map")}
          className="text-slate-400 hover:text-white transition-colors rounded focus-visible:ring-2 focus-visible:ring-costa-500 focus-visible:outline-none"
          aria-label={locale === "es" ? "Cerrar panel" : "Close panel"}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">{t.desc}</p>

      {/* Scenario summary */}
      <div className="text-xs text-slate-300 bg-slate-800 rounded-lg p-3 flex flex-col gap-1">
        <div className="flex justify-between">
          <span className="text-slate-400">{t.district}</span>
          <span>{scenario.districtName ?? t.none}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">{t.window}</span>
          <span>{t.hours(scenario.timeWindowHours)}</span>
        </div>
        {scenario.isReplayMode && (
          <div className="flex justify-between">
            <span className="text-slate-400">{t.replay}</span>
            <span>{scenario.replayDate ?? "2017"}</span>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <span className="text-slate-400 shrink-0">{t.layers}</span>
          <span className="text-right break-words">{activeLayerList || t.none}</span>
        </div>
      </div>

      {/* Result / copy */}
      {shareUrl && (
        <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-2">
          <input
            readOnly
            value={shareUrl}
            className="flex-1 text-xs bg-transparent text-slate-300 outline-none truncate"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            onClick={handleCopy}
            aria-label={copied ? t.copied : t.copy}
            title={copied ? t.copied : t.copy}
            className="shrink-0 p-1 rounded text-slate-400 hover:text-white transition-colors"
          >
            {copied ? <Check size={14} className="text-severity-low" /> : <Copy size={14} />}
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-severity-critical flex items-center gap-1">
          <X size={12} /> {error}
        </p>
      )}

      <button
        onClick={handleGenerate}
        disabled={loading}
        className="w-full py-2 rounded-lg text-sm font-medium bg-costa-600 hover:bg-costa-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? t.generating : shareUrl ? t.generate : t.generate}
      </button>

      {shareUrl && (
        <p className="text-[11px] text-slate-500 text-center">{t.expires}</p>
      )}
      <p className="text-[11px] text-slate-500 text-center leading-tight">{t.readOnly}</p>
    </div>
  );
}
