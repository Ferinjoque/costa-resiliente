"use client";

import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, PlayCircle, AlertTriangle, Droplets, MapPin, Users } from "lucide-react";
import { clsx } from "clsx";
import { useUIStore } from "@/store/ui";

interface Step {
  id: string;
  icon: typeof PlayCircle;
  iconColor: string;
  title: string;
  body: string;
  action?: { label: string; layer?: string; replayDate?: string };
}

const STEPS: Step[] = [
  {
    id: "intro",
    icon: PlayCircle,
    iconColor: "text-amber-400",
    title: "El Niño Costero 2017 — Lima Metropolitana",
    body: "Entre enero y abril de 2017, el Fenómeno El Niño Costero provocó inundaciones y huaycos que afectaron a cientos de miles de personas en Lima. Este tutorial te guía por los datos reales cargados en la plataforma.",
  },
  {
    id: "rain",
    icon: Droplets,
    iconColor: "text-blue-400",
    title: "Paso 1 — Lluvia acumulada",
    body: "Activa la capa IMERG y selecciona la ventana de 72 horas. Durante el evento del 15 de marzo de 2017, las acumulaciones en las cuencas Rímac y Chillón superaron los umbrales de alerta. El mapa muestra la intensidad por cuenca.",
    action: { label: "Activar capa lluvia", layer: "imerg" },
  },
  {
    id: "flood",
    icon: AlertTriangle,
    iconColor: "text-red-400",
    title: "Paso 2 — Polígonos de inundación SAR",
    body: "Los polígonos de inundación derivados de imágenes Sentinel-1 muestran las zonas anegadas detectadas automáticamente por el modelo U-Net. Activa la capa para ver la extensión espacial del evento.",
    action: { label: "Activar capa inundación", layer: "flood" },
  },
  {
    id: "hazard",
    icon: MapPin,
    iconColor: "text-orange-400",
    title: "Paso 3 — Zonas de peligro histórico",
    body: "La capa de peligro histórico (SINPAD 2003–2020) muestra qué distritos tienen mayor densidad histórica de eventos de inundación y deslizamiento. Los distritos en rojo (muy_alto) como Lurigancho-Chosica y Ate concentraron la mayor actividad.",
    action: { label: "Activar peligro histórico", layer: "hazard" },
  },
  {
    id: "exposure",
    icon: Users,
    iconColor: "text-purple-400",
    title: "Paso 4 — Exposición poblacional",
    body: "El panel de Alertas muestra cuántas personas están en la zona de inundación activa (cruce espacial flood_polygons × distritos × población INEI 2017). Esta cifra ayuda a COEN y COER Lima a priorizar evacuaciones.",
  },
  {
    id: "copilot",
    icon: PlayCircle,
    iconColor: "text-costa-400",
    title: "Paso 5 — Copiloto operacional",
    body: "Usa el panel \"Consultar\" para hacer preguntas como: \"¿Cuántas personas están en la zona inundada en Lurigancho?\" o \"¿Qué quebradas superaron el umbral de lluvia en las últimas 72 horas?\". El copiloto responde con datos reales de la base de datos.",
  },
];

export function TutorialOverlay() {
  const { isTutorialOpen, setTutorialOpen, setScenario, toggleLayer, activeLayers } = useUIStore();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (isTutorialOpen) setStep(0);
  }, [isTutorialOpen]);

  if (!isTutorialOpen) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  function handleAction() {
    const action = current.action;
    if (!action) return;
    if (action.layer && !activeLayers.has(action.layer)) {
      toggleLayer(action.layer);
    }
    if (action.replayDate) {
      setScenario({ replayDate: action.replayDate });
    }
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

          {current.action && (
            <button
              onClick={handleAction}
              className="mt-3 flex items-center gap-1.5 text-xs bg-costa-700 hover:bg-costa-500 text-white px-3 py-1.5 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-costa-500 focus-visible:outline-none"
            >
              {current.action.label}
            </button>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-700">
          <button
            onClick={() => setStep((s) => s - 1)}
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
                onClick={() => setStep(i)}
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
              onClick={handleClose}
              className="flex items-center gap-1 text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
            >
              Finalizar
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s + 1)}
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
