import { create } from "zustand";

type PanelId = "map" | "alerts" | "ask" | "log";

interface Scenario {
  districtId: number | null;
  districtName: string | null;
  watershedId: number | null;
  timeWindowHours: number;
}

interface UIState {
  activePanel: PanelId;
  setActivePanel: (panel: PanelId) => void;

  scenario: Scenario;
  setScenario: (s: Partial<Scenario>) => void;

  activeLayers: Set<string>;
  toggleLayer: (layer: string) => void;

  isScenarioPanelOpen: boolean;
  toggleScenarioPanel: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activePanel: "map",
  setActivePanel: (panel) => set({ activePanel: panel }),

  scenario: {
    districtId: null,
    districtName: null,
    watershedId: null,
    timeWindowHours: 24,
  },
  setScenario: (s) =>
    set((state) => ({ scenario: { ...state.scenario, ...s } })),

  activeLayers: new Set(["districts", "imerg", "infrastructure"]),
  toggleLayer: (layer) =>
    set((state) => {
      const next = new Set(state.activeLayers);
      next.has(layer) ? next.delete(layer) : next.add(layer);
      return { activeLayers: next };
    }),

  isScenarioPanelOpen: true,
  toggleScenarioPanel: () =>
    set((state) => ({ isScenarioPanelOpen: !state.isScenarioPanelOpen })),
}));
