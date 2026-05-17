"use client";

import { Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import { LeftRail } from "@/components/ui/LeftRail";
import { ScenarioPanel } from "@/components/panels/ScenarioPanel";
import { AlertsPanel } from "@/components/panels/AlertsPanel";
import { AskPanel } from "@/components/panels/AskPanel";
import { DecisionLogPanel } from "@/components/panels/DecisionLogPanel";
import { DataFreshnessBar } from "@/components/ui/DataFreshnessBar";
import { DataSourcesPanel } from "@/components/panels/DataSourcesPanel";
import { TutorialOverlay } from "@/components/panels/TutorialOverlay";
import { MapLegend } from "@/components/map/MapLegend";
import { OperationalHUD } from "@/components/map/OperationalHUD";
import { SharePanel } from "@/components/panels/SharePanel";
import { ShareLoader } from "@/components/panels/ShareLoader";
import { FusionCallout } from "@/components/panels/FusionCallout";
import { DistrictDashboardPanel } from "@/components/panels/DistrictDashboardPanel";
import { useUIStore } from "@/store/ui";

// MapView must be client-only (MapLibre GL uses window APIs)
const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 bg-surface-base flex items-center justify-center">
      <span className="text-slate-400 text-sm">Cargando mapa…</span>
    </div>
  ),
});

const FIRST_VISIT_KEY = "cr_visited_v1";

function FirstRunTrigger() {
  const { setTutorialOpen, setScenario } = useUIStore();

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Don't auto-open if it's a shared scenario link
    if (window.location.search.includes("token=")) return;
    if (window.location.search.includes("state=")) return;
    if (localStorage.getItem(FIRST_VISIT_KEY)) return;
    localStorage.setItem(FIRST_VISIT_KEY, "1");
    // Delay slightly so map finishes rendering
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
      {/* Left navigation rail */}
      <LeftRail />

      {/* Main content area — pb-14 reserves space for mobile bottom nav */}
      <main
        id="main-content"
        className="relative flex-1 overflow-hidden pb-14 sm:pb-0"
        aria-label="Mapa y paneles operacionales"
      >
        {/* Map layer — sits at z-0, fills main */}
        <div className="absolute inset-0 z-0">
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-surface-base">
                <span className="text-slate-400 text-sm">Cargando mapa…</span>
              </div>
            }
          >
            <MapView />
          </Suspense>
          <MapLegend />
          <OperationalHUD />
        </div>

        {/* UI layer — panels and controls always above the map */}
        <ScenarioPanel />
        <AlertsPanel />
        <AskPanel />
        <DecisionLogPanel />
        <DataSourcesPanel />
        <SharePanel />
        <DistrictDashboardPanel />
        <FusionCallout />
        <DataFreshnessBar />
        <TutorialOverlay />
        <ShareLoader />
        <FirstRunTrigger />
      </main>
    </div>
  );
}
