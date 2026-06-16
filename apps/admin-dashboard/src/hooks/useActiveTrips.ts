/// useActiveTrips — SWR hook for fetching active trips with configurable polling.
///
/// Used by the Live Trip Map to display real-time trip positions and status.
/// Polls the admin API every 10 seconds (configurable) for near-real-time updates.
/// For true real-time (sub-second), the WebSocket-based useTripWebSocket hook
/// will layer on top.
import useSWR from 'swr';
import { apiClient } from '@/lib/api-client';

/** Simplified trip shape from GET /v1/admin/trips/active. */
export interface ActiveTrip {
  id: string;
  userId: string;
  tripMode: 'driver' | 'passenger';
  status: 'draft' | 'active' | 'delayed' | 'emergency' | 'escalated' | 'completed' | 'cancelled';
  origin: {
    name?: string | null;
    latitude: number;
    longitude: number;
  };
  destination: {
    name?: string | null;
    latitude: number;
    longitude: number;
  };
  currentLocation?: {
    latitude: number;
    longitude: number;
    speed?: number | null;
    heading?: number | null;
    timestamp?: string;
  } | null;
  vehiclePlateNumber?: string | null;
  transportCompany?: string | null;
  driverName?: string | null;
  passengerCount?: number | null;
  startedAt?: string | null;
  createdAt: string;
}

export interface ActiveTripsData {
  trips: ActiveTrip[];
}

/** Fetcher function for SWR. */
async function fetchActiveTrips(): Promise<ActiveTripsData> {
  return apiClient<ActiveTripsData>('/v1/admin/trips/active');
}

/**
 * SWR hook for active trips with polling.
 *
 * @param refreshInterval — Polling interval in ms (default: 10_000).
 *   Set to 0 to disable polling (fetch once).
 */
export function useActiveTrips(refreshInterval = 10_000) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<ActiveTripsData>(
    'admin-active-trips',
    fetchActiveTrips,
    {
      refreshInterval,
      revalidateOnFocus: true,
      errorRetryCount: 2,
    }
  );

  return {
    trips: data?.trips ?? [],
    isLoading,
    isRefreshing: isValidating && !isLoading,
    error: error ? (error as Error).message : null,
    refetch: mutate,
  };
}
