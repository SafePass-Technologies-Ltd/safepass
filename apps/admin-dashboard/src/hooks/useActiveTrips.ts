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

// ────────────────────────────────────────────────────────────
// Mock data — used when the backend API is unavailable
// (e.g., local development without a running backend).
// ────────────────────────────────────────────────────────────

const LAGOS = { latitude: 6.5244, longitude: 3.3792 };
const BENIN = { latitude: 6.3350, longitude: 5.6037 };
const ABUJA = { latitude: 9.0765, longitude: 7.3986 };
const KADUNA = { latitude: 10.5105, longitude: 7.4165 };
const ENUGU = { latitude: 6.4584, longitude: 7.5464 };
const ORE = { latitude: 6.7533, longitude: 4.8768 };

const MOCK_TRIPS: ActiveTrip[] = [
  {
    id: 'mock-trip-001',
    userId: 'mock-user-001',
    tripMode: 'driver',
    status: 'active',
    origin: { name: 'Lagos', ...LAGOS },
    destination: { name: 'Benin', ...BENIN },
    currentLocation: { latitude: 6.5244, longitude: 3.3792, speed: 80, heading: 90 },
    vehiclePlateNumber: 'ABC-123-XY',
    transportCompany: null,
    driverName: 'Chidi Okafor',
    passengerCount: 1,
    startedAt: new Date(Date.now() - 3600_000).toISOString(),
    createdAt: new Date(Date.now() - 7200_000).toISOString(),
  },
  {
    id: 'mock-trip-002',
    userId: 'mock-user-002',
    tripMode: 'passenger',
    status: 'delayed',
    origin: { name: 'Abuja', ...ABUJA },
    destination: { name: 'Kaduna', ...KADUNA },
    currentLocation: { latitude: 9.3000, longitude: 7.5000, speed: 0, heading: 45 },
    vehiclePlateNumber: null,
    transportCompany: 'Okafor Express',
    driverName: null,
    passengerCount: 2,
    startedAt: new Date(Date.now() - 5400_000).toISOString(),
    createdAt: new Date(Date.now() - 9000_000).toISOString(),
  },
  {
    id: 'mock-trip-003',
    userId: 'mock-user-003',
    tripMode: 'passenger',
    status: 'emergency',
    origin: { name: 'Benin', ...BENIN },
    destination: { name: 'Enugu', ...ENUGU },
    currentLocation: { latitude: 6.4400, longitude: 6.0500, speed: 0, heading: 120 },
    vehiclePlateNumber: null,
    transportCompany: 'Delta Line',
    driverName: null,
    passengerCount: 3,
    startedAt: new Date(Date.now() - 7200_000).toISOString(),
    createdAt: new Date(Date.now() - 10800_000).toISOString(),
  },
  {
    id: 'mock-trip-004',
    userId: 'mock-user-004',
    tripMode: 'driver',
    status: 'active',
    origin: { name: 'Lagos', ...LAGOS },
    destination: { name: 'Benin', ...BENIN },
    currentLocation: { latitude: 6.6000, longitude: 4.2000, speed: 65, heading: 85 },
    vehiclePlateNumber: 'XYZ-456-AB',
    transportCompany: null,
    driverName: 'Amara Eze',
    passengerCount: 2,
    startedAt: new Date(Date.now() - 1800_000).toISOString(),
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    id: 'mock-trip-005',
    userId: 'mock-user-005',
    tripMode: 'passenger',
    status: 'active',
    origin: { name: 'Ore', ...ORE },
    destination: { name: 'Benin', ...BENIN },
    currentLocation: { latitude: 6.6200, longitude: 4.9800, speed: 45, heading: 70 },
    vehiclePlateNumber: 'BUS-789-CD',
    transportCompany: 'ABC Motors',
    driverName: 'Ibrahim Musa',
    passengerCount: 4,
    startedAt: new Date(Date.now() - 2700_000).toISOString(),
    createdAt: new Date(Date.now() - 5400_000).toISOString(),
  },
];

/** Whether mock data mode is active (set when the first API call fails). */
let _useMockData = false;

/**
 * SWR hook for active trips with polling.
 *
 * Falls back to mock data when the backend API is unavailable
 * (e.g., developing the dashboard without a running API server).
 *
 * @param refreshInterval — Polling interval in ms (default: 10_000).
 *   Set to 0 to disable polling (fetch once).
 */
export function useActiveTrips(refreshInterval = 10_000) {
  // Fallback fetcher: tries the real API first, then uses mock data.
  const swrFetcher = async (): Promise<ActiveTripsData> => {
    try {
      const data = await fetchActiveTrips();
      _useMockData = false;
      return data;
    } catch {
      // API unavailable — use mock data for development/demo purposes.
      if (!_useMockData) {
        console.warn(
          '[useActiveTrips] Backend API unavailable. Using mock trip data for development.'
        );
        _useMockData = true;
      }
      return { trips: MOCK_TRIPS };
    }
  };

  const { data, error, isLoading, isValidating, mutate } = useSWR<ActiveTripsData>(
    'admin-active-trips',
    swrFetcher,
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
