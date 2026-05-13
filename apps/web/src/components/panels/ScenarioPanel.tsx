"use client";

import { ChevronDown, ChevronUp, Target, Loader2 } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useDistrictList } from "@/lib/queries";
import { clsx } from "clsx";

const TIME_WINDOWS = [1, 3, 6, 12, 24, 48, 72] as const;

export function ScenarioPanel() {
  const { scenario, setScenario, isScenarioPanelOpen, toggleScenarioPanel } =
    useUIStore();

  const { data: districts, isLoading } = useDistrictList();

  return (
    <aside
      className={[
        // Mobile: drops from top, full-width
        "fixed top-0 left-0 right-0 rounded-b-xl",
        // Desktop: absolute top-left corner of main
        "sm:absolute sm:top-4 sm:left-4 sm:right-auto sm:w-72 sm:max-w-xs sm:rounded-xl",
        // Common
        "bg-surface-raised border border-slate-700 shadow-xl z-20",
      ].join(" ")}
      aria-label="Panel de escenario"
    >
      {/* Header */}
      <button
        onClick={toggleScenarioPanel}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-panel rounded-t-xl transition-colors"
        aria-expanded={isScenarioPanelOpen}
        aria-controls="scenario-body"
        aria-label="Mostrar/ocultar panel de escenario"
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
        <div id="scenario-body" className="px-4 pb-4 space-y-3 border-t border-slate-700 pt-3">
          {/* District selector */}
          <div>
            <label
              className="block text-xs text-slate-400 mb-1"
              htmlFor="district-select"
            >
              Distrito / Cuenca
              {isLoading && (
                <Loader2 size={10} className="inline ml-1 animate-spin" />
              )}
            </label>
            <select
              id="district-select"
              className="w-full bg-surface-panel border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-costa-500 focus-visible:ring-2 focus-visible:ring-costa-500"
              value={scenario.districtUbigeo ?? ""}
              onChange={(e) => {
                const ubigeo = e.target.value || null;
                const name = ubigeo
                  ? e.target.options[e.target.selectedIndex].text
                  : null;
                setScenario({ districtUbigeo: ubigeo, districtName: name });
              }}
            >
              <option value="">Lima Metropolitana (todos)</option>
              {districts?.map((d) => (
                <option key={d.ubigeo} value={d.ubigeo}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Time window */}
          <fieldset>
            <legend className="text-xs text-slate-300 mb-1">Ventana de tiempo</legend>
            <div className="flex gap-1 flex-wrap">
              {TIME_WINDOWS.map((h) => (
                <button
                  key={h}
                  onClick={() => setScenario({ timeWindowHours: h })}
                  aria-pressed={scenario.timeWindowHours === h}
                  className={clsx(
                    "px-2 py-1 text-xs rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-costa-500 focus-visible:outline-offset-1",
                    scenario.timeWindowHours === h
                      ? "bg-costa-700 text-white"
                      : "bg-surface-panel text-slate-200 hover:text-white"
                  )}
                >
                  {h}h
                </button>
              ))}
            </div>
          </fieldset>

          {/* Layer toggles */}
          <LayerToggles />

          {/* Active scenario summary */}
          {scenario.districtUbigeo && (
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

function LayerToggles() {
  const { activeLayers, toggleLayer } = useUIStore();

  const layers: { id: string; label: string }[] = [
    { id: "districts", label: "Distritos" },
    { id: "imerg", label: "Lluvia IMERG" },
    { id: "flood", label: "Inundación SAR" },
    { id: "huayco", label: "Huayco" },
    { id: "hazard", label: "Peligro Histórico" },
    { id: "infrastructure", label: "Infraestructura" },
  ];

  return (
    <fieldset>
      <legend className="text-xs text-slate-300 mb-1">Capas</legend>
      <div className="space-y-1">
        {layers.map(({ id, label }) => (
          <label
            key={id}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              className="accent-costa-500 w-3 h-3 focus-visible:ring-2 focus-visible:ring-costa-500"
              checked={activeLayers.has(id)}
              onChange={() => toggleLayer(id)}
            />
            <span className="text-xs text-slate-300">{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
