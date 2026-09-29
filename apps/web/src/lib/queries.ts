/**
 * TanStack Query hooks for all API data.
 * Stale times are tuned to each source's update frequency:
 *  - districts: static → 1 hour
 *  - IMERG: 30-min granules → 2 min
 *  - flood / huayco: ~6d SAR cadence → 10 min
 *  - infrastructure: OSM, rarely changes → 1 hour
 *  - alerts: operator-facing, low latency → 30 s
 */

import { useAuthStore } from "@/store/auth";
import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  fetchDistricts,
  fetchDistrictList,
  fetchProvinces,
  fetchScraperHealth,
  type ScraperHealth,
  fetchImerg,
  fetchFlood,
  fetchHuayco,
  fetchInfrastructure,
  fetchHazard,
  fetchCenepredRisk,
  fetchHuaycoModel,
  fetchHuaycoModelCard,
  type CenepredHazard,
  type CenepredRiskCollection,
  fetchAlerts,
  fetchDecisionLog,
  fetchFloodExposure,
  fetchSocialSignals,
  fetchDistrictRiskSummary,
  fetchDistrictDashboard,
  fetchHealth,
  fetchStations,
  fetchWeather,
  fetchRainForecast,
  fetchImergObserved,
  fetchShelters,
  type ShelterCollection,
  type DistrictCollection,
  type DistrictListItem,
  type ImergCollection,
  type FloodCollection,
  type HuaycoCollection,
  type InfraCollection,
  type HazardCollection,
  type Alert,
  type DecisionLogEntry,
  type FloodExposure,
  type SocialSignalCollection,
  type DistrictFusion,
  type DistrictRiskSummary,
  type DistrictDashboard,
  type StationCollection,
  fetchDistrictFusion,
  fetchNotificationSubscribers,
  fetchNotificationDeliveries,
  type NotificationSubscriber,
  type NotificationDelivery,
  fetchPendingProposals,
  type AlertProposal,
} from "./api";
import {
  DEMO_ALERTS,
  DEMO_EXPOSURE,
  DEMO_DECISION_LOG,
  DEMO_DISTRICTS,
  DEMO_SOCIAL_SIGNALS,
  DEMO_DISTRICT_RISK_SUMMARY,
  DEMO_IMERG,
  DEMO_FLOOD,
  DEMO_HUAYCO,
  DEMO_INFRASTRUCTURE,
  DEMO_HAZARD,
  DEMO_STATIONS,
} from "./demoData";

/**
 * Offline demo mode: the frontend running with no backend at all (a static
 * preview). Off by default. Set NEXT_PUBLIC_OFFLINE_DEMO=1 to enable.
 */
const OFFLINE_DEMO = process.env.NEXT_PUBLIC_OFFLINE_DEMO === "1";

/**
 * Real data always wins, and that includes an empty result. The console used
 * to substitute demo data whenever the API answered with nothing, so a quiet
 * day showed invented flood polygons and a severity filter with no matches
 * listed fabricated alerts. In an emergency console that is the worst failure
 * mode there is. Demo data now appears only in offline demo mode, and only
 * when the API cannot be reached.
 */
async function realOrOfflineDemo<T>(fetcher: () => Promise<T>, demo: T): Promise<T> {
  try {
    return await fetcher();
  } catch (err) {
    if (OFFLINE_DEMO) return demo;
    throw err;
  }
}

const MIN = 1000 * 60;

export function useDistricts(
  opts?: Partial<UseQueryOptions<DistrictCollection>>
): UseQueryResult<DistrictCollection> {
  return useQuery({
    queryKey: ["districts", "geojson"],
    queryFn: async () => {
      return realOrOfflineDemo(() => fetchDistricts(), DEMO_DISTRICTS);
    },
    staleTime: 60 * MIN,
    ...opts,
  });
}

export function useDistrictList(
  province?: string,
  opts?: Partial<UseQueryOptions<DistrictListItem[]>>
): UseQueryResult<DistrictListItem[]> {
  return useQuery({
    queryKey: ["districts", "list", province ?? "all"],
    queryFn: async () => {
      return realOrOfflineDemo(() => fetchDistrictList(province), DEMO_DISTRICTS.features.map((f) => ({
          ubigeo: f.properties.ubigeo,
          name: f.properties.name,
        })));
    },
    staleTime: 60 * MIN,
    ...opts,
  });
}

export function useProvinces(): UseQueryResult<{ provinces: Array<{province: string; region: string; district_count: number}>; default_province: string }> {
  return useQuery({
    queryKey: ["provinces"],
    queryFn: async () => {
      return realOrOfflineDemo(fetchProvinces, {
          provinces: [
            { province: "Lima", region: "Lima", district_count: 41 },
            { province: "Lima Región", region: "Lima", district_count: 118 },
          ],
          default_province: "Lima",
        });
    },
    staleTime: 60 * MIN,
  });
}

export function useImerg(
  hours = 24,
  replayDate?: string | null,
  opts?: Partial<UseQueryOptions<ImergCollection>>
): UseQueryResult<ImergCollection> {
  return useQuery({
    queryKey: ["imerg", hours, replayDate ?? null],
    queryFn: async () => {
      return realOrOfflineDemo(() => fetchImerg(hours, replayDate), DEMO_IMERG);
    },
    staleTime: replayDate ? 60 * MIN : 2 * MIN,
    refetchInterval: replayDate ? false : 2 * MIN,
    ...opts,
  });
}

export function useFlood(
  replayDate?: string | null,
  opts?: Partial<UseQueryOptions<FloodCollection>>
): UseQueryResult<FloodCollection> {
  return useQuery({
    queryKey: ["flood", replayDate ?? null],
    queryFn: async () => {
      return realOrOfflineDemo(() => fetchFlood(replayDate), DEMO_FLOOD);
    },
    staleTime: replayDate ? 60 * MIN : 10 * MIN,
    refetchInterval: replayDate ? false : 10 * MIN,
    placeholderData: (prev) => prev,
    ...opts,
  });
}

export function useHuayco(
  opts?: Partial<UseQueryOptions<HuaycoCollection>>
): UseQueryResult<HuaycoCollection> {
  return useQuery({
    queryKey: ["huayco"],
    queryFn: async () => {
      return realOrOfflineDemo(() => fetchHuayco(), DEMO_HUAYCO);
    },
    staleTime: 10 * MIN,
    refetchInterval: 10 * MIN,
    placeholderData: (prev) => prev,
    ...opts,
  });
}

export function useInfrastructure(
  type?: string,
  opts?: Partial<UseQueryOptions<InfraCollection>>
): UseQueryResult<InfraCollection> {
  return useQuery({
    queryKey: ["infrastructure", type],
    queryFn: async () => {
      return realOrOfflineDemo(() => fetchInfrastructure(type), DEMO_INFRASTRUCTURE);
    },
    staleTime: 60 * MIN,
    ...opts,
  });
}

export function useHazard(
  hazardType?: string,
  opts?: Partial<UseQueryOptions<HazardCollection>>
): UseQueryResult<HazardCollection> {
  return useQuery({
    queryKey: ["hazard", hazardType],
    queryFn: async () => {
      return realOrOfflineDemo(() => fetchHazard(hazardType), DEMO_HAZARD);
    },
    staleTime: 60 * MIN,
    ...opts,
  });
}

/**
 * CENEPRED's official per-district El Niño risk. No demo fallback on purpose:
 * this layer's whole value is that it is the government's classification, so
 * when the API cannot serve it the layer stays empty rather than invented.
 * Fetched only once the operator turns the layer on.
 */
export function useCenepredRisk(
  hazard: CenepredHazard,
  enabled: boolean,
): UseQueryResult<CenepredRiskCollection> {
  return useQuery({
    queryKey: ["cenepred-risk", hazard],
    queryFn: () => fetchCenepredRisk(hazard),
    enabled,
    staleTime: 24 * 60 * MIN,
  });
}

/** Trained model output per district. `date` set = replay of that day (ERA5). */
export function useHuaycoModel(
  date: string | null,
  enabled: boolean,
): UseQueryResult<import("./api").HuaycoModelCollection> {
  return useQuery({
    queryKey: ["huayco-model", date],
    queryFn: () => fetchHuaycoModel(date),
    enabled,
    staleTime: date ? 24 * 60 * MIN : 15 * MIN,
    refetchInterval: date ? false : 15 * MIN,
  });
}

export function useHuaycoModelCard(): UseQueryResult<import("./api").HuaycoModelCard> {
  return useQuery({
    queryKey: ["huayco-model-card"],
    queryFn: () => fetchHuaycoModelCard(),
    staleTime: 60 * MIN,
    retry: 1,
  });
}

export function useAlerts(
  filters?: import("./api").AlertFilters,
  opts?: Partial<UseQueryOptions<Alert[]>>
): UseQueryResult<Alert[]> {
  const status = filters?.status;
  const demoFallback = status ? DEMO_ALERTS.filter((a) => a.status === status) : DEMO_ALERTS;
  return useQuery({
    queryKey: ["alerts", filters],
    queryFn: () => realOrOfflineDemo(() => fetchAlerts(filters), demoFallback),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    // Keep the previous list while a refetch is in flight. Never a demo list:
    // a fabricated alert in this feed is one an operator could act on.
    placeholderData: (prev) => prev,
    ...opts,
  });
}

/**
 * Is there a session to authenticate with?
 *
 * The endpoints below all require one. Polling them while signed out produced a
 * steady stream of 401s in the console and, worse, silent failures when the
 * operator clicked an export. Subscribing to the auth store means these queries
 * start themselves the moment a session exists.
 */
function useHasSession(): boolean {
  return useAuthStore((s) => s.token !== null);
}

export function useDecisionLog(
  limit = 100,
  opts?: Partial<UseQueryOptions<DecisionLogEntry[]>>
): UseQueryResult<DecisionLogEntry[]> {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ["decision-log", limit],
    enabled: hasSession,
    queryFn: () => realOrOfflineDemo(() => fetchDecisionLog(limit), DEMO_DECISION_LOG),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    placeholderData: (prev) => prev,
    ...opts,
  });
}

export function useFloodExposure(
  opts?: Partial<UseQueryOptions<FloodExposure>>
): UseQueryResult<FloodExposure> {
  return useQuery({
    queryKey: ["flood-exposure"],
    queryFn: async () => {
      return realOrOfflineDemo(() => fetchFloodExposure(), DEMO_EXPOSURE);
    },
    staleTime: 10 * MIN,
    // Keep showing previous data while refetching, prevents banner flash.
    placeholderData: (prev) => prev,
    ...opts,
  });
}

export function useSocialSignals(
  hours = 48,
  label?: string,
  opts?: Partial<UseQueryOptions<SocialSignalCollection>>
): UseQueryResult<SocialSignalCollection> {
  return useQuery({
    queryKey: ["social-signals", hours, label],
    queryFn: async () => {
      return realOrOfflineDemo(() => fetchSocialSignals(hours, label), DEMO_SOCIAL_SIGNALS);
    },
    staleTime: 90 * 1000,
    refetchInterval: 90 * 1000,
    placeholderData: (prev) => prev,
    ...opts,
  });
}

export function useFusion(
  ubigeo: string | null,
  opts?: Partial<UseQueryOptions<DistrictFusion>>
): UseQueryResult<DistrictFusion> {
  return useQuery({
    queryKey: ["fusion", ubigeo],
    queryFn: async () => {
      try {
        return await fetchDistrictFusion(ubigeo!);
      } catch (err: unknown) {
        // 404 = district exists in map but not seeded in DB, show partial data rather than crash
        const status = (err as { status?: number })?.status;
        if (status === 404) return null as unknown as DistrictFusion;
        throw err;
      }
    },
    enabled: !!ubigeo,
    staleTime: 2 * MIN,
    refetchInterval: 2 * MIN,
    // Keep showing the previous district's data briefly while loading the new one
    placeholderData: (prev) => prev,
    ...opts,
  });
}

export function useDistrictRiskSummary(
  opts?: Partial<UseQueryOptions<DistrictRiskSummary>>
): UseQueryResult<DistrictRiskSummary> {
  return useQuery({
    queryKey: ["district-risk-summary"],
    queryFn: () => realOrOfflineDemo(fetchDistrictRiskSummary, DEMO_DISTRICT_RISK_SUMMARY),
    staleTime: 2 * MIN,
    refetchInterval: 2 * MIN,
    // Keep showing previous risk colours during a refetch. Not demo shapes: the
    // demo districts are rectangles, and they painted the map before real data.
    placeholderData: (prev) => prev,
    ...opts,
  });
}

export function useScraperHealth(): UseQueryResult<ScraperHealth> {
  return useQuery({
    queryKey: ["scraper-health"],
    queryFn: fetchScraperHealth,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    retry: 1,
  });
}

export function useApiHealth(): UseQueryResult<import("@/lib/api").ApiHealth> {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    retry: 1,
  });
}

export function useDistrictDashboard(
  ubigeo: string | null,
  opts?: Partial<UseQueryOptions<DistrictDashboard>>
): UseQueryResult<DistrictDashboard> {
  return useQuery({
    queryKey: ["district-dashboard", ubigeo],
    queryFn: () => fetchDistrictDashboard(ubigeo!),
    enabled: !!ubigeo,
    staleTime: 2 * MIN,
    refetchInterval: 2 * MIN,
    placeholderData: (prev) => prev,
    ...opts,
  });
}

export function useStations(
  opts?: Partial<UseQueryOptions<StationCollection>>
): UseQueryResult<StationCollection> {
  return useQuery({
    queryKey: ["stations"],
    queryFn: async () => {
      return realOrOfflineDemo(() => fetchStations(), DEMO_STATIONS);
    },
    staleTime: 2 * MIN,
    refetchInterval: 2 * MIN,
    ...opts,
  });
}

/** Current weather conditions. Refetches on the upstream 15-minute cadence. */
export function useWeather(
  opts?: Partial<UseQueryOptions<import("@/lib/api").WeatherCollection>>
): UseQueryResult<import("@/lib/api").WeatherCollection> {
  return useQuery({
    queryKey: ["weather"],
    queryFn: () => fetchWeather(),
    staleTime: 5 * MIN,
    refetchInterval: 5 * MIN,
    ...opts,
  });
}

/** Real IMERG observations per basin; refreshed on the hourly ingest cadence. */
export function useImergObserved(): UseQueryResult<import("@/lib/api").ImergObserved> {
  return useQuery({
    queryKey: ["imerg-observed"],
    queryFn: () => fetchImergObserved(),
    staleTime: 10 * MIN,
    refetchInterval: 10 * MIN,
    retry: 1,
  });
}

/** 72 h rainfall forecast per watershed. No demo fallback: a forecast is never invented. */
export function useRainForecast(): UseQueryResult<import("@/lib/api").RainForecast> {
  return useQuery({
    queryKey: ["rain-forecast"],
    queryFn: () => fetchRainForecast(),
    staleTime: 15 * MIN,
    refetchInterval: 15 * MIN,
    retry: 1,
  });
}

export function useNotificationSubscribers(
  opts?: Partial<UseQueryOptions<NotificationSubscriber[]>>
): UseQueryResult<NotificationSubscriber[]> {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ["notification-subscribers"],
    enabled: hasSession,
    queryFn: () => fetchNotificationSubscribers(),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    ...opts,
  });
}

export function useNotificationDeliveries(
  opts?: Partial<UseQueryOptions<NotificationDelivery[]>>
): UseQueryResult<NotificationDelivery[]> {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ["notification-deliveries"],
    enabled: hasSession,
    queryFn: () => fetchNotificationDeliveries(),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    ...opts,
  });
}

export function usePendingProposals(
  opts?: Partial<UseQueryOptions<AlertProposal[]>>
): UseQueryResult<AlertProposal[]> {
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ["pending-proposals"],
    enabled: hasSession,
    queryFn: () => fetchPendingProposals(),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    ...opts,
  });
}

export function useShelters(
  opts?: Partial<UseQueryOptions<ShelterCollection>>
): UseQueryResult<ShelterCollection> {
  return useQuery({
    queryKey: ["shelters"],
    queryFn: async () => {
      try {
        return await fetchShelters();
      } catch {
        return { type: "FeatureCollection" as const, source: "", retrieved_at: "", count: 0, features: [] };
      }
    },
    staleTime: 60 * MIN,  // static data, refresh once per hour
    refetchInterval: 60 * MIN,
    ...opts,
  });
}
