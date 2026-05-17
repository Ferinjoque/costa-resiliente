"use client";

import {
  ChevronDown, ChevronUp, Target, Loader2, PlayCircle, X,
} from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useDistrictList } from "@/lib/queries";
import { clsx } from "clsx";
import {
  Panel, PanelHeader, PanelTitle, SectionLabel, Button,
  PillSegmentGroup, PillSegment, Toggle, Divider,
} from "@/components/ui/primitives";
import type { Locale } from "@/store/ui";

const TIME_WINDOWS = [1, 3, 6, 12, 24, 48, 72] as const;
const REPLAY_DEFAULT = "2017-03-15";
const REPLAY_MIN = "2017-01-31";
const REPLAY_MAX = "2017-04-30";

const LAYERS: { id: string; label: { es: string; en: string } }[] = [
  { id: "districts",      label: { es: "Distritos",          en: "Districts"        } },
  { id: "imerg",          label: { es: "Lluvia IMERG",       en: "IMERG Rainfall"   } },
  { id: "flood",          label: { es: "Inundación SAR",     en: "SAR Flood"        } },
  { id: "huayco",         label: { es: "Huayco",             en: "Huayco"           } },
  { id: "hazard",         label: { es: "Peligro histórico",  en: "Historical hazard"} },
  { id: "infrastructure", label: { es: "Infraestructura",    en: "Infrastructure"   } },
  { id: "social",         label: { es: "Señales sociales",   en: "Social signals"   } },
  { id: "stations",       label: { es: "Estaciones ANA",     en: "ANA Stations"     } },
];

const L = (locale: Locale, es: string, en: string) => locale === "es" ? es : en;

export function ScenarioPanel() {
  const {
    scenario, setScenario, isScenarioPanelOpen, toggleScenarioPanel,
    setTutorialOpen, isShareMode, locale,
  } = useUIStore();
  const { data: districts, isLoading } = useDistrictList();

  return (
    <Panel
      className={clsx(
        "fixed top-0 left-0 right-0",
        "sm:absolute sm:top-4 sm:left-4 sm:right-auto sm:w-[260px]",
        "z-20",
      )}
    >
      {/* Header */}
      <button
        onClick={toggleScenarioPanel}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors"
        aria-expanded={isScenarioPanelOpen}
        aria-label={L(locale, "Mostrar/ocultar escenario", "Toggle scenario")}
      >
        <div className="flex items-center gap-2">
          <Target size={14} className="text-ink-muted" aria-hidden="true" />
          <PanelTitle>{L(locale, "Escenario", "Scenario")}</PanelTitle>
          {scenario.isReplayMode && (
            <span className="text-2xs font-semibold text-warn bg-warn-soft px-1.5 py-0.5 rounded-full">
              El Niño 2017
            </span>
          )}
        </div>
        {isScenarioPanelOpen
          ? <ChevronUp size={14} className="text-ink-subtle" />
          : <ChevronDown size={14} className="text-ink-subtle" />}
      </button>

      {isScenarioPanelOpen && (
        <div className="border-t border-border-subtle">
          {isShareMode && (
            <div className="mx-4 mt-3 px-3 py-2 bg-warn-soft border border-warn/30 rounded-xl text-xs text-warn-muted flex items-center gap-2">
              <span>🔒</span>
              <span>{L(locale, "Vista de solo lectura", "Read-only view")}</span>
            </div>
          )}

          <div className="px-4 py-3 space-y-4">
            {/* El Niño replay toggle */}
            <div className="flex items-center justify-between gap-2">
              <Button
                variant={scenario.isReplayMode ? "primary" : "secondary"}
                size="xs"
                onClick={() => {
                  if (scenario.isReplayMode) {
                    setScenario({ isReplayMode: false, replayDate: null });
                  } else {
                    setScenario({ isReplayMode: true, replayDate: REPLAY_DEFAULT });
                    setTutorialOpen(true);
                  }
                }}
              >
                {scenario.isReplayMode
                  ? <><X size={12} /> {L(locale, "Salir", "Exit replay")}</>
                  : <><PlayCircle size={12} /> El Niño 2017</>}
              </Button>
              {!scenario.isReplayMode && (
                <button
                  onClick={() => setTutorialOpen(true)}
                  className="text-xs text-accent hover:underline"
                >
                  Tutorial →
                </button>
              )}
            </div>

            {/* Replay date input */}
            {scenario.isReplayMode && (
              <div>
                <SectionLabel className="mb-1.5">
                  {L(locale, "Fecha del replay", "Replay date")}
                </SectionLabel>
                <input
                  type="date"
                  min={REPLAY_MIN}
                  max={REPLAY_MAX}
                  value={scenario.replayDate ?? REPLAY_DEFAULT}
                  onChange={(e) => setScenario({ replayDate: e.target.value })}
                  className="w-full bg-surface-sunken border border-border text-ink text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-accent font-mono"
                />
                <p className="text-2xs text-ink-subtle mt-1">
                  {L(locale, "El Niño Costero · ene–abr 2017", "Coastal El Niño · Jan–Apr 2017")}
                </p>
              </div>
            )}

            {/* District selector */}
            <div>
              <SectionLabel className="mb-1.5">
                {L(locale, "Distrito / Cuenca", "District / Watershed")}
                {isLoading && <Loader2 size={10} className="inline ml-1 animate-spin" />}
              </SectionLabel>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-surface-sunken border border-border text-ink text-sm rounded-xl px-3 py-2 pr-8 focus:outline-none focus:border-accent cursor-pointer"
                  value={scenario.districtUbigeo ?? ""}
                  onChange={(e) => {
                    const ubigeo = e.target.value || null;
                    const name = ubigeo ? e.target.options[e.target.selectedIndex].text : null;
                    setScenario({ districtUbigeo: ubigeo, districtName: name });
                  }}
                >
                  <option value="">{L(locale, "Lima Metropolitana", "Lima Metropolitan")}</option>
                  {districts?.map((d) => (
                    <option key={d.ubigeo} value={d.ubigeo}>{d.name}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none" />
              </div>
            </div>

            {/* Time window */}
            {!scenario.isReplayMode && (
              <div>
                <SectionLabel className="mb-1.5">
                  {L(locale, "Ventana de tiempo", "Time window")}
                </SectionLabel>
                <PillSegmentGroup>
                  {TIME_WINDOWS.map((h) => (
                    <PillSegment
                      key={h}
                      label={`${h}h`}
                      active={scenario.timeWindowHours === h}
                      onClick={() => setScenario({ timeWindowHours: h })}
                    />
                  ))}
                </PillSegmentGroup>
              </div>
            )}

            <Divider />

            {/* Layer toggles */}
            <LayerToggles locale={locale} />
          </div>
        </div>
      )}
    </Panel>
  );
}

function LayerToggles({ locale }: { locale: Locale }) {
  const { activeLayers, toggleLayer, is3DMode, set3DMode } = useUIStore();
  return (
    <div>
      <SectionLabel className="mb-2">
        {locale === "es" ? "Capas del mapa" : "Map layers"}
      </SectionLabel>
      <div className="space-y-2">
        {LAYERS.map(({ id, label }) => (
          <div key={id} className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink flex-1">{label[locale]}</span>
            <Toggle
              checked={activeLayers.has(id)}
              onChange={() => toggleLayer(id)}
            />
          </div>
        ))}
        <Divider className="my-1" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink flex-1">{locale === "es" ? "Vista 3D" : "3D view"}</span>
          <Toggle
            checked={is3DMode}
            onChange={() => set3DMode(!is3DMode)}
          />
        </div>
      </div>
    </div>
  );
}
