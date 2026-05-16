"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X, ChevronLeft, ChevronRight, PlayCircle, AlertTriangle,
  Droplets, MapPin, Users, MessageSquare,
} from "lucide-react";
import { clsx } from "clsx";
import { useUIStore } from "@/store/ui";

interface Step {
  id: string;
  icon: typeof PlayCircle;
  iconColor: string;
  title: string;
  body: string;
  stat?: string;
  // Auto-apply on step enter
  autoLayers?: string[];
  autoReplayDate?: string;
  autoTimeWindow?: number;
  autoDistrict?: { ubigeo: string; name: string } | null;
  autoPanel?: "alerts" | "ask" | "dashboard";
  actionLabel?: string;
}

const STEPS: Step[] = [
  {
    id: "intro",
    icon: PlayCircle,
    iconColor: "text-amber-400",
    title: "El Niño Costero 2017 — Lima Metropolitana",
    body: "Entre enero y abril de 2017, el Fenómeno El Niño Costero provocó inundaciones y huaycos que afectaron a cientos de miles de personas en Lima. 2,063 eventos registrados en SINPAD. Este tutorial te guía por los datos de la plataforma.",
    stat: "350,000 personas afectadas · 15 distritos · 3 cuencas",
    autoLayers: ["districts"],
    autoReplayDate: "2017-03-15",
    autoTimeWindow: 72,
    autoDistrict: null,
  },
  {
    id: "rain",
    icon: Droplets,
    iconColor: "text-blue-400",
    title: "1 — Lluvia acumulada (IMERG 72h)",
    body: "El 15 de marzo de 2017, la cuenca del Rímac acumuló 63+ mm en 72 horas — muy por encima del umbral de alerta de 42 mm. El mapa muestra la intensidad por cuenca hidrográfica.",
    stat: "Rímac: 63 mm / 72h · Chillón: 28 mm · Umbral: 42 mm",
    autoLayers: ["districts", "imerg"],
    autoTimeWindow: 72,
    autoReplayDate: "2017-03-15",
    actionLabel: "Capa IMERG activada",
  },
  {
    id: "flood",
    icon: AlertTriangle,
    iconColor: "text-red-400",
    title: "2 — Inundaciones detectadas por SAR",
    body: "Sentinel-1 capturó los desbordes del Rímac en Chosica y Ate. El modelo U-Net (Sen1Floods11) segmentó 17+ km² de zonas inundadas con 87% de confianza el 22 de marzo.",
    stat: "Chosica: 4.2 km² · Carabayllo: 2.8 km² · Ate: 1.9 km²",
    autoLayers: ["districts", "imerg", "flood"],
    autoReplayDate: "2017-03-22",
    autoDistrict: { ubigeo: "150112", name: "Lurigancho" },
    actionLabel: "Polígonos SAR cargados",
  },
  {
    id: "hazard",
    icon: MapPin,
    iconColor: "text-orange-400",
    title: "3 — Zonas de peligro histórico (SINPAD)",
    body: "El análisis de 2,063 eventos Lima (2003–2020) clasifica los distritos por densidad histórica. Lurigancho-Chosica y Ate muestran nivel muy_alto — correlacionado directamente con la extensión del evento 2017.",
    stat: "Muy alto: 8 distritos · Alto: 14 distritos · Fuente: INDECI SINPAD",
    autoLayers: ["districts", "flood", "hazard"],
    autoDistrict: null,
    actionLabel: "Peligro histórico activado",
  },
  {
    id: "exposure",
    icon: Users,
    iconColor: "text-purple-400",
    title: "4 — Exposición poblacional (INEI 2017)",
    body: "Cruce espacial flood_polygons × distritos × población INEI. El panel de Alertas muestra personas en zona inundada activa, permitiendo al COEN priorizar evacuaciones por densidad de riesgo.",
    stat: "Ate: 478,278 hab. · Lurigancho: 218,976 hab.",
    autoLayers: ["districts", "flood", "hazard", "infrastructure"],
    autoPanel: "alerts",
    actionLabel: "Panel de alertas abierto",
  },
  {
    id: "copilot",
    icon: MessageSquare,
    iconColor: "text-costa-400",
    title: "5 — Copiloto operacional",
    body: "Consultas en español conectadas directamente a la base de datos. Sin alucinaciones — cada número proviene de una fila real de PostGIS.",
    stat: "\"¿Qué quebradas superaron umbral en 72h?\" → respuesta en <3s",
    autoPanel: "ask",
    actionLabel: "Copiloto abierto",
  },
];

export function TutorialOverlay() {
  const {
    isTutorialOpen, setTutorialOpen,
    setScenario, toggleLayer, setActivePanel,
  } = useUIStore();
  const [step, setStep] = useState(0);

  // Apply step side-effects (layers, scenario, panel)
  const applyStep = useCallback((s: Step) => {
    if (s.autoReplayDate !== undefined) {
      setScenario({ isReplayMode: true, replayDate: s.autoReplayDate });
    }
    if (s.autoTimeWindow !== undefined) {
      setScenario({ timeWindowHours: s.autoTimeWindow });
    }
    if (s.autoDistrict !== undefined) {
      setScenario({
        districtUbigeo: s.autoDistrict?.ubigeo ?? null,
        districtName:   s.autoDistrict?.name ?? null,
      });
    }
    if (s.autoLayers) {
      const desired = new Set(s.autoLayers);
      const current = useUIStore.getState().activeLayers;
      for (const l of desired) {
        if (!current.has(l)) toggleLayer(l);
      }
      for (const l of current) {
        if (!desired.has(l) && !["districts"].includes(l)) toggleLayer(l);
      }
    }
    if (s.autoPanel) {
      setActivePanel(s.autoPanel);
    }
  }, [setScenario, toggleLayer, setActivePanel]);

  useEffect(() => {
    if (isTutorialOpen) {
      setStep(0);
      applyStep(STEPS[0]);
    }
  }, [isTutorialOpen, applyStep]);

  if (!isTutorialOpen) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  function goTo(next: number) {
    setStep(next);
    applyStep(STEPS[next]);
  }

  function handleClose() {
    setTutorialOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial El Niño 2017"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Card */}
      <div className="relative w-full sm:max-w-md bg-surface-raised border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col z-10">
        {/* Progress bar */}
        <div className="h-1 bg-slate-700 rounded-t-2xl sm:rounded-t-2xl overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            aria-hidden="true"
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span className="text-[10px] text-slate-400">
            Paso {step + 1} de {STEPS.length} · El Niño Costero 2017
          </span>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white transition-colors rounded focus-visible:ring-2 focus-visible:ring-costa-500 focus-visible:outline-none"
            aria-label="Cerrar tutorial"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pb-2 flex-1">
          <div className="flex items-start gap-3 mb-3">
            <div className={clsx("mt-0.5 shrink-0", current.iconColor)}>
              <Icon size={22} aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-white leading-snug">
              {current.title}
            </h2>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            {current.body}
          </p>

          {current.stat && (
            <p className="mt-3 text-[11px] text-slate-400 leading-relaxed font-mono bg-slate-800/60 rounded-lg px-3 py-2">
              {current.stat}
            </p>
          )}

          {current.actionLabel && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-costa-400 font-medium">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-costa-400" aria-hidden="true" />
              {current.actionLabel}
            </p>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-700">
          <button
            onClick={() => goTo(step - 1)}
            disabled={isFirst}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-costa-500 focus-visible:outline-none rounded"
            aria-label="Paso anterior"
          >
            <ChevronLeft size={14} aria-hidden="true" />
            Anterior
          </button>

          {/* Step dots */}
          <div className="flex gap-1.5" role="tablist" aria-label="Pasos del tutorial">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => goTo(i)}
                role="tab"
                aria-selected={i === step}
                aria-label={`Ir al paso ${i + 1}`}
                className={clsx(
                  "w-1.5 h-1.5 rounded-full transition-all focus-visible:ring-2 focus-visible:ring-costa-500 focus-visible:outline-none",
                  i === step ? "bg-amber-400 w-4" : "bg-slate-600 hover:bg-slate-400"
                )}
              />
            ))}
          </div>

          {isLast ? (
            <button
              onClick={() => { setScenario({ isReplayMode: false, replayDate: null }); handleClose(); }}
              className="flex items-center gap-1 text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
            >
              Finalizar
            </button>
          ) : (
            <button
              onClick={() => goTo(step + 1)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-costa-500 focus-visible:outline-none rounded"
              aria-label="Siguiente paso"
            >
              Siguiente
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
