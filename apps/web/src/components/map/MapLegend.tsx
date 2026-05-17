"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { useUIStore } from "@/store/ui";

const RISK_ITEMS = [
  { color: "#dc2626", label: "Riesgo alto" },
  { color: "#f97316", label: "Riesgo moderado" },
  { color: "#22c55e", label: "Riesgo bajo" },
];

const RAIN_STOPS = ["#1e3a5f", "#2563eb", "#38bdf8", "#fbbf24", "#f97316", "#dc2626"];

const SOCIAL_ITEMS = [
  { color: "#ef4444", label: "Ayuda" },
  { color: "#f97316", label: "Infraestructura" },
  { color: "#f59e0b", label: "Vía bloqueada" },
  { color: "#38bdf8", label: "Meteorología" },
];

const HUAYCO_ITEMS = [
  { color: "#dc2626", label: "Muy alto" },
  { color: "#f97316", label: "Alto" },
  { color: "#f59e0b", label: "Moderado" },
  { color: "#22c55e", label: "Bajo" },
];

export function MapLegend() {
  const [open, setOpen] = useState(false);
  const { activeLayers } = useUIStore();

  const showRisk      = activeLayers.has("districts");
  const showRain      = activeLayers.has("imerg");
  const showSocial    = activeLayers.has("social");
  const showHuayco    = activeLayers.has("huayco");
  const showFlood     = activeLayers.has("flood");
  const showStations  = activeLayers.has("stations");

  if (!showRisk && !showRain && !showSocial && !showHuayco && !showFlood && !showStations) return null;

  return (
    <div
      className="absolute bottom-20 left-2 z-10 sm:bottom-16 sm:left-4"
      aria-label="Leyenda del mapa"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className={[
          "flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 shadow-lg transition-colors",
          "bg-surface-raised/90 backdrop-blur-sm border border-slate-700",
          open ? "text-white" : "text-slate-300 hover:text-white",
        ].join(" ")}
        aria-expanded={open}
      >
        <Layers size={12} aria-hidden="true" />
        Leyenda
      </button>

      {open && (
        <div className="mt-1.5 bg-surface-raised/95 backdrop-blur-sm border border-slate-700 rounded-xl p-3 shadow-xl space-y-3 w-44">
          {showRisk && (
            <Section label="Nivel de riesgo">
              {RISK_ITEMS.map(({ color, label }) => (
                <DotRow key={label} color={color} label={label} shape="square" />
              ))}
            </Section>
          )}

          {showRain && (
            <Section label="Lluvia acumulada (IMERG)">
              <div
                className="h-3 rounded-sm w-full"
                style={{
                  background: `linear-gradient(to right, ${RAIN_STOPS.join(", ")})`,
                }}
                aria-hidden="true"
              />
              <div className="flex justify-between mt-0.5">
                <span className="text-[9px] text-slate-400">0 mm</span>
                <span className="text-[9px] text-slate-400">200+</span>
              </div>
            </Section>
          )}

          {showFlood && (
            <Section label="Inundación SAR">
              <DotRow color="#2563eb" label="Polígono inundado" shape="square" />
            </Section>
          )}

          {showHuayco && (
            <Section label="Riesgo huayco">
              {HUAYCO_ITEMS.map(({ color, label }) => (
                <DotRow key={label} color={color} label={label} shape="circle" />
              ))}
            </Section>
          )}

          {showSocial && (
            <Section label="Señales sociales">
              {SOCIAL_ITEMS.map(({ color, label }) => (
                <DotRow key={label} color={color} label={label} shape="circle" />
              ))}
            </Section>
          )}

          {showStations && (
            <Section label="Estaciones ANA">
              <DotRow color="#f97316" label="Alerta (umbral superado)" shape="circle" />
              <DotRow color="#fbbf24" label="Aviso (cerca umbral)" shape="circle" />
              <DotRow color="#22c55e" label="Normal" shape="circle" />
            </Section>
          )}
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

function DotRow({
  color,
  label,
  shape,
}: {
  color: string;
  label: string;
  shape: "circle" | "square";
}) {
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
