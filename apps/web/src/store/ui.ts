import { create } from "zustand";

type PanelId = "map" | "alerts" | "ask" | "log" | "sources" | "share" | "dashboard" | "social";

export type Locale = "es" | "en";

export interface LiveToast {
  id: string;
  source: string;
  label: string;
  district: string;
  at: number;
}

interface Scenario {
  districtUbigeo: string | null;
  districtName: string | null;
  watershedId: number | null;
  timeWindowHours: number;
  isReplayMode: boolean;
  replayDate: string | null; // ISO date string "2017-03-15"
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

  isTutorialOpen: boolean;
  setTutorialOpen: (open: boolean) => void;

  isShareMode: boolean;
  setShareMode: (on: boolean) => void;

  is3DMode: boolean;
  set3DMode: (on: boolean) => void;

  locale: Locale;
  setLocale: (locale: Locale) => void;

  toasts: LiveToast[];
  addToast: (toast: Omit<LiveToast, "id" | "at">) => void;
  removeToast: (id: string) => void;

  flyToPoint: [number, number] | null;
  setFlyToPoint: (pt: [number, number] | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activePanel: "map",
  setActivePanel: (panel) => set({ activePanel: panel }),

  scenario: {
    districtUbigeo: null,
    districtName: null,
    watershedId: null,
    timeWindowHours: 24,
    isReplayMode: false,
    replayDate: null,
  },
  setScenario: (s) =>
    set((state) => ({ scenario: { ...state.scenario, ...s } })),

  activeLayers: new Set(["districts", "imerg", "flood", "huayco", "hazard", "social", "infrastructure", "stations"]),
  toggleLayer: (layer) =>
    set((state) => {
      const next = new Set(state.activeLayers);
      next.has(layer) ? next.delete(layer) : next.add(layer);
      return { activeLayers: next };
    }),

  isScenarioPanelOpen: true,
  toggleScenarioPanel: () =>
    set((state) => ({ isScenarioPanelOpen: !state.isScenarioPanelOpen })),

  isTutorialOpen: false,
  setTutorialOpen: (open) => set({ isTutorialOpen: open }),

  isShareMode: false,
  setShareMode: (on) => set({ isShareMode: on }),

  is3DMode: false,
  set3DMode: (on) => set({ is3DMode: on }),

  locale: "es",
  setLocale: (locale) => set({ locale }),

  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts.slice(-3),
        { ...toast, id: `${Date.now()}-${Math.random()}`, at: Date.now() },
      ],
    })),
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  flyToPoint: null,
  setFlyToPoint: (pt) => set({ flyToPoint: pt }),
}));
