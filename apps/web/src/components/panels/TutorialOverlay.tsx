"use client";

/**
 * TutorialOverlay — driver.js spotlight walkthrough.
 *
 * Replaces the old centered-modal approach. Each step highlights a real UI
 * element in-place so judges can watch the platform respond while reading
 * the narrative. Opened by the LeftRail Tutorial button or the El Niño 2017
 * button in ScenarioPanel.
 */

import { useEffect, useRef } from "react";
import { useUIStore } from "@/store/ui";
import type { DriveStep } from "driver.js";

// ─── Step definitions ─────────────────────────────────────────────────────────

function buildSteps(locale: "es" | "en"): DriveStep[] {
  const es = locale === "es";
  return [
    {
      element: "#driver-scenario-panel",
      popover: {
        title: es
          ? "El Niño Costero 2017"
          : "El Niño Costero 2017",
        description: es
          ? "Entre enero y abril de 2017, el Niño Costero provocó inundaciones y huaycos en 15 distritos de Lima. 2&thinsp;063 eventos registrados en SINPAD. Este tutorial recorre la plataforma paso a paso."
          : "Between January and April 2017, El Niño Costero caused floods and huaycos across 15 Lima districts. 2,063 events recorded in SINPAD. This tutorial walks you through the platform step by step.",
        side: "right",
        align: "start",
      },
    },
    {
      element: "#driver-layer-imerg",
      popover: {
        title: es ? "1 — Lluvia acumulada (IMERG 72 h)" : "1 — Accumulated Rainfall (IMERG 72 h)",
        description: es
          ? "La cuenca del Rímac acumuló 63 mm en 72 horas el 15 de marzo — muy por encima del umbral de alerta de 42 mm. Activa la capa para ver la intensidad por cuenca."
          : "The Rímac watershed accumulated 63 mm in 72 hours on March 15 — well above the 42 mm alert threshold. Toggle the layer to see intensity per watershed.",
        side: "right",
        align: "start",
      },
    },
    {
      element: "#driver-layer-flood",
      popover: {
        title: es ? "2 — Inundaciones detectadas por SAR" : "2 — SAR-Detected Floods",
        description: es
          ? "Sentinel-1 capturó los desbordes del Rímac en Chosica y Ate el 22 de marzo. El modelo U-Net (Sen1Floods11) segmentó 17+ km² con 87% de confianza."
          : "Sentinel-1 captured Rímac overflows in Chosica and Ate on March 22. The U-Net model (Sen1Floods11) segmented 17+ km² at 87% confidence.",
        side: "right",
        align: "start",
      },
    },
    {
      element: "#driver-layer-hazard",
      popover: {
        title: es ? "3 — Zonas de peligro histórico (SINPAD)" : "3 — Historical Hazard Zones (SINPAD)",
        description: es
          ? "Densidad de 2 063 eventos Lima 2003–2020. Lurigancho-Chosica y Ate: nivel muy_alto — correlacionado con la extensión del evento 2017."
          : "Density of 2,063 Lima events 2003–2020. Lurigancho-Chosica and Ate: very_high — directly correlated with the 2017 event extent.",
        side: "right",
        align: "start",
      },
    },
    {
      element: "#driver-nav-alerts",
      popover: {
        title: es ? "4 — Alertas operacionales" : "4 — Operational Alerts",
        description: es
          ? "El motor de fusión cruza polígonos SAR × riesgo huayco × señales sociales y emite alertas SINAGERD. El panel muestra exposición poblacional estimada por distrito."
          : "The fusion engine crosses SAR polygons × huayco risk × social signals to emit SINAGERD alerts. The panel shows estimated population exposure per district.",
        side: "right",
        align: "center",
      },
    },
    {
      element: "#driver-nav-proposals",
      popover: {
        title: es ? "5 — Propuestas HITL (4 ojos)" : "5 — HITL Proposals (4-eyes)",
        description: es
          ? "La IA genera borradores de alerta con razonamiento visible. El operador COEL aprueba o rechaza — ninguna alerta se envía sin firma humana. Aprobación dispara SMS + correo a suscriptores SINAGERD."
          : "The AI generates alert drafts with visible reasoning. The COEL operator approves or rejects — no alert is dispatched without a human signature. Approval triggers SMS + email to SINAGERD subscribers.",
        side: "right",
        align: "center",
      },
    },
    {
      element: "#driver-nav-ask",
      popover: {
        title: es ? "6 — Copiloto operacional" : "6 — Operational Copilot",
        description: es
          ? "9 herramientas PostGIS en español. Modo rápido (~2 s, sin LLM) para las 5 consultas frecuentes: prueba «¿cuántas personas están en riesgo?» para ver exposición poblacional al instante."
          : "9 PostGIS tools in Spanish. Quick-mode (~2 s, no LLM) for the 5 most-common queries: try «¿cuántas personas están en riesgo?» to see population exposure instantly.",
        side: "right",
        align: "center",
      },
    },
    {
      element: "#driver-layer-social",
      popover: {
        title: es ? "6 — Señales sociales en tiempo real" : "6 — Real-Time Social Signals",
        description: es
          ? "Bluesky, Reddit y Telegram geolocalizados con triaje IA (Gemma 3) y anonimización PII (Presidio). Los pines en el mapa muestran urgencias por etiqueta de triaje."
          : "Geolocated Bluesky, Reddit, and Telegram with AI triage (Gemma 3) and PII anonymization (Presidio). Map pins show urgencies by triage label.",
        side: "right",
        align: "start",
      },
    },
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TutorialOverlay() {
  const { isTutorialOpen, setTutorialOpen, locale } = useUIStore();

  const driverRef = useRef<import("driver.js").Driver | null>(null);

  useEffect(() => {
    if (!isTutorialOpen) {
      driverRef.current?.destroy();
      driverRef.current = null;
      return;
    }

    let cancelled = false;

    async function start() {
      const store = useUIStore.getState();

      // Ensure scenario panel is open so layer-rows exist in DOM
      if (!store.isScenarioPanelOpen) store.toggleScenarioPanel();

      // Set replay context
      store.setScenario({ isReplayMode: true, replayDate: "2017-03-15", timeWindowHours: 72 });

      // Activate baseline layers — ensure only districts on
      const baseline = new Set(["districts"]);
      const current = store.activeLayers;
      for (const l of current) {
        if (!baseline.has(l)) store.toggleLayer(l);
      }
      if (!current.has("districts")) store.toggleLayer("districts");

      const { driver } = await import("driver.js");
      await import("driver.js/dist/driver.css");
      if (cancelled) return;

      const steps = buildSteps(locale as "es" | "en");

      // Per-step side effects
      const layerEffects: Record<number, () => void> = {
        1: () => { if (!useUIStore.getState().activeLayers.has("imerg")) useUIStore.getState().toggleLayer("imerg"); },
        2: () => { if (!useUIStore.getState().activeLayers.has("flood")) useUIStore.getState().toggleLayer("flood"); },
        3: () => { if (!useUIStore.getState().activeLayers.has("hazard")) useUIStore.getState().toggleLayer("hazard"); },
        4: () => useUIStore.getState().setActivePanel("alerts"),
        5: () => useUIStore.getState().setActivePanel("proposals"),
        6: () => useUIStore.getState().setActivePanel("ask"),
        7: () => {
          if (!useUIStore.getState().activeLayers.has("social")) useUIStore.getState().toggleLayer("social");
          useUIStore.getState().setActivePanel("social");
        },
      };

      driverRef.current = driver({
        showProgress: true,
        progressText: locale === "es" ? "Paso {{current}} de {{total}}" : "Step {{current}} of {{total}}",
        nextBtnText: locale === "es" ? "Siguiente →" : "Next →",
        prevBtnText: locale === "es" ? "← Anterior" : "← Back",
        doneBtnText: locale === "es" ? "Finalizar" : "Finish",
        allowClose: true,
        overlayOpacity: 0.45,
        stagePadding: 8,
        stageRadius: 12,
        steps,
        onHighlighted: (_el, step) => {
          const idx = driverRef.current?.getActiveIndex?.() ?? -1;
          layerEffects[idx]?.();
          void step;
        },
        onDestroyStarted: () => {
          driverRef.current?.destroy();
        },
        onDestroyed: () => {
          if (!cancelled) setTutorialOpen(false);
        },
      });

      driverRef.current.drive();
    }

    start();
    return () => {
      cancelled = true;
      driverRef.current?.destroy();
      driverRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTutorialOpen]);

  return null;
}
