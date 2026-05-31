"use client";

/**
 * TutorialOverlay — cinematic El Niño 2017 event simulation.
 *
 * Each step flies the camera to a meaningful vantage point over Lima,
 * activates the relevant layers, and shows data-driven metrics from the
 * real 2017 event. Rich HTML via driver.js popover descriptions.
 */

import { useEffect, useRef } from "react";
import { useUIStore } from "@/store/ui";
import { mapInstanceRef } from "@/components/map/MapView";
import type { DriveStep } from "driver.js";

// ─── Camera positions ─────────────────────────────────────────────────────────

const CAMERAS = {
  overview:   { center: [-76.97, -12.05] as [number, number], zoom: 9.5,  pitch: 0,   bearing: 0 },
  rimac:      { center: [-76.85, -11.94] as [number, number], zoom: 10.8, pitch: 45,  bearing: -30 },
  ate_chosica:{ center: [-76.78, -11.96] as [number, number], zoom: 11.5, pitch: 52,  bearing: -45 },
  hazard:     { center: [-77.01, -11.97] as [number, number], zoom: 10.2, pitch: 35,  bearing: 15 },
  alerts:     { center: [-76.96, -12.07] as [number, number], zoom: 10.5, pitch: 20,  bearing: -10 },
  proposals:  { center: [-76.97, -12.05] as [number, number], zoom: 9.8,  pitch: 0,   bearing: 0 },
  copilot:    { center: [-76.94, -12.10] as [number, number], zoom: 11.0, pitch: 28,  bearing: 20 },
  social:     { center: [-77.02, -12.03] as [number, number], zoom: 11.2, pitch: 18,  bearing: -5 },
} as const;

function cam(key: keyof typeof CAMERAS, duration = 1400) {
  const m = mapInstanceRef.current;
  if (!m) return;
  const { center, zoom, pitch, bearing } = CAMERAS[key];
  m.flyTo({ center, zoom, pitch, bearing, duration, essential: true });
}

// ─── Step builder ─────────────────────────────────────────────────────────────

function buildSteps(locale: "es" | "en"): DriveStep[] {
  const es = locale === "es";

  const step0: DriveStep = {
    element: "#driver-scenario-panel",
    popover: {
      title: es ? "El Niño Costero 2017 — Simulación operativa" : "El Niño Costero 2017 — Operational Simulation",
      description: es ? `
        <span class="cr-tour-ts">Enero–Abril 2017 · SINPAD / COER Lima</span>
        <div class="cr-tour-metrics">
          <div class="cr-tour-metric cr-tour-metric--crit">
            <span class="cr-tour-num">2&thinsp;063</span>
            <span class="cr-tour-unit">eventos</span>
            <span class="cr-tour-lbl">Lima Metropolitana</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--warn">
            <span class="cr-tour-num">15</span>
            <span class="cr-tour-unit">distritos</span>
            <span class="cr-tour-lbl">afectados</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--crit">
            <span class="cr-tour-num">17+</span>
            <span class="cr-tour-unit">km²</span>
            <span class="cr-tour-lbl">inundados</span>
          </div>
        </div>
        <hr class="cr-tour-divider"/>
        <p class="cr-tour-body">La plataforma replica el evento en tiempo real. Cada capa, alerta y decisión que ves aquí se basa en datos reales del SENAMHI, INDECI y observaciones SAR Sentinel-1.</p>
        <div class="cr-tour-badges">
          <span class="cr-tour-badge cr-tour-badge--crit">SINAGERD Nivel 3</span>
          <span class="cr-tour-badge cr-tour-badge--warn">COEN Activado</span>
          <span class="cr-tour-badge">COER Lima</span>
        </div>
      ` : `
        <span class="cr-tour-ts">January–April 2017 · SINPAD / COER Lima</span>
        <div class="cr-tour-metrics">
          <div class="cr-tour-metric cr-tour-metric--crit">
            <span class="cr-tour-num">2,063</span>
            <span class="cr-tour-unit">events</span>
            <span class="cr-tour-lbl">Lima Metro</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--warn">
            <span class="cr-tour-num">15</span>
            <span class="cr-tour-unit">districts</span>
            <span class="cr-tour-lbl">affected</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--crit">
            <span class="cr-tour-num">17+</span>
            <span class="cr-tour-unit">km²</span>
            <span class="cr-tour-lbl">flooded</span>
          </div>
        </div>
        <hr class="cr-tour-divider"/>
        <p class="cr-tour-body">The platform replays the event in real time. Every layer, alert, and decision shown here is grounded in real SENAMHI, INDECI, and Sentinel-1 SAR data.</p>
        <div class="cr-tour-badges">
          <span class="cr-tour-badge cr-tour-badge--crit">SINAGERD Level 3</span>
          <span class="cr-tour-badge cr-tour-badge--warn">COEN Activated</span>
          <span class="cr-tour-badge">COER Lima</span>
        </div>
      `,
      side: "right", align: "start",
    },
  };

  const step1: DriveStep = {
    element: "#driver-layer-imerg",
    popover: {
      title: es ? "1 — Lluvia acumulada (IMERG 72 h)" : "1 — Accumulated Rainfall (IMERG 72 h)",
      description: es ? `
        <span class="cr-tour-ts">15 Mar 2017 · NASA IMERG Late v07</span>
        <div class="cr-tour-metrics">
          <div class="cr-tour-metric cr-tour-metric--crit">
            <span class="cr-tour-num">63</span>
            <span class="cr-tour-unit">mm</span>
            <span class="cr-tour-lbl">Cuenca Rímac 72h</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--warn">
            <span class="cr-tour-num">42</span>
            <span class="cr-tour-unit">mm</span>
            <span class="cr-tour-lbl">umbral alerta</span>
          </div>
        </div>
        <p class="cr-tour-body">Precipitación 1.5× sobre umbral SENAMHI. El gradiente de color rojo/naranja sobre la cuenca alta del Rímac anticipa el desborde 7 horas después.</p>
        <div class="cr-tour-badges">
          <span class="cr-tour-badge cr-tour-badge--crit">+50% umbral</span>
          <span class="cr-tour-badge">SENAMHI alerta</span>
        </div>
      ` : `
        <span class="cr-tour-ts">Mar 15 2017 · NASA IMERG Late v07</span>
        <div class="cr-tour-metrics">
          <div class="cr-tour-metric cr-tour-metric--crit">
            <span class="cr-tour-num">63</span>
            <span class="cr-tour-unit">mm</span>
            <span class="cr-tour-lbl">Rímac basin 72h</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--warn">
            <span class="cr-tour-num">42</span>
            <span class="cr-tour-unit">mm</span>
            <span class="cr-tour-lbl">alert threshold</span>
          </div>
        </div>
        <p class="cr-tour-body">Precipitation 1.5× above SENAMHI threshold. The red/orange color ramp over the upper Rímac watershed predicts the overflow 7 hours ahead.</p>
        <div class="cr-tour-badges">
          <span class="cr-tour-badge cr-tour-badge--crit">+50% threshold</span>
          <span class="cr-tour-badge">SENAMHI alert</span>
        </div>
      `,
      side: "right", align: "start",
    },
  };

  const step2: DriveStep = {
    element: "#driver-layer-flood",
    popover: {
      title: es ? "2 — Inundaciones detectadas por SAR" : "2 — SAR-Detected Floods",
      description: es ? `
        <span class="cr-tour-ts">22 Mar 2017 · Sentinel-1A · Sen1Floods11 U-Net</span>
        <div class="cr-tour-metrics">
          <div class="cr-tour-metric cr-tour-metric--crit">
            <span class="cr-tour-num">17.3</span>
            <span class="cr-tour-unit">km²</span>
            <span class="cr-tour-lbl">área inundada</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--ok">
            <span class="cr-tour-num">87</span>
            <span class="cr-tour-unit">%</span>
            <span class="cr-tour-lbl">confianza modelo</span>
          </div>
        </div>
        <p class="cr-tour-body">Sentinel-1 capturó los desbordes del Rímac en Chosica y Ate. El modelo U-Net, entrenado en Sen1Floods11, segmenta agua incluso bajo cobertura nubosa total.</p>
        <div class="cr-tour-badges">
          <span class="cr-tour-badge cr-tour-badge--crit">Chosica inundado</span>
          <span class="cr-tour-badge cr-tour-badge--crit">Ate inundado</span>
          <span class="cr-tour-badge">Revisión COER</span>
        </div>
      ` : `
        <span class="cr-tour-ts">Mar 22 2017 · Sentinel-1A · Sen1Floods11 U-Net</span>
        <div class="cr-tour-metrics">
          <div class="cr-tour-metric cr-tour-metric--crit">
            <span class="cr-tour-num">17.3</span>
            <span class="cr-tour-unit">km²</span>
            <span class="cr-tour-lbl">flooded area</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--ok">
            <span class="cr-tour-num">87</span>
            <span class="cr-tour-unit">%</span>
            <span class="cr-tour-lbl">model confidence</span>
          </div>
        </div>
        <p class="cr-tour-body">Sentinel-1 captured Rímac overflows in Chosica and Ate. The U-Net model, trained on Sen1Floods11, segments water even under full cloud cover.</p>
        <div class="cr-tour-badges">
          <span class="cr-tour-badge cr-tour-badge--crit">Chosica flooded</span>
          <span class="cr-tour-badge cr-tour-badge--crit">Ate flooded</span>
          <span class="cr-tour-badge">COER Review</span>
        </div>
      `,
      side: "right", align: "start",
    },
  };

  const step3: DriveStep = {
    element: "#driver-layer-hazard",
    popover: {
      title: es ? "3 — Zonas de peligro histórico (SINPAD)" : "3 — Historical Hazard Zones (SINPAD)",
      description: es ? `
        <span class="cr-tour-ts">2003–2020 · INDECI SINPAD · 2 063 eventos</span>
        <div class="cr-tour-metrics">
          <div class="cr-tour-metric cr-tour-metric--crit">
            <span class="cr-tour-num">muy_alto</span>
            <span class="cr-tour-unit">&nbsp;</span>
            <span class="cr-tour-lbl">Lurigancho-Chosica</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--crit">
            <span class="cr-tour-num">muy_alto</span>
            <span class="cr-tour-unit">&nbsp;</span>
            <span class="cr-tour-lbl">Ate</span>
          </div>
        </div>
        <p class="cr-tour-body">Densidad de 17 años de eventos en Lima. Rojo oscuro = zonas repetidamente golpeadas. La correlación con los polígonos SAR 2017 valida el mapa de peligro como predictor operacional.</p>
        <div class="cr-tour-badges">
          <span class="cr-tour-badge cr-tour-badge--crit">SINPAD validado</span>
          <span class="cr-tour-badge">CENEPRED</span>
        </div>
      ` : `
        <span class="cr-tour-ts">2003–2020 · INDECI SINPAD · 2,063 events</span>
        <div class="cr-tour-metrics">
          <div class="cr-tour-metric cr-tour-metric--crit">
            <span class="cr-tour-num">very_high</span>
            <span class="cr-tour-unit">&nbsp;</span>
            <span class="cr-tour-lbl">Lurigancho-Chosica</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--crit">
            <span class="cr-tour-num">very_high</span>
            <span class="cr-tour-unit">&nbsp;</span>
            <span class="cr-tour-lbl">Ate</span>
          </div>
        </div>
        <p class="cr-tour-body">17 years of event density across Lima. Dark red = repeatedly struck zones. The correlation with 2017 SAR polygons validates the hazard map as an operational predictor.</p>
        <div class="cr-tour-badges">
          <span class="cr-tour-badge cr-tour-badge--crit">SINPAD validated</span>
          <span class="cr-tour-badge">CENEPRED</span>
        </div>
      `,
      side: "right", align: "start",
    },
  };

  const step4: DriveStep = {
    element: "#driver-nav-alerts",
    popover: {
      title: es ? "4 — Alertas operacionales SINAGERD" : "4 — SINAGERD Operational Alerts",
      description: es ? `
        <span class="cr-tour-ts">22 Mar 2017 18:41 PET · Motor de fusión CR</span>
        <div class="cr-tour-metrics">
          <div class="cr-tour-metric cr-tour-metric--crit">
            <span class="cr-tour-num">3</span>
            <span class="cr-tour-unit">críticas</span>
            <span class="cr-tour-lbl">activas ahora</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--warn">
            <span class="cr-tour-num">42&thinsp;000</span>
            <span class="cr-tour-unit">personas</span>
            <span class="cr-tour-lbl">zona inundada</span>
          </div>
        </div>
        <p class="cr-tour-body">El motor de fusión cruza SAR × huayco × lluvia ANA × señales sociales. Incluye exposición poblacional por distrito, nivel SINAGERD, y SLA de reconocimiento (5/10/30 min). Toast de aviso al vencer el SLA.</p>
        <div class="cr-tour-badges">
          <span class="cr-tour-badge cr-tour-badge--crit">Evacuación Ate</span>
          <span class="cr-tour-badge cr-tour-badge--warn">Alerta Chosica</span>
        </div>
      ` : `
        <span class="cr-tour-ts">Mar 22 2017 18:41 PET · CR Fusion Engine</span>
        <div class="cr-tour-metrics">
          <div class="cr-tour-metric cr-tour-metric--crit">
            <span class="cr-tour-num">3</span>
            <span class="cr-tour-unit">critical</span>
            <span class="cr-tour-lbl">active now</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--warn">
            <span class="cr-tour-num">42,000</span>
            <span class="cr-tour-unit">people</span>
            <span class="cr-tour-lbl">in flood zone</span>
          </div>
        </div>
        <p class="cr-tour-body">Fusion engine crosses SAR × huayco × ANA rainfall × social signals. Includes district population exposure, SINAGERD level, and SLA acknowledgement timer (5/10/30 min). Toast fires when SLA is breached.</p>
        <div class="cr-tour-badges">
          <span class="cr-tour-badge cr-tour-badge--crit">Evacuate Ate</span>
          <span class="cr-tour-badge cr-tour-badge--warn">Chosica Alert</span>
        </div>
      `,
      side: "right", align: "center",
    },
  };

  const step5: DriveStep = {
    element: "#driver-nav-proposals",
    popover: {
      title: es ? "5 — Propuestas HITL (cuatro ojos)" : "5 — HITL Proposals (4-eyes rule)",
      description: es ? `
        <span class="cr-tour-ts">Motor de propuestas · Modelo local Ollama</span>
        <div class="cr-tour-metrics">
          <div class="cr-tour-metric cr-tour-metric--ok">
            <span class="cr-tour-num">0</span>
            <span class="cr-tour-unit">alertas</span>
            <span class="cr-tour-lbl">sin firma humana</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--warn">
            <span class="cr-tour-num">2</span>
            <span class="cr-tour-unit">borradores</span>
            <span class="cr-tour-lbl">pendientes revisión</span>
          </div>
        </div>
        <p class="cr-tour-body">La IA genera borradores con razonamiento visible. El operador COEL aprueba o rechaza. La aprobación dispara SMS + correo a suscriptores SINAGERD. Ninguna alerta sale sin firma humana.</p>
        <div class="cr-tour-badges">
          <span class="cr-tour-badge cr-tour-badge--ok">IA genera</span>
          <span class="cr-tour-badge cr-tour-badge--crit">Humano firma</span>
          <span class="cr-tour-badge">SMS + Email</span>
        </div>
      ` : `
        <span class="cr-tour-ts">Proposal engine · Ollama local model</span>
        <div class="cr-tour-metrics">
          <div class="cr-tour-metric cr-tour-metric--ok">
            <span class="cr-tour-num">0</span>
            <span class="cr-tour-unit">alerts</span>
            <span class="cr-tour-lbl">without signature</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--warn">
            <span class="cr-tour-num">2</span>
            <span class="cr-tour-unit">drafts</span>
            <span class="cr-tour-lbl">pending review</span>
          </div>
        </div>
        <p class="cr-tour-body">The AI generates drafts with visible reasoning. The COEL operator approves or rejects. Approval triggers SMS + email to SINAGERD subscribers. No alert goes out without a human signature.</p>
        <div class="cr-tour-badges">
          <span class="cr-tour-badge cr-tour-badge--ok">AI drafts</span>
          <span class="cr-tour-badge cr-tour-badge--crit">Human signs</span>
          <span class="cr-tour-badge">SMS + Email</span>
        </div>
      `,
      side: "right", align: "center",
    },
  };

  const step6: DriveStep = {
    element: "#driver-nav-ask",
    popover: {
      title: es ? "6 — Copiloto operacional (9 herramientas)" : "6 — Operational Copilot (9 tools)",
      description: es ? `
        <span class="cr-tour-ts">Modo rápido · Sin LLM · ~3 s · SITREP completo en 1 consulta</span>
        <div class="cr-tour-metrics">
          <div class="cr-tour-metric cr-tour-metric--ok">
            <span class="cr-tour-num">9</span>
            <span class="cr-tour-unit">tools</span>
            <span class="cr-tour-lbl">PostGIS en español</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--ok">
            <span class="cr-tour-num">~3s</span>
            <span class="cr-tour-unit">&nbsp;</span>
            <span class="cr-tour-lbl">modo rápido</span>
          </div>
        </div>
        <p class="cr-tour-body">Prueba: <em>«Dame el resumen completo de la situación»</em> — llama 4 herramientas en paralelo (alertas + lluvia + ríos + SAR) y produce un SITREP estructurado sin LLM.</p>
        <div class="cr-tour-badges">
          <span class="cr-tour-badge">sitrep</span>
          <span class="cr-tour-badge">inundaciones</span>
          <span class="cr-tour-badge">nivel de ríos</span>
          <span class="cr-tour-badge">protocolos</span>
        </div>
      ` : `
        <span class="cr-tour-ts">Quick-mode · No LLM · ~3 s · full SITREP in one query</span>
        <div class="cr-tour-metrics">
          <div class="cr-tour-metric cr-tour-metric--ok">
            <span class="cr-tour-num">9</span>
            <span class="cr-tour-unit">tools</span>
            <span class="cr-tour-lbl">PostGIS in Spanish</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--ok">
            <span class="cr-tour-num">~3s</span>
            <span class="cr-tour-unit">&nbsp;</span>
            <span class="cr-tour-lbl">quick-mode</span>
          </div>
        </div>
        <p class="cr-tour-body">Try: <em>"Situation report please"</em> — calls 4 tools in parallel (alerts + rainfall + rivers + SAR) and produces a structured SITREP without the LLM.</p>
        <div class="cr-tour-badges">
          <span class="cr-tour-badge">sitrep</span>
          <span class="cr-tour-badge">floods</span>
          <span class="cr-tour-badge">river levels</span>
          <span class="cr-tour-badge">protocols</span>
        </div>
      `,
      side: "right", align: "center",
    },
  };

  const step7: DriveStep = {
    element: "#driver-layer-social",
    popover: {
      title: es ? "7 — Señales sociales geolocalizadas" : "7 — Geolocated Social Signals",
      description: es ? `
        <span class="cr-tour-ts">Bluesky · Reddit · Telegram · Gemma 3 triaje</span>
        <div class="cr-tour-metrics">
          <div class="cr-tour-metric cr-tour-metric--crit">
            <span class="cr-tour-num">12</span>
            <span class="cr-tour-unit">señales</span>
            <span class="cr-tour-lbl">needs_help activas</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--ok">
            <span class="cr-tour-num">100%</span>
            <span class="cr-tour-unit">&nbsp;</span>
            <span class="cr-tour-lbl">PII anonimizado</span>
          </div>
        </div>
        <p class="cr-tour-body">Vecinos reportando en tiempo real. Gemma 3 clasifica urgencia. Microsoft Presidio anonimiza PII. Los pines en el mapa muestran clusters de solicitudes de ayuda — entrada directa al operador de guardia.</p>
        <div class="cr-tour-badges">
          <span class="cr-tour-badge cr-tour-badge--crit">needs_help</span>
          <span class="cr-tour-badge cr-tour-badge--warn">infraestructura</span>
          <span class="cr-tour-badge">anónimo</span>
        </div>
      ` : `
        <span class="cr-tour-ts">Bluesky · Reddit · Telegram · Gemma 3 triage</span>
        <div class="cr-tour-metrics">
          <div class="cr-tour-metric cr-tour-metric--crit">
            <span class="cr-tour-num">12</span>
            <span class="cr-tour-unit">signals</span>
            <span class="cr-tour-lbl">active needs_help</span>
          </div>
          <div class="cr-tour-metric cr-tour-metric--ok">
            <span class="cr-tour-num">100%</span>
            <span class="cr-tour-unit">&nbsp;</span>
            <span class="cr-tour-lbl">PII anonymized</span>
          </div>
        </div>
        <p class="cr-tour-body">Residents reporting in real time. Gemma 3 classifies urgency. Microsoft Presidio anonymizes PII. Map pins show help-request clusters — direct input to the duty operator.</p>
        <div class="cr-tour-badges">
          <span class="cr-tour-badge cr-tour-badge--crit">needs_help</span>
          <span class="cr-tour-badge cr-tour-badge--warn">infrastructure</span>
          <span class="cr-tour-badge">anonymous</span>
        </div>
      `,
      side: "right", align: "start",
    },
  };

  return [step0, step1, step2, step3, step4, step5, step6, step7];
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

      // Open scenario panel so layer rows exist in DOM
      if (!store.isScenarioPanelOpen) store.toggleScenarioPanel();

      // Set El Niño replay context
      store.setScenario({ isReplayMode: true, replayDate: "2017-03-15", timeWindowHours: 72 });

      // Start with only districts visible
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

      // Camera + layer side effects per step index
      const stepEffects: Record<number, () => void> = {
        0: () => {
          cam("overview", 1000);
        },
        1: () => {
          if (!useUIStore.getState().activeLayers.has("imerg")) useUIStore.getState().toggleLayer("imerg");
          cam("rimac");
        },
        2: () => {
          if (!useUIStore.getState().activeLayers.has("flood")) useUIStore.getState().toggleLayer("flood");
          cam("ate_chosica");
        },
        3: () => {
          if (!useUIStore.getState().activeLayers.has("hazard")) useUIStore.getState().toggleLayer("hazard");
          cam("hazard");
        },
        4: () => {
          useUIStore.getState().setActivePanel("alerts");
          cam("alerts");
        },
        5: () => {
          useUIStore.getState().setActivePanel("proposals");
          cam("proposals");
        },
        6: () => {
          useUIStore.getState().setActivePanel("ask");
          cam("copilot");
        },
        7: () => {
          if (!useUIStore.getState().activeLayers.has("social")) useUIStore.getState().toggleLayer("social");
          useUIStore.getState().setActivePanel("social");
          cam("social");
        },
      };

      driverRef.current = driver({
        showProgress: true,
        progressText: locale === "es" ? "Paso {{current}} de {{total}}" : "Step {{current}} of {{total}}",
        nextBtnText: locale === "es" ? "Siguiente →" : "Next →",
        prevBtnText: locale === "es" ? "← Anterior" : "← Back",
        doneBtnText: locale === "es" ? "Finalizar" : "Finish",
        allowClose: true,
        overlayOpacity: 0.40,
        stagePadding: 10,
        stageRadius: 14,
        steps,
        onHighlighted: (_el, _step) => {
          const idx = driverRef.current?.getActiveIndex?.() ?? -1;
          stepEffects[idx]?.();
        },
        onDestroyStarted: () => {
          driverRef.current?.destroy();
        },
        onDestroyed: () => {
          if (!cancelled) setTutorialOpen(false);
        },
      });

      // Fire initial camera on step 0
      stepEffects[0]?.();
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
