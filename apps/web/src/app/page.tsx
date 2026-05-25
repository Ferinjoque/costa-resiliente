"use client";

import { Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import { useApiHealth } from "@/lib/queries";
import { useUIStore } from "@/store/ui";
import { PanelErrorBoundary } from "@/components/ui/PanelErrorBoundary";
import { LeftRail } from "@/components/ui/LeftRail";
import { ScenarioPanel } from "@/components/panels/ScenarioPanel";
import { AlertsPanel } from "@/components/panels/AlertsPanel";
import { AskPanel } from "@/components/panels/AskPanel";
import { DecisionLogPanel } from "@/components/panels/DecisionLogPanel";
import { DataFreshnessBar } from "@/components/ui/DataFreshnessBar";
import { DataSourcesPanel } from "@/components/panels/DataSourcesPanel";
import { MapLegend } from "@/components/map/MapLegend";
import { OperationalHUD } from "@/components/map/OperationalHUD";
import { LiveTicker } from "@/components/map/LiveTicker";
import { ShareLoader } from "@/components/panels/ShareLoader";
import { FusionCallout } from "@/components/panels/FusionCallout";
import { DistrictDashboardPanel } from "@/components/panels/DistrictDashboardPanel";
import { useAlertStream } from "@/lib/useAlertStream";
import { ToastStack } from "@/components/ui/ToastStack";
import { SocialFeedPanel } from "@/components/panels/SocialFeedPanel";
import { NotificationsPanel } from "@/components/panels/NotificationsPanel";
import { ProposalsPanel } from "@/components/panels/ProposalsPanel";
import { SituationBrief } from "@/components/panels/SituationBrief";
import { LoginPanel } from "@/components/panels/LoginPanel";

// Deferred: keeps initial map paint < 2s
const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-canvas">
      <span className="text-ink-subtle text-sm">Cargando mapa…</span>
    </div>
  ),
});
const TutorialOverlay = dynamic(
  () => import("@/components/panels/TutorialOverlay").then((m) => m.TutorialOverlay),
  { ssr: false },
);
const SharePanel = dynamic(
  () => import("@/components/panels/SharePanel").then((m) => m.SharePanel),
  { ssr: false },
);
const DemoLiveSimulator = dynamic(
  () => import("@/components/DemoLiveSimulator").then((m) => m.DemoLiveSimulator),
  { ssr: false },
);

const FIRST_VISIT_KEY = "cr_visited_v1";

const SHORTCUT_MAP: Record<string, "alerts" | "dashboard" | "ask" | "log" | "map" | "social" | "notifications" | "proposals"> = {
  a: "alerts", á: "alerts",
  d: "dashboard",
  c: "ask",
  l: "log",
  m: "map",
  s: "social",
  n: "notifications",
  p: "proposals",
};

function KeyboardNavigator() {
  const { setActivePanel, setTutorialOpen } = useUIStore();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") { setActivePanel("map"); return; }
      if (e.key === "?") { setTutorialOpen(true); return; }
      const panel = SHORTCUT_MAP[e.key.toLowerCase()];
      if (panel) setActivePanel(panel);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setActivePanel, setTutorialOpen]);
  return null;
}

function AlertStreamMount() {
  useAlertStream();
  return null;
}

function DemoBanner() {
  const { isError, isPending } = useApiHealth();
  const locale = useUIStore((s) => s.locale);
  if (isPending || !isError) return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      className="absolute top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-1 text-xs font-semibold pointer-events-none select-none"
      style={{ background: "oklch(80% 0.17 85 / 0.92)", color: "oklch(25% 0.05 85)" }}
    >
      <span aria-hidden="true">⚠</span>
      {locale === "en"
        ? "API unavailable — displaying cached demo data. Live alerts and sensor readings are not updating."
        : "API no disponible — mostrando datos de demostración. Alertas y sensores no se actualizan en tiempo real."}
    </div>
  );
}

function FirstRunTrigger() {
  const { setTutorialOpen, setScenario } = useUIStore();
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.search.includes("token=") || window.location.search.includes("state=")) return;
    if (localStorage.getItem(FIRST_VISIT_KEY)) return;
    localStorage.setItem(FIRST_VISIT_KEY, "1");
    const t = setTimeout(() => {
      setScenario({ isReplayMode: true, replayDate: "2017-03-15" });
      setTutorialOpen(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [setTutorialOpen, setScenario]);
  return null;
}

export default function Home() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-surface focus:text-ink focus:px-4 focus:py-2 focus:rounded-xl focus:text-sm focus:font-medium focus:shadow-panel focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Light sidebar */}
      <LeftRail />

      {/* Map canvas area */}
      <main
        id="main-content"
        className="relative flex-1 overflow-hidden pb-14 sm:pb-0 bg-canvas"
        aria-label="Mapa y paneles operacionales"
      >
        <DemoBanner />
        {/* Fullscreen map */}
        <div className="absolute inset-0 z-0">
          <Suspense fallback={
            <div className="flex h-full w-full items-center justify-center bg-canvas">
              <span className="text-ink-subtle text-sm">Cargando mapa…</span>
            </div>
          }>
            <MapView />
          </Suspense>
          {/* Map overlays — all solid surfaces, no blur */}
          <MapLegend />
          <OperationalHUD />
          <LiveTicker />
          <DataFreshnessBar />
        </div>

        {/* Panels — solid surface drawers, each isolated by an error boundary */}
        <PanelErrorBoundary label="Escenario"><ScenarioPanel /></PanelErrorBoundary>
        <PanelErrorBoundary label="Alertas"><AlertsPanel /></PanelErrorBoundary>
        <PanelErrorBoundary label="Copiloto"><AskPanel /></PanelErrorBoundary>
        <PanelErrorBoundary label="Bitácora"><DecisionLogPanel /></PanelErrorBoundary>
        <PanelErrorBoundary label="Fuentes"><DataSourcesPanel /></PanelErrorBoundary>
        <PanelErrorBoundary label="Compartir"><SharePanel /></PanelErrorBoundary>
        <PanelErrorBoundary label="Señales Sociales"><SocialFeedPanel /></PanelErrorBoundary>
        <PanelErrorBoundary label="Notificaciones"><NotificationsPanel /></PanelErrorBoundary>
        <PanelErrorBoundary label="Propuestas"><ProposalsPanel /></PanelErrorBoundary>
        <PanelErrorBoundary label="Dashboard Distrital"><DistrictDashboardPanel /></PanelErrorBoundary>
        <FusionCallout />
        <SituationBrief />
        <TutorialOverlay />
        <Suspense fallback={null}>
          <ShareLoader />
        </Suspense>
        <AlertStreamMount />
        <FirstRunTrigger />
        <KeyboardNavigator />
        <DemoLiveSimulator />
        <ToastStack />
        <LoginPanel />
      </main>
    </div>
  );
}
