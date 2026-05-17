"use client";

import {
  ChevronDown, ChevronUp, Target, Loader2, X,
} from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useDistrictList, useProvinces } from "@/lib/queries";
import { clsx } from "clsx";
import {
  Panel, PanelTitle, SectionLabel,
  PillSegmentGroup, PillSegment, Toggle, Divider,
} from "@/components/ui/primitives";
import type { Locale } from "@/store/ui";

const TIME_WINDOWS = [1, 3, 6, 12, 24, 48, 72] as const;

const LAYERS: { id: string; label: { es: string; en: string }; hint: { es: string; en: string } }[] = [
  { id: "districts",      label: { es: "Distritos",          en: "Districts"         }, hint: { es: "Límites y nombre de los 43 distritos",      en: "43 district boundaries and names"         } },
  { id: "imerg",          label: { es: "Lluvia IMERG",       en: "IMERG Rainfall"    }, hint: { es: "Acumulación NASA (color por intensidad)",   en: "NASA accumulation (colour by intensity)"  } },
  { id: "flood",          label: { es: "Inundación SAR",     en: "SAR Flood"         }, hint: { es: "Polígonos Sentinel-1 de áreas inundadas",   en: "Sentinel-1 polygons of flooded areas"     } },
  { id: "huayco",         label: { es: "Huayco",             en: "Huayco"            }, hint: { es: "Puntos por quebrada (tamaño = probabilidad)", en: "Dots per quebrada (size = probability)"  } },
  { id: "hazard",         label: { es: "Peligro histórico",  en: "Historical hazard" }, hint: { es: "Zonas SINPAD 2003–2020 por densidad",       en: "SINPAD 2003–2020 zones by density"        } },
  { id: "infrastructure", label: { es: "Infraestructura",    en: "Infrastructure"    }, hint: { es: "Hospitales, colegios, puentes (OSM)",       en: "Hospitals, schools, bridges (OSM)"        } },
  { id: "social",         label: { es: "Señales sociales",   en: "Social signals"    }, hint: { es: "Pines Bluesky/Reddit triados por IA",      en: "AI-triaged Bluesky/Reddit pins"           } },
  { id: "stations",       label: { es: "Estaciones ANA",     en: "ANA Stations"      }, hint: { es: "Nivel e caudal de ríos en tiempo real",    en: "Real-time river level and flow"           } },
];

const L = (locale: Locale, es: string, en: string) => locale === "es" ? es : en;

export function ScenarioPanel() {
  const {
    scenario, setScenario, isScenarioPanelOpen, toggleScenarioPanel,
    isShareMode, locale,
  } = useUIStore();
  const { data: provinces } = useProvinces();
  const { data: districts, isLoading } = useDistrictList(
    scenario.provinceFilter || undefined
  );

  return (
    <Panel
      id="driver-scenario-panel"
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                setScenario({ isReplayMode: false, replayDate: null });
              }}
              className="flex items-center gap-1 text-2xs font-semibold text-warn bg-warn-soft px-1.5 py-0.5 rounded-full hover:bg-warn/20 transition-colors"
              aria-label={L(locale, "Salir del replay El Niño 2017", "Exit El Niño 2017 replay")}
            >
              El Niño 2017
              <X size={9} strokeWidth={2.5} />
            </button>
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
            {/* Province / scope selector */}
            <div>
              <SectionLabel className="mb-1.5">
                {L(locale, "Ámbito geográfico", "Geographic scope")}
              </SectionLabel>
              <div className="relative">
                <select
                  aria-label={L(locale, "Seleccionar provincia", "Select province")}
                  className="w-full appearance-none bg-surface-sunken border border-border text-ink text-sm rounded-xl px-3 py-2 pr-8 focus:outline-none focus:border-accent cursor-pointer"
                  value={scenario.provinceFilter}
                  onChange={(e) => {
                    setScenario({ provinceFilter: e.target.value, districtUbigeo: null, districtName: null });
                  }}
                >
                  <option value="Lima">
                    {L(locale, "Lima Metropolitana (43 dist.)", "Lima Metropolitan (43 dist.)")}
                  </option>
                  <option value="">
                    {L(locale, "Lima Región — todas (159 dist.)", "Lima Region — all (159 dist.)")}
                  </option>
                  {provinces?.provinces
                    .filter((p) => p.province !== "Lima" && p.province !== "Lima Región")
                    .map((p) => (
                      <option key={p.province} value={p.province}>
                        {p.province} ({p.district_count} dist.)
                      </option>
                    ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none" />
              </div>
            </div>

            {/* District selector */}
            <div>
              <SectionLabel className="mb-1.5">
                {L(locale, "Distrito / Cuenca", "District / Watershed")}
                {isLoading && <Loader2 size={10} className="inline ml-1 animate-spin" />}
              </SectionLabel>
              <div className="relative">
                <select
                  aria-label={L(locale, "Seleccionar distrito o cuenca", "Select district or watershed")}
                  className="w-full appearance-none bg-surface-sunken border border-border text-ink text-sm rounded-xl px-3 py-2 pr-8 focus:outline-none focus:border-accent cursor-pointer"
                  value={scenario.districtUbigeo ?? ""}
                  onChange={(e) => {
                    const ubigeo = e.target.value || null;
                    const name = ubigeo ? e.target.options[e.target.selectedIndex].text : null;
                    setScenario({ districtUbigeo: ubigeo, districtName: name });
                  }}
                >
                  <option value="">
                    {scenario.provinceFilter === "Lima"
                      ? L(locale, "Todos los distritos (Metro)", "All districts (Metro)")
                      : L(locale, "Todos los distritos", "All districts")}
                  </option>
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
                <p className="text-2xs text-ink-subtle mt-1.5">
                  {L(
                    locale,
                    "Acumulación de lluvia IMERG visible en el mapa",
                    "IMERG rainfall accumulation shown on map",
                  )}
                </p>
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
        {LAYERS.map(({ id, label, hint }) => (
          <div key={id} id={`driver-layer-${id}`} className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <span className="text-sm text-ink">{label[locale]}</span>
              <p className="text-2xs text-ink-subtle leading-tight mt-0.5">{hint[locale]}</p>
            </div>
            <Toggle
              checked={activeLayers.has(id)}
              onChange={() => toggleLayer(id)}
              ariaLabel={label[locale]}
            />
          </div>
        ))}
        <Divider className="my-1" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink flex-1">{locale === "es" ? "Vista 3D" : "3D view"}</span>
          <Toggle
            checked={is3DMode}
            onChange={() => set3DMode(!is3DMode)}
            ariaLabel={locale === "es" ? "Vista 3D" : "3D view"}
          />
        </div>
      </div>
    </div>
  );
}
