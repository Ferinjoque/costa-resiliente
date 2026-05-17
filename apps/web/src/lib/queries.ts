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
  fetchDistrictFusion,
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
  opts?: Partial<UseQueryOptions<DistrictListItem[]>>
): UseQueryResult<DistrictListItem[]> {
  return useQuery({
    queryKey: ["districts", "list"],
    queryFn: async () => {
      try {
        const data = await fetchDistrictList();
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
    refetchInterval: replayDate ? false : undefined,
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
    ...opts,
  });
}

export function useInfrastructure(
  type?: string,
  opts?: Partial<UseQueryOptions<InfraCollection>>
): UseQueryResult<InfraCollection> {
  return useQuery({
    queryKey: ["infrastructure", type],
    queryFn: () => fetchInfrastructure(type),
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
    queryFn: () => fetchHazard(hazardType),
    staleTime: 60 * MIN,
    ...opts,
  });
}

export function useAlerts(
  status?: string,
  opts?: Partial<UseQueryOptions<Alert[]>>
): UseQueryResult<Alert[]> {
  return useQuery({
    queryKey: ["alerts", status],
    queryFn: async () => {
      try {
        const data = await fetchAlerts(status);
        return withDemoFallback(data, status ? DEMO_ALERTS.filter((a) => a.status === status) : DEMO_ALERTS);
      } catch {
        return status ? DEMO_ALERTS.filter((a) => a.status === status) : DEMO_ALERTS;
      }
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
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
      try {
        const data = await fetchDecisionLog(limit);
        return withDemoFallback(data, DEMO_DECISION_LOG);
      } catch {
        return DEMO_DECISION_LOG;
      }
    },
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
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
    staleTime: 5 * MIN,
    refetchInterval: 5 * MIN,
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
      } catch {
        return DEMO_FUSIONS[ubigeo!] ?? DEMO_FUSIONS["150118"];
      }
    },
    enabled: !!ubigeo,
    staleTime: 3 * MIN,
    refetchInterval: 3 * MIN,
    ...opts,
  });
}

export function useDistrictRiskSummary(
  opts?: Partial<UseQueryOptions<DistrictRiskSummary>>
): UseQueryResult<DistrictRiskSummary> {
  return useQuery({
    queryKey: ["district-risk-summary"],
    queryFn: async () => {
      try {
        const data = await fetchDistrictRiskSummary();
        return data.features.length > 0 ? data : DEMO_DISTRICT_RISK_SUMMARY;
      } catch {
        return DEMO_DISTRICT_RISK_SUMMARY;
      }
    },
    staleTime: 3 * MIN,
    refetchInterval: 5 * MIN,
    ...opts,
  });
}

export function useApiHealth(): UseQueryResult<{ status: string; version: string }> {
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
    queryFn: async () => {
      try {
        return await fetchDistrictDashboard(ubigeo!);
      } catch {
        return DEMO_DASHBOARDS[ubigeo!] ?? DEMO_DASHBOARDS["150118"];
      }
    },
    enabled: !!ubigeo,
    staleTime: 2 * MIN,
    refetchInterval: 5 * MIN,
    ...opts,
  });
}
