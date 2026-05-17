"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { useUIStore } from "@/store/ui";
import type { Locale } from "@/store/ui";

const RISK_ITEMS: { color: string; label: { es: string; en: string } }[] = [
  { color: "#dc2626", label: { es: "Riesgo alto",     en: "High risk" } },
  { color: "#f97316", label: { es: "Riesgo moderado", en: "Moderate risk" } },
  { color: "#22c55e", label: { es: "Riesgo bajo",     en: "Low risk" } },
];

const RAIN_STOPS = ["#1e3a5f", "#2563eb", "#38bdf8", "#fbbf24", "#f97316", "#dc2626"];

const SOCIAL_ITEMS: { color: string; label: { es: string; en: string } }[] = [
  { color: "#ef4444", label: { es: "Ayuda",           en: "Needs help" } },
  { color: "#f97316", label: { es: "Infraestructura", en: "Infrastructure" } },
  { color: "#f59e0b", label: { es: "Vía bloqueada",   en: "Road blocked" } },
  { color: "#38bdf8", label: { es: "Meteorología",    en: "Weather" } },
];

const HUAYCO_ITEMS: { color: string; label: { es: string; en: string } }[] = [
  { color: "#dc2626", label: { es: "Muy alto",  en: "Very high" } },
  { color: "#f97316", label: { es: "Alto",      en: "High" } },
  { color: "#f59e0b", label: { es: "Moderado",  en: "Moderate" } },
  { color: "#22c55e", label: { es: "Bajo",      en: "Low" } },
];

const ALERT_ITEMS: { color: string; label: { es: string; en: string } }[] = [
  { color: "#dc2626", label: { es: "Crítico (pulsante)", en: "Critical (pulsing)" } },
  { color: "#f97316", label: { es: "Alto",               en: "High" } },
  { color: "#f59e0b", label: { es: "Medio",              en: "Medium" } },
  { color: "#22c55e", label: { es: "Bajo",               en: "Low" } },
];

const STATION_ITEMS: { color: string; label: { es: string; en: string } }[] = [
  { color: "#f97316", label: { es: "Alerta (umbral superado)", en: "Alert (threshold exceeded)" } },
  { color: "#fbbf24", label: { es: "Aviso (cerca umbral)",     en: "Warning (near threshold)" } },
  { color: "#22c55e", label: { es: "Normal",                   en: "Normal" } },
];

const INFRA_ITEMS: { color: string; label: { es: string; en: string } }[] = [
  { color: "#f43f5e", label: { es: "Hospital",    en: "Hospital" } },
  { color: "#34d399", label: { es: "Albergue",    en: "Shelter" } },
  { color: "#fb923c", label: { es: "Bomberos",    en: "Fire station" } },
  { color: "#a78bfa", label: { es: "Puente",      en: "Bridge" } },
  { color: "#f59e0b", label: { es: "Colegio",     en: "School" } },
];

const LABELS = {
  legend:       { es: "Leyenda",                    en: "Legend" },
  riskLevel:    { es: "Nivel de riesgo",            en: "Risk level" },
  rainfall:     { es: "Lluvia acumulada (IMERG)",   en: "Accumulated rainfall (IMERG)" },
  sarFlood:     { es: "Inundación SAR",             en: "SAR flood" },
  sarPolygon:   { es: "Polígono inundado",          en: "Flood polygon" },
  huayco:       { es: "Riesgo huayco",              en: "Huayco risk" },
  social:       { es: "Señales sociales",           en: "Social signals" },
  stations:     { es: "Estaciones ANA",             en: "ANA stations" },
  opAlerts:     { es: "Alertas operacionales",      en: "Operational alerts" },
};

function L(key: keyof typeof LABELS, locale: Locale): string {
  return LABELS[key][locale];
}

export function MapLegend() {
  const [open, setOpen] = useState(false);
  const { activeLayers, locale } = useUIStore();

  const showRisk     = activeLayers.has("districts");
  const showRain     = activeLayers.has("imerg");
  const showSocial   = activeLayers.has("social");
  const showHuayco   = activeLayers.has("huayco");
  const showFlood    = activeLayers.has("flood");
  const showStations = activeLayers.has("stations");
  const showInfra    = activeLayers.has("infrastructure");

  if (!showRisk && !showRain && !showSocial && !showHuayco && !showFlood && !showStations && !showInfra) return null;

  return (
    <div
      className="absolute bottom-20 left-2 z-10 sm:bottom-16 sm:left-4"
      aria-label={L("legend", locale)}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className={[
          "flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 shadow-lg transition-colors",
          "bg-surface-raised/90 backdrop-blur-sm border border-slate-700",
          open ? "text-white" : "text-slate-300 hover:text-white",
        ].join(" ")}
        aria-expanded={open}
        aria-label={L("legend", locale)}
      >
        <Layers size={12} aria-hidden="true" />
        {L("legend", locale)}
      </button>

      {open && (
        <div className="mt-1.5 bg-surface-raised/95 backdrop-blur-sm border border-slate-700 rounded-xl p-3 shadow-xl space-y-3 w-44">
          {showRisk && (
            <Section label={L("riskLevel", locale)}>
              {RISK_ITEMS.map(({ color, label }) => (
                <DotRow key={label.es} color={color} label={label[locale]} shape="square" />
              ))}
            </Section>
          )}

          {showRain && (
            <Section label={L("rainfall", locale)}>
              <div
                className="h-3 rounded-sm w-full"
                style={{ background: `linear-gradient(to right, ${RAIN_STOPS.join(", ")})` }}
                aria-hidden="true"
              />
              <div className="flex justify-between mt-0.5">
                <span className="text-[9px] text-slate-400">0 mm</span>
                <span className="text-[9px] text-slate-400">200+</span>
              </div>
            </Section>
          )}

          {showFlood && (
            <Section label={L("sarFlood", locale)}>
              <DotRow color="#2563eb" label={L("sarPolygon", locale)} shape="square" />
            </Section>
          )}

          {showHuayco && (
            <Section label={L("huayco", locale)}>
              {HUAYCO_ITEMS.map(({ color, label }) => (
                <DotRow key={label.es} color={color} label={label[locale]} shape="circle" />
              ))}
            </Section>
          )}

          {showSocial && (
            <Section label={L("social", locale)}>
              {SOCIAL_ITEMS.map(({ color, label }) => (
                <DotRow key={label.es} color={color} label={label[locale]} shape="circle" />
              ))}
            </Section>
          )}

          {showStations && (
            <Section label={L("stations", locale)}>
              {STATION_ITEMS.map(({ color, label }) => (
                <DotRow key={label.es} color={color} label={label[locale]} shape="circle" />
              ))}
            </Section>
          )}

          {showInfra && (
            <Section label={locale === "es" ? "Infraestructura" : "Infrastructure"}>
              {INFRA_ITEMS.map(({ color, label }) => (
                <DotRow key={label.es} color={color} label={label[locale]} shape="circle" />
              ))}
            </Section>
          )}

          <Section label={L("opAlerts", locale)}>
            {ALERT_ITEMS.map(({ color, label }) => (
              <DotRow key={label.es} color={color} label={label[locale]} shape="circle" />
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-1.5">
        {label}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function DotRow({ color, label, shape }: { color: string; label: string; shape: "circle" | "square" }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={shape === "circle" ? "rounded-full" : "rounded-sm"}
        style={{ width: 10, height: 10, backgroundColor: color, opacity: 0.85, flexShrink: 0 }}
        aria-hidden="true"
      />
      <span className="text-[11px] text-slate-300 leading-none">{label}</span>
    </div>
  );
}
