"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X, ChevronLeft, ChevronRight, PlayCircle, AlertTriangle,
  Droplets, MapPin, Users, MessageSquare, Radio,
} from "lucide-react";
import { clsx } from "clsx";
import { useUIStore } from "@/store/ui";
import type { Locale } from "@/store/ui";
import { Button } from "@/components/ui/primitives";

interface Step {
  id: string;
  icon: typeof PlayCircle;
  iconColor: string;
  title: { es: string; en: string };
  body: { es: string; en: string };
  stat?: { es: string; en: string };
  autoLayers?: string[];
  autoReplayDate?: string;
  autoTimeWindow?: number;
  autoDistrict?: { ubigeo: string; name: string } | null;
  autoPanel?: "alerts" | "ask" | "dashboard" | "social";
  actionLabel?: { es: string; en: string };
}

const STEPS: Step[] = [
  {
    id: "intro",
    icon: PlayCircle,
    iconColor: "text-severity-medium",
    title: {
      es: "El Niño Costero 2017 — Lima Metropolitana",
      en: "El Niño Costero 2017 — Lima Metropolitan Area",
    },
    body: {
      es: "Entre enero y abril de 2017, el Fenómeno El Niño Costero provocó inundaciones y huaycos que afectaron a cientos de miles de personas en Lima. 2,063 eventos registrados en SINPAD. Este tutorial te guía por los datos de la plataforma.",
      en: "Between January and April 2017, the Coastal El Niño phenomenon caused floods and huaycos affecting hundreds of thousands in Lima. 2,063 events recorded in SINPAD. This tutorial guides you through the platform data.",
    },
    stat: {
      es: "350,000 personas afectadas · 15 distritos · 3 cuencas",
      en: "350,000 people affected · 15 districts · 3 watersheds",
    },
    autoLayers: ["districts"],
    autoReplayDate: "2017-03-15",
    autoTimeWindow: 72,
    autoDistrict: null,
  },
  {
    id: "rain",
    icon: Droplets,
    iconColor: "text-costa-400",
    title: {
      es: "1 — Lluvia acumulada (IMERG 72h)",
      en: "1 — Accumulated Rainfall (IMERG 72h)",
    },
    body: {
      es: "El 15 de marzo de 2017, la cuenca del Rímac acumuló 63+ mm en 72 horas — muy por encima del umbral de alerta de 42 mm. El mapa muestra la intensidad por cuenca hidrográfica.",
      en: "On March 15, 2017, the Rímac watershed accumulated 63+ mm in 72 hours — well above the 42 mm alert threshold. The map shows intensity by watershed.",
    },
    stat: {
      es: "Rímac: 63 mm / 72h · Chillón: 28 mm · Umbral: 42 mm",
      en: "Rímac: 63 mm / 72h · Chillón: 28 mm · Threshold: 42 mm",
    },
    autoLayers: ["districts", "imerg"],
    autoTimeWindow: 72,
    autoReplayDate: "2017-03-15",
    actionLabel: { es: "Capa IMERG activada", en: "IMERG layer activated" },
  },
  {
    id: "flood",
    icon: AlertTriangle,
    iconColor: "text-severity-critical",
    title: {
      es: "2 — Inundaciones detectadas por SAR",
      en: "2 — SAR-Detected Floods",
    },
    body: {
      es: "Sentinel-1 capturó los desbordes del Rímac en Chosica y Ate. El modelo U-Net (Sen1Floods11) segmentó 17+ km² de zonas inundadas con 87% de confianza el 22 de marzo.",
      en: "Sentinel-1 captured Rímac river overflows in Chosica and Ate. The U-Net model (Sen1Floods11) segmented 17+ km² of flooded areas with 87% confidence on March 22.",
    },
    stat: {
      es: "Chosica: 4.2 km² · Carabayllo: 2.8 km² · Ate: 1.9 km²",
      en: "Chosica: 4.2 km² · Carabayllo: 2.8 km² · Ate: 1.9 km²",
    },
    autoLayers: ["districts", "imerg", "flood"],
    autoReplayDate: "2017-03-22",
    autoDistrict: { ubigeo: "150118", name: "Lurigancho" },
    actionLabel: { es: "Polígonos SAR cargados", en: "SAR polygons loaded" },
  },
  {
    id: "hazard",
    icon: MapPin,
    iconColor: "text-severity-high",
    title: {
      es: "3 — Zonas de peligro histórico (SINPAD)",
      en: "3 — Historical Hazard Zones (SINPAD)",
    },
    body: {
      es: "El análisis de 2,063 eventos Lima (2003–2020) clasifica los distritos por densidad histórica. Lurigancho-Chosica y Ate muestran nivel muy_alto — correlacionado directamente con la extensión del evento 2017.",
      en: "Analysis of 2,063 Lima events (2003–2020) classifies districts by historical density. Lurigancho-Chosica and Ate show very_high level — directly correlated with the 2017 event extent.",
    },
    stat: {
      es: "Muy alto: 8 distritos · Alto: 14 distritos · Fuente: INDECI SINPAD",
      en: "Very high: 8 districts · High: 14 districts · Source: INDECI SINPAD",
    },
    autoLayers: ["districts", "flood", "hazard"],
    autoDistrict: null,
    actionLabel: { es: "Peligro histórico activado", en: "Historical hazard activated" },
  },
  {
    id: "exposure",
    icon: Users,
    iconColor: "text-sand-300",
    title: {
      es: "4 — Exposición poblacional (INEI 2017)",
      en: "4 — Population Exposure (INEI 2017)",
    },
    body: {
      es: "Cruce espacial flood_polygons × distritos × población INEI. El panel de Alertas muestra personas en zona inundada activa, permitiendo al COEN priorizar evacuaciones por densidad de riesgo.",
      en: "Spatial cross-reference of flood polygons × districts × INEI population. The Alerts panel shows people in active flood zones, enabling COEN to prioritize evacuations by risk density.",
    },
    stat: {
      es: "Ate: 478,278 hab. · Lurigancho: 218,976 hab.",
      en: "Ate: 478,278 pop. · Lurigancho: 218,976 pop.",
    },
    autoLayers: ["districts", "flood", "hazard", "infrastructure"],
    autoPanel: "alerts",
    actionLabel: { es: "Panel de alertas abierto", en: "Alerts panel opened" },
  },
  {
    id: "copilot",
    icon: MessageSquare,
    iconColor: "text-costa-400",
    title: {
      es: "5 — Copiloto operacional (Gemma 3)",
      en: "5 — Operational Copilot (Gemma 3)",
    },
    body: {
      es: "Consultas en español o inglés directamente sobre la base de datos PostGIS. Sin alucinaciones — cada cifra proviene de una fila real. Pregunta por distritos, quebradas, nivel del río, o rutas bloqueadas.",
      en: "Queries in Spanish or English directly against the PostGIS database. No hallucinations — every figure comes from a real row. Ask about districts, quebradas, river levels, or blocked evacuation routes.",
    },
    stat: {
      es: "21 consultas cubiertas · Triaje por intención · Fuente: PostGIS + IMERG + SAR",
      en: "21 queries covered · Intent triage · Source: PostGIS + IMERG + SAR",
    },
    autoPanel: "ask",
    actionLabel: { es: "Copiloto abierto", en: "Copilot opened" },
  },
  {
    id: "social",
    icon: Radio,
    iconColor: "text-severity-high",
    title: {
      es: "6 — Señales sociales en tiempo real",
      en: "6 — Real-Time Social Signals",
    },
    body: {
      es: "Bluesky, Reddit y Telegram geolocalizado con triaje por IA (Gemma 3) y anonimización PII (Presidio). Las señales urgentes aparecen en el mapa y en el HUD superior.",
      en: "Geolocated Bluesky, Reddit, and Telegram with AI triage (Gemma 3) and PII anonymization (Presidio). Urgent signals appear on the map and in the top HUD.",
    },
    stat: {
      es: "Fuentes: Bluesky · Reddit · Telegram · Confianza media: 0.82",
      en: "Sources: Bluesky · Reddit · Telegram · Avg confidence: 0.82",
    },
    autoLayers: ["districts", "flood", "social"],
    autoPanel: "social",
    autoDistrict: null,
    actionLabel: { es: "Feed social abierto", en: "Social feed opened" },
  },
];

export function TutorialOverlay() {
  const {
    isTutorialOpen, setTutorialOpen,
    setScenario, toggleLayer, setActivePanel,
    locale,
  } = useUIStore();
  const [step, setStep] = useState(0);

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

  const L = (obj: { es: string; en: string }) => obj[locale as Locale] ?? obj.es;

  const prevLabel = locale === "es" ? "Anterior" : "Previous";
  const nextLabel = locale === "es" ? "Siguiente" : "Next";
  const finishLabel = locale === "es" ? "Finalizar" : "Finish";
  const skipLabel = locale === "es" ? "Saltar" : "Skip";
  const stepOf = locale === "es"
    ? `Paso ${step + 1} de ${STEPS.length} · El Niño Costero 2017`
    : `Step ${step + 1} of ${STEPS.length} · El Niño Costero 2017`;
  const closeLbl = locale === "es" ? "Cerrar tutorial" : "Close tutorial";
  const prevAriaLbl = locale === "es" ? "Paso anterior" : "Previous step";
  const nextAriaLbl = locale === "es" ? "Siguiente paso" : "Next step";
  const dotsAriaLbl = locale === "es" ? "Pasos del tutorial" : "Tutorial steps";
  const dotAriaLbl = (i: number) =>
    locale === "es" ? `Ir al paso ${i + 1}` : `Go to step ${i + 1}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={locale === "es" ? "Tutorial El Niño 2017" : "El Niño 2017 Tutorial"}
    >
      {/* Backdrop — dark translucent, no blur */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Card — solid cream surface, no glass, no backdrop-blur */}
      <div className="relative w-full sm:max-w-md bg-surface border border-border-strong rounded-t-2xl sm:rounded-2xl shadow-panel flex flex-col z-10">

        {/* Progress bar */}
        <div className="h-1 bg-border rounded-t-2xl sm:rounded-t-2xl overflow-hidden">
          <div
            className="h-full bg-ink transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            aria-hidden="true"
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span className="text-[10px] text-ink-subtle">{stepOf}</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={handleClose}
            aria-label={closeLbl}
          >
            <X size={14} aria-hidden="true" />
          </Button>
        </div>

        {/* Content */}
        <div className="px-5 pb-2 flex-1">
          <div className="flex items-start gap-3 mb-3">
            {/* Step icon container */}
            <div className="mt-0.5 shrink-0 w-10 h-10 rounded-xl bg-surface-sunken flex items-center justify-center">
              <Icon size={20} className={current.iconColor} aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-ink leading-snug pt-1.5">
              {L(current.title)}
            </h2>
          </div>

          <p className="text-sm text-ink-muted leading-relaxed">
            {L(current.body)}
          </p>

          {current.stat && (
            <p className="mt-3 bg-surface-sunken border border-border text-xs text-ink-muted px-3 py-1.5 rounded-xl leading-relaxed font-mono">
              {L(current.stat)}
            </p>
          )}

          {current.actionLabel && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-costa-400 font-medium">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-costa-400" aria-hidden="true" />
              {L(current.actionLabel)}
            </p>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border">

          {/* Prev */}
          {!isFirst ? (
            <Button
              variant="secondary"
              size="xs"
              onClick={() => goTo(step - 1)}
              aria-label={prevAriaLbl}
            >
              <ChevronLeft size={13} aria-hidden="true" />
              {prevLabel}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="xs"
              onClick={handleClose}
            >
              {skipLabel}
            </Button>
          )}

          {/* Step dots */}
          <div className="flex gap-1.5" role="tablist" aria-label={dotsAriaLbl}>
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => goTo(i)}
                role="tab"
                aria-selected={i === step}
                aria-label={dotAriaLbl(i)}
                className={clsx(
                  "h-1.5 rounded-full transition-all focus-visible:ring-2 focus-visible:ring-costa-500 focus-visible:outline-none",
                  i === step ? "bg-ink w-4" : "bg-border hover:bg-ink-subtle w-1.5"
                )}
              />
            ))}
          </div>

          {/* Next / Finish */}
          {isLast ? (
            <Button
              variant="primary"
              size="xs"
              onClick={() => {
                setScenario({ isReplayMode: false, replayDate: null });
                handleClose();
              }}
            >
              {finishLabel}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="xs"
              onClick={() => goTo(step + 1)}
              aria-label={nextAriaLbl}
            >
              {nextLabel}
              <ChevronRight size={13} aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
