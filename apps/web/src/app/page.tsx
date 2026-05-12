"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { LeftRail } from "@/components/ui/LeftRail";
import { ScenarioPanel } from "@/components/panels/ScenarioPanel";
import { AlertsPanel } from "@/components/panels/AlertsPanel";
import { AskPanel } from "@/components/panels/AskPanel";
import { DecisionLogPanel } from "@/components/panels/DecisionLogPanel";

// MapView must be client-only (MapLibre GL uses window APIs)
const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 bg-surface-base flex items-center justify-center">
      <span className="text-slate-500 text-sm">Cargando mapa…</span>
    </div>
  ),
});

export default function Home() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Left navigation rail */}
      <LeftRail />

      {/* Main content area */}
      <main className="flex flex-1 overflow-hidden relative">
        {/* Map — always visible, fills space */}
        <Suspense>
          <MapView />
        </Suspense>

        {/* Floating panels rendered on top of map */}
        <ScenarioPanel />
        <AlertsPanel />
        <AskPanel />
        <DecisionLogPanel />
      </main>
    </div>
  );
}
