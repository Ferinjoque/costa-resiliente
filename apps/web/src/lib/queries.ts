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
  fetchAlerts,
  type DistrictCollection,
  type DistrictListItem,
  type ImergCollection,
  type FloodCollection,
  type HuaycoCollection,
  type InfraCollection,
  type Alert,
} from "./api";

const MIN = 1000 * 60;

export function useDistricts(
  opts?: Partial<UseQueryOptions<DistrictCollection>>
): UseQueryResult<DistrictCollection> {
  return useQuery({
    queryKey: ["districts", "geojson"],
    queryFn: fetchDistricts,
    staleTime: 60 * MIN,
    ...opts,
  });
}

export function useDistrictList(
  opts?: Partial<UseQueryOptions<DistrictListItem[]>>
): UseQueryResult<DistrictListItem[]> {
  return useQuery({
    queryKey: ["districts", "list"],
    queryFn: fetchDistrictList,
    staleTime: 60 * MIN,
    ...opts,
  });
}

export function useImerg(
  hours = 24,
  opts?: Partial<UseQueryOptions<ImergCollection>>
): UseQueryResult<ImergCollection> {
  return useQuery({
    queryKey: ["imerg", hours],
    queryFn: () => fetchImerg(hours),
    staleTime: 2 * MIN,
    refetchInterval: 2 * MIN,
    ...opts,
  });
}

export function useFlood(
  opts?: Partial<UseQueryOptions<FloodCollection>>
): UseQueryResult<FloodCollection> {
  return useQuery({
    queryKey: ["flood"],
    queryFn: fetchFlood,
    staleTime: 10 * MIN,
    ...opts,
  });
}

export function useHuayco(
  opts?: Partial<UseQueryOptions<HuaycoCollection>>
): UseQueryResult<HuaycoCollection> {
  return useQuery({
    queryKey: ["huayco"],
    queryFn: fetchHuayco,
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

export function useAlerts(
  status?: string,
  opts?: Partial<UseQueryOptions<Alert[]>>
): UseQueryResult<Alert[]> {
  return useQuery({
    queryKey: ["alerts", status],
    queryFn: () => fetchAlerts(status),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    ...opts,
  });
}
