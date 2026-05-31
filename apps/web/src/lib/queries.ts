/**
 * TanStack Query hooks for all API data.
 * Stale times are tuned to each source's update frequency:
 *  - districts: static → 1 hour
 *  - IMERG: 30-min granules → 2 min
 *  - flood / huayco: ~6d SAR cadence → 10 min
 *  - infrastructure: OSM, rarely changes → 1 hour
 *  - alerts: operator-facing, low latency → 30 s
 */

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
  fetchAlerts,
  fetchDecisionLog,
  fetchFloodExposure,
  fetchSocialSignals,
  fetchDistrictRiskSummary,
  fetchDistrictDashboard,
  fetchHealth,
  fetchStations,
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
  DEMO_DASHBOARDS,
  DEMO_FUSIONS,
  DEMO_IMERG,
  DEMO_FLOOD,
  DEMO_HUAYCO,
  DEMO_INFRASTRUCTURE,
  DEMO_HAZARD,
  DEMO_STATIONS,
} from "./demoData";

/** When real API returns empty array, fall back to demo data so UI is never blank. */
function withDemoFallback<T>(real: T[], demo: T[]): T[] {
  return real.length > 0 ? real : demo;
}

const MIN = 1000 * 60;

export function useDistricts(
  opts?: Partial<UseQueryOptions<DistrictCollection>>
): UseQueryResult<DistrictCollection> {
  return useQuery({
    queryKey: ["districts", "geojson"],
    queryFn: async () => {
      try {
        const data = await fetchDistricts();
        return data.features.length > 0 ? data : DEMO_DISTRICTS;
      } catch {
        return DEMO_DISTRICTS;
      }
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
      try {
        const data = await fetchDistrictList(province);
        return data.length > 0 ? data : DEMO_DISTRICTS.features.map((f) => ({
          ubigeo: f.properties.ubigeo,
          name: f.properties.name,
        }));
      } catch {
        return DEMO_DISTRICTS.features.map((f) => ({
          ubigeo: f.properties.ubigeo,
          name: f.properties.name,
        }));
      }
    },
    staleTime: 60 * MIN,
    ...opts,
  });
}

export function useProvinces(): UseQueryResult<{ provinces: Array<{province: string; region: string; district_count: number}>; default_province: string }> {
  return useQuery({
    queryKey: ["provinces"],
    queryFn: async () => {
      try {
        return await fetchProvinces();
      } catch {
        return {
          provinces: [
            { province: "Lima", region: "Lima", district_count: 41 },
            { province: "Lima Región", region: "Lima", district_count: 118 },
          ],
          default_province: "Lima",
        };
      }
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
      try {
        const data = await fetchImerg(hours, replayDate);
        return data.features.length > 0 ? data : DEMO_IMERG;
      } catch {
        return DEMO_IMERG;
      }
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
      try {
        const data = await fetchFlood(replayDate);
        return data.features.length > 0 ? data : DEMO_FLOOD;
      } catch {
        return DEMO_FLOOD;
      }
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
      try {
        const data = await fetchHuayco();
        return data.features.length > 0 ? data : DEMO_HUAYCO;
      } catch {
        return DEMO_HUAYCO;
      }
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
      try {
        const data = await fetchInfrastructure(type);
        const filtered = type ? data.features.filter((f) => f.properties.type === type) : data.features;
        return filtered.length > 0 ? data : DEMO_INFRASTRUCTURE;
      } catch {
        return DEMO_INFRASTRUCTURE;
      }
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
      try {
        const data = await fetchHazard(hazardType);
        return data.features.length > 0 ? data : DEMO_HAZARD;
      } catch {
        return DEMO_HAZARD;
      }
    },
    staleTime: 60 * MIN,
    ...opts,
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
    queryFn: async () => {
      const data = await fetchAlerts(filters);
      return withDemoFallback(data, demoFallback);
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    // Keep showing previous/demo data when refetch errors — never blank the alert list
    placeholderData: (prev) => prev ?? demoFallback,
    ...opts,
  });
}

export function useDecisionLog(
  limit = 100,
  opts?: Partial<UseQueryOptions<DecisionLogEntry[]>>
): UseQueryResult<DecisionLogEntry[]> {
  return useQuery({
    queryKey: ["decision-log", limit],
    queryFn: async () => {
      const data = await fetchDecisionLog(limit);
      return withDemoFallback(data, DEMO_DECISION_LOG);
    },
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    placeholderData: (prev) => prev ?? DEMO_DECISION_LOG,
    ...opts,
  });
}

export function useFloodExposure(
  opts?: Partial<UseQueryOptions<FloodExposure>>
): UseQueryResult<FloodExposure> {
  return useQuery({
    queryKey: ["flood-exposure"],
    queryFn: async () => {
      try {
        const data = await fetchFloodExposure();
        return data.districts.length > 0 ? data : DEMO_EXPOSURE;
      } catch {
        return DEMO_EXPOSURE;
      }
    },
    staleTime: 10 * MIN,
    // Keep showing previous data while refetching — prevents banner flash.
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
      try {
        const data = await fetchSocialSignals(hours, label);
        return data.features.length > 0 ? data : DEMO_SOCIAL_SIGNALS;
      } catch {
        return DEMO_SOCIAL_SIGNALS;
      }
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
    queryFn: () => fetchDistrictFusion(ubigeo!),
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
    queryFn: async () => {
      const data = await fetchDistrictRiskSummary();
      return data.features.length > 0 ? data : DEMO_DISTRICT_RISK_SUMMARY;
    },
    staleTime: 2 * MIN,
    refetchInterval: 2 * MIN,
    // Keep showing previous risk colors (never blank the map)
    placeholderData: (prev) => prev ?? DEMO_DISTRICT_RISK_SUMMARY,
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
      try {
        const data = await fetchStations();
        return data.features.length > 0 ? data : DEMO_STATIONS;
      } catch {
        return DEMO_STATIONS;
      }
    },
    staleTime: 2 * MIN,
    refetchInterval: 2 * MIN,
    ...opts,
  });
}

export function useNotificationSubscribers(
  opts?: Partial<UseQueryOptions<NotificationSubscriber[]>>
): UseQueryResult<NotificationSubscriber[]> {
  return useQuery({
    queryKey: ["notification-subscribers"],
    queryFn: () => fetchNotificationSubscribers(),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    ...opts,
  });
}

export function useNotificationDeliveries(
  opts?: Partial<UseQueryOptions<NotificationDelivery[]>>
): UseQueryResult<NotificationDelivery[]> {
  return useQuery({
    queryKey: ["notification-deliveries"],
    queryFn: () => fetchNotificationDeliveries(),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    ...opts,
  });
}

export function usePendingProposals(
  opts?: Partial<UseQueryOptions<AlertProposal[]>>
): UseQueryResult<AlertProposal[]> {
  return useQuery({
    queryKey: ["pending-proposals"],
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
    staleTime: 60 * MIN,  // static data — refresh once per hour
    refetchInterval: 60 * MIN,
    ...opts,
  });
}
