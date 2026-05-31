"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { useUIStore } from "@/store/ui";
import type { Locale } from "@/store/ui";
import {
  RISK_COLOR,
  HUAYCO_COLOR,
  SEVERITY_COLOR,
  SOCIAL_LABEL_COLOR,
  STATION_COLOR,
  INFRA_COLOR,
  RAIN_STOPS,
  COSTA_500,
} from "@/lib/colors";

// All swatch arrays source colors from src/lib/colors.ts so the legend stays
// 1:1 with the canonical OKLCH token set. Adding a category here means adding
// it to colors.ts first, never the reverse.

const RISK_ITEMS: { color: string; label: { es: string; en: string } }[] = [
  { color: RISK_COLOR.alto,     label: { es: "Riesgo alto",     en: "High risk" } },
  { color: RISK_COLOR.moderado, label: { es: "Riesgo moderado", en: "Moderate risk" } },
  { color: RISK_COLOR.bajo,     label: { es: "Riesgo bajo",     en: "Low risk" } },
];

const SOCIAL_ITEMS: { color: string; label: { es: string; en: string } }[] = [
  { color: SOCIAL_LABEL_COLOR.needs_help,            label: { es: "Ayuda urgente",   en: "Needs help" } },
  { color: SOCIAL_LABEL_COLOR.huayco_observation,    label: { es: "Huayco",          en: "Huayco" } },
  { color: SOCIAL_LABEL_COLOR.flood_observation,     label: { es: "Inundación",      en: "Flood" } },
  { color: SOCIAL_LABEL_COLOR.infrastructure_damage, label: { es: "Infraestructura", en: "Infrastructure" } },
  { color: SOCIAL_LABEL_COLOR.road_blocked,          label: { es: "Vía bloqueada",   en: "Road blocked" } },
  { color: SOCIAL_LABEL_COLOR.weather_observation,   label: { es: "Meteorología",    en: "Weather" } },
];

const HUAYCO_ITEMS: { color: string; label: { es: string; en: string } }[] = [
  { color: HUAYCO_COLOR.very_high, label: { es: "Muy alto", en: "Very high" } },
  { color: HUAYCO_COLOR.high,      label: { es: "Alto",     en: "High" } },
  { color: HUAYCO_COLOR.moderate,  label: { es: "Moderado", en: "Moderate" } },
  { color: HUAYCO_COLOR.low,       label: { es: "Bajo",     en: "Low" } },
];

const ALERT_ITEMS: { color: string; label: { es: string; en: string } }[] = [
  { color: SEVERITY_COLOR.critical, label: { es: "Crítico (pulsante)", en: "Critical (pulsing)" } },
  { color: SEVERITY_COLOR.high,     label: { es: "Alto",               en: "High" } },
  { color: SEVERITY_COLOR.medium,   label: { es: "Medio",              en: "Medium" } },
  { color: SEVERITY_COLOR.low,      label: { es: "Bajo",               en: "Low" } },
];

const STATION_ITEMS: { color: string; label: { es: string; en: string } }[] = [
  { color: STATION_COLOR.alert,  label: { es: "Alerta (umbral superado)", en: "Alert (threshold exceeded)" } },
  { color: STATION_COLOR.warn,   label: { es: "Aviso (cerca umbral)",     en: "Warning (near threshold)" } },
  { color: STATION_COLOR.normal, label: { es: "Normal",                   en: "Normal" } },
];

const INFRA_ITEMS: { color: string; label: { es: string; en: string } }[] = [
  { color: INFRA_COLOR.hospital,     label: { es: "Hospital", en: "Hospital" } },
  { color: INFRA_COLOR.shelter,      label: { es: "Albergue", en: "Shelter" } },
  { color: INFRA_COLOR.fire_station, label: { es: "Bomberos", en: "Fire station" } },
  { color: INFRA_COLOR.bridge,       label: { es: "Puente",   en: "Bridge" } },
  { color: INFRA_COLOR.school,       label: { es: "Colegio",  en: "School" } },
];

const LABELS = {
  legend:       { es: "Leyenda",                    en: "Legend" },
  riskLevel:    { es: "Nivel de riesgo",            en: "Risk level" },
  rainfall:     { es: "Lluvia acumulada (IMERG)",   en: "Accumulated rainfall (IMERG)" },
  sarFlood:     { es: "Inundación SAR",              en: "SAR flood" },
  sarPolygon:   { es: "Polígono inundado",           en: "Flood polygon" },
  huayco:       { es: "Riesgo huayco",               en: "Huayco risk" },
  social:       { es: "Señales sociales",            en: "Social signals" },
  stations:     { es: "Estaciones ANA",             en: "ANA stations" },
  opAlerts:     { es: "Alertas operacionales",      en: "Operational alerts" },
  infra:        { es: "Infraestructura",            en: "Infrastructure" },
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
  const showShelters = activeLayers.has("shelters");

  if (!showRisk && !showRain && !showSocial && !showHuayco && !showFlood && !showStations && !showInfra && !showShelters) return null;

  return (
    // Sits just above the MapLibre navigation control (+/-) at bottom-right.
    // Nav control: margin-bottom 40px + ~65px height → top at ~105px from bottom.
    // We sit at bottom-[116px] right-4, clear of both the nav control and ticker.
    <div
      className="absolute bottom-[180px] right-4 z-10"
      aria-label={L("legend", locale)}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className={[
          "flex items-center gap-1.5 text-xs font-medium rounded-xl px-3 py-1.5 transition-colors",
          "bg-surface border border-border-strong shadow-card",
          open ? "text-ink" : "text-ink-muted hover:text-ink",
        ].join(" ")}
        aria-expanded={open}
        aria-label={L("legend", locale)}
      >
        <Layers size={13} aria-hidden="true" />
        {L("legend", locale)}
      </button>

      {open && (
        // Opens upward-left from the button — away from the bottom edge and
        // clear of the right edge. Scrollable so tall layer lists don't overflow.
        <div className="absolute bottom-full mb-2 right-0 bg-surface border border-border-strong rounded-2xl p-4 shadow-panel space-y-3 w-52 max-h-[70vh] overflow-y-auto">
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
                <span className="text-2xs text-ink-subtle">0 mm</span>
                <span className="text-2xs text-ink-subtle">200+</span>
              </div>
            </Section>
          )}

          {showFlood && (
            <Section label={L("sarFlood", locale)}>
              <DotRow color={COSTA_500} label={L("sarPolygon", locale)} shape="square" />
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
            <Section label={L("infra", locale)}>
              {INFRA_ITEMS.map(({ color, label }) => (
                <DotRow key={label.es} color={color} label={label[locale]} shape="circle" />
              ))}
            </Section>
          )}

          {showShelters && (
            <Section label={locale === "es" ? "Albergues INDECI" : "INDECI Shelters"}>
              <DotRow color="#34d399" label={locale === "es" ? "Albergue de evacuación" : "Evacuation shelter"} shape="circle" />
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
      <p className="text-2xs font-semibold text-ink-subtle uppercase tracking-caps mb-1.5">
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
        style={{ width: 10, height: 10, backgroundColor: color, opacity: 0.9, flexShrink: 0 }}
        aria-hidden="true"
      />
      <span className="text-xs text-ink-muted leading-none">{label}</span>
    </div>
  );
}
