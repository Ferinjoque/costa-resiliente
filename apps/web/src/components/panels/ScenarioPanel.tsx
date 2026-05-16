"use client";

import { ChevronDown, ChevronUp, Target, Loader2, PlayCircle, XCircle, Lock } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useDistrictList } from "@/lib/queries";
import { clsx } from "clsx";

const TIME_WINDOWS = [1, 3, 6, 12, 24, 48, 72] as const;

// 2017 El Niño Costero: Jan 31 – Apr 30 2017
const REPLAY_MIN = "2017-01-31";
const REPLAY_MAX = "2017-04-30";
const REPLAY_DEFAULT = "2017-03-15";

export function ScenarioPanel() {
  const {
    scenario,
    setScenario,
    isScenarioPanelOpen,
    toggleScenarioPanel,
    setTutorialOpen,
    isShareMode,
  } = useUIStore();

  const { data: districts, isLoading } = useDistrictList();

  return (
    <aside
      className={[
        "fixed top-0 left-0 right-0 rounded-b-xl",
        "sm:absolute sm:top-4 sm:left-4 sm:right-auto sm:w-72 sm:max-w-xs sm:rounded-xl",
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
          {scenario.isReplayMode && (
            <span className="text-[10px] bg-amber-600 text-white px-1.5 py-0.5 rounded-full font-normal">
              REPLAY 2017
            </span>
          )}
        </div>
        {isScenarioPanelOpen ? (
          <ChevronUp size={14} className="text-slate-400" />
        ) : (
          <ChevronDown size={14} className="text-slate-400" />
        )}
      </button>

      {isScenarioPanelOpen && (
        <div id="scenario-body" className="px-4 pb-4 space-y-3 border-t border-slate-700 pt-3">
          {isShareMode && (
            <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-900/30 border border-amber-700/40 rounded-lg px-3 py-2">
              <Lock size={12} aria-hidden="true" />
              <span>Vista de solo lectura</span>
            </div>
          )}

          {/* El Niño replay toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                if (scenario.isReplayMode) {
                  setScenario({ isReplayMode: false, replayDate: null });
                } else {
                  setScenario({ isReplayMode: true, replayDate: REPLAY_DEFAULT });
                  setTutorialOpen(true);
                }
              }}
              className={clsx(
                "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors font-medium",
                scenario.isReplayMode
                  ? "bg-amber-600 text-white hover:bg-amber-700"
                  : "bg-surface-panel text-amber-400 border border-amber-600/50 hover:bg-amber-600/10"
              )}
              aria-pressed={scenario.isReplayMode}
            >
              {scenario.isReplayMode ? (
                <><XCircle size={13} /> Salir del replay</>
              ) : (
                <><PlayCircle size={13} /> El Niño 2017</>
              )}
            </button>
            {!scenario.isReplayMode && (
              <button
                onClick={() => setTutorialOpen(true)}
                className="text-xs text-slate-400 hover:text-costa-400 underline underline-offset-2 transition-colors"
                aria-label="Ver tutorial interactivo"
              >
                Tutorial
              </button>
            )}
          </div>

          {/* Replay date slider — only visible in replay mode */}
          {scenario.isReplayMode && (
            <div>
              <label className="block text-xs text-amber-300 mb-1" htmlFor="replay-slider">
                Fecha del replay
              </label>
              <input
                id="replay-slider"
                type="date"
                min={REPLAY_MIN}
                max={REPLAY_MAX}
                value={scenario.replayDate ?? REPLAY_DEFAULT}
                onChange={(e) => setScenario({ replayDate: e.target.value })}
                className="w-full bg-surface-panel border border-amber-600/50 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500"
                aria-label="Seleccionar fecha del replay El Niño 2017"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                El Niño Costero: ene–abr 2017
              </p>
            </div>
          )}

          {/* District selector */}
          <div>
            <label className="block text-xs text-slate-400 mb-1" htmlFor="district-select">
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
          {!scenario.isReplayMode && (
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
          )}

          {/* Layer toggles */}
          <LayerToggles />

          {/* Active scenario summary */}
          {scenario.districtUbigeo && !scenario.isReplayMode && (
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
  const { activeLayers, toggleLayer, is3DMode, set3DMode } = useUIStore();

  const layers: { id: string; label: string }[] = [
    { id: "districts", label: "Distritos" },
    { id: "imerg", label: "Lluvia IMERG" },
    { id: "flood", label: "Inundación SAR" },
    { id: "huayco", label: "Huayco" },
    { id: "hazard", label: "Peligro Histórico" },
    { id: "infrastructure", label: "Infraestructura" },
    { id: "social", label: "Señales sociales" },
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
              aria-label={`Capa ${label}`}
            />
            <span className="text-xs text-slate-300">{label}</span>
          </label>
        ))}
        {/* 3D flood extrusion toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none pt-1 mt-1 border-t border-slate-700">
          <input
            type="checkbox"
            className="accent-costa-500 w-3 h-3 focus-visible:ring-2 focus-visible:ring-costa-500"
            checked={is3DMode}
            onChange={() => set3DMode(!is3DMode)}
            aria-label="Vista 3D de inundaciones"
          />
          <span className="text-xs text-slate-300">Vista 3D</span>
        </label>
      </div>
    </fieldset>
  );
}
