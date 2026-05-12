"use client";

import { ChevronDown, ChevronUp, Target } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { clsx } from "clsx";

const TIME_WINDOWS = [1, 3, 6, 12, 24, 48, 72] as const;

export function ScenarioPanel() {
  const { scenario, setScenario, isScenarioPanelOpen, toggleScenarioPanel } =
    useUIStore();

  return (
    <aside
      className="absolute top-4 left-4 w-72 bg-surface-raised border border-slate-700 rounded-xl shadow-xl z-20"
      aria-label="Panel de escenario"
    >
      {/* Header */}
      <button
        onClick={toggleScenarioPanel}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-panel rounded-t-xl transition-colors"
        aria-expanded={isScenarioPanelOpen}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Target size={15} className="text-costa-500" />
          Escenario
        </div>
        {isScenarioPanelOpen ? (
          <ChevronUp size={14} className="text-slate-400" />
        ) : (
          <ChevronDown size={14} className="text-slate-400" />
        )}
      </button>

      {isScenarioPanelOpen && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700 pt-3">
          {/* District selector */}
          <div>
            <label className="block text-xs text-slate-400 mb-1" htmlFor="district-select">
              Distrito / Cuenca
            </label>
            <select
              id="district-select"
              className="w-full bg-surface-panel border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-costa-500"
              value={scenario.districtId ?? ""}
              onChange={(e) =>
                setScenario({
                  districtId: e.target.value ? Number(e.target.value) : null,
                  districtName: e.target.options[e.target.selectedIndex].text,
                })
              }
            >
              <option value="">Lima Metropolitana (todos)</option>
              {/* TODO Sprint 2: populate from /api/v1/districts */}
            </select>
          </div>

          {/* Time window */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Ventana de tiempo
            </label>
            <div className="flex gap-1 flex-wrap">
              {TIME_WINDOWS.map((h) => (
                <button
                  key={h}
                  onClick={() => setScenario({ timeWindowHours: h })}
                  className={clsx(
                    "px-2 py-1 text-xs rounded-md transition-colors",
                    scenario.timeWindowHours === h
                      ? "bg-costa-700 text-white"
                      : "bg-surface-panel text-slate-400 hover:text-white"
                  )}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>

          {/* Active scenario summary */}
          {scenario.districtId && (
            <div className="bg-costa-900/30 border border-costa-700/50 rounded-lg px-3 py-2">
              <p className="text-xs text-costa-300">
                {scenario.districtName} · últimas {scenario.timeWindowHours}h
              </p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
