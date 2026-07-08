'use client';

/// Trip Map (Screen 38: Linked Trip Monitoring) — "Trip Map: Map showing
/// all vehicles currently on a monitored trip."
///
/// WebSocket wiring note: the API only ever pushes `gps_update`/
/// `trip_status` events for a trip to connections that explicitly sent
/// `{ type: 'subscribe', tripId }` for it (see apps/api/src/services/
/// websocket.service.ts's `broadcastToTrip`) -- `subscribe_all_trips` is
/// restricted to admin/super_admin/monitoring_officer roles only, which
/// transport_partner is not part of. So this page fetches the active-ish
/// trip list via REST (poll), then explicitly subscribes to each trip's ID
/// over the socket to actually receive its live position updates.
import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Truck, Loader2, Map as MapIcon } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

// Same convention as apps/corporate-dashboard's map/page.tsx -- must
// include the full /v1/ws path (see websocket.service.ts's `path: '/v1/ws'`).
// Production: wss://api.safepass-tech.com/v1/ws.
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3000/v1/ws';

// Trips in any of these statuses count as "currently on a monitored trip"
// per Screen 38 -- broader than just the literal 'active' string so a
// delayed/emergency/escalated vehicle doesn't just disappear from the map.
const MONITORED_STATUSES = ['active', 'delayed', 'emergency', 'escalated'];

// Re-poll the trip list periodically to catch newly-started trips this
// session hasn't subscribed to yet, and to drop trips that have completed/
// cancelled since the last check.
const POLL_INTERVAL_MS = 20_000;

// ── Types ──────────────────────────────────────────────────────────────────────

interface Trip {
  id: string;
  driverName: string | null;
  vehiclePlateNumber: string | null;
  status: string;
  origin: { name?: string | null; latitude: number; longitude: number };
}

interface LivePosition {
  latitude: number;
  longitude: number;
}

/** A trip merged with its live GPS position (if any has arrived yet) --
 * what LeafletMap actually renders. */
export interface MonitoredTrip {
  id: string;
  driverName: string | null;
  vehiclePlateNumber: string | null;
  status: string;
  position: LivePosition;
  isLive: boolean;
}

// ── Leaflet map (loaded client-side only to avoid SSR issues) ─────────────────

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] items-center justify-center bg-slate-50">
      <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
    </div>
  ),
});

// ── Page ───────────────────────────────────────────────────────────────────────

export default function TripMapPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [livePositions, setLivePositions] = useState<Map<string, LivePosition>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const subscribedTripIds = useRef<Set<string>>(new Set());

  const fetchMonitoredTrips = useCallback(async () => {
    try {
      const data = await apiClient<{ trips: Trip[] }>(
        `/v1/trips?status=${MONITORED_STATUSES.join(',')}`
      );
      const list = data.trips ?? [];
      setTrips(list);
      setError(null);

      // Subscribe to any newly-seen trip so its gps_update events actually
      // reach this connection (see module header comment).
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        for (const trip of list) {
          if (!subscribedTripIds.current.has(trip.id)) {
            ws.send(JSON.stringify({ type: 'subscribe', tripId: trip.id }));
            subscribedTripIds.current.add(trip.id);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitored trips');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + periodic re-poll.
  useEffect(() => {
    fetchMonitoredTrips();
    const interval = setInterval(fetchMonitoredTrips, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchMonitoredTrips]);

  // Kept in sync with `trips` so the WS effect below (which only runs once
  // per connection, not once per trips change) can always resubscribe to
  // whatever is CURRENTLY known on (re)connect, instead of closing over a
  // stale empty array from when the effect first ran.
  const tripsRef = useRef<Trip[]>([]);
  useEffect(() => {
    tripsRef.current = trips;
  }, [trips]);

  // WebSocket: subscribe to each known trip on (re)connect, then apply live
  // gps_update/trip_status events as they arrive. Auto-reconnects on an
  // unexpected close (network blip, server restart) -- same 3s-retry
  // pattern as the mobile app's useDashboardWebSocket-equivalent, since a
  // live tracking map that silently stops updating after one dropped
  // connection isn't "working perfectly."
  useEffect(() => {
    let intentionalClose = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      const url = token ? `${WS_URL}?token=${token}` : WS_URL;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        // Re-subscribe to whatever trips are already known at connect time
        // (covers both the very first connect and any later reconnect) --
        // fetchMonitoredTrips' own subscribe logic only fires afterward,
        // for trips it hasn't seen before.
        subscribedTripIds.current.clear();
        for (const trip of tripsRef.current) {
          ws.send(JSON.stringify({ type: 'subscribe', tripId: trip.id }));
          subscribedTripIds.current.add(trip.id);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!intentionalClose) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            tripId?: string;
            payload?: unknown;
          };

          if (msg.type === 'gps_update' && msg.tripId && msg.payload) {
            const { latitude, longitude } = msg.payload as { latitude: number; longitude: number };
            setLivePositions((prev) => new Map(prev).set(msg.tripId!, { latitude, longitude }));
          } else if (msg.type === 'trip_status' && msg.tripId && msg.payload) {
            const { status } = msg.payload as { status: string };
            setTrips((prev) => {
              // A trip leaving the monitored set (completed/cancelled) just
              // disappears from the map immediately rather than waiting
              // for the next poll; still-monitored status changes (e.g.
              // active -> delayed) update in place for the colour change.
              if (!MONITORED_STATUSES.includes(status)) {
                return prev.filter((t) => t.id !== msg.tripId);
              }
              return prev.map((t) => (t.id === msg.tripId ? { ...t, status } : t));
            });
          }
        } catch {
          // Non-JSON frames (e.g. ping) are intentionally ignored.
        }
      };
    }

    connect();

    return () => {
      intentionalClose = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  const monitoredTrips: MonitoredTrip[] = trips.map((t) => {
    const live = livePositions.get(t.id);
    return {
      id: t.id,
      driverName: t.driverName,
      vehiclePlateNumber: t.vehiclePlateNumber,
      status: t.status,
      position: live ?? { latitude: t.origin.latitude, longitude: t.origin.longitude },
      isLive: Boolean(live),
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Trip Map</h1>
          <p className="mt-1 text-sm text-slate-500">Live view of vehicles currently on a monitored trip</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              connected ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-slate-400'}`} />
            {connected ? 'Live' : 'Reconnecting…'}
          </span>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
            <Truck className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-slate-dark">{monitoredTrips.length}</span>
            <span className="text-sm text-slate-500">on trip</span>
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Map panel */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <MapIcon className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium text-slate-600">Live map — Nigeria</span>
          {!loading && (
            <span className="ml-auto text-xs text-slate-400">
              {monitoredTrips.length === 0
                ? 'No monitored trips'
                : `${monitoredTrips.length} vehicle${monitoredTrips.length !== 1 ? 's' : ''} tracked`}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex h-[520px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
          </div>
        ) : (
          <LeafletMap trips={monitoredTrips} />
        )}
      </div>

      {/* Trip list — quick reference alongside the map; full filtering
          (vehicle/driver/date) lives on the Trips page. */}
      {!loading && monitoredTrips.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
            <span className="text-sm font-medium text-slate-600">Monitored trips</span>
            <a href="/dashboard/trips" className="text-xs font-medium text-primary hover:underline">
              View all trips →
            </a>
          </div>
          <div className="divide-y divide-slate-100">
            {monitoredTrips.map((trip) => (
              <div key={trip.id} className="flex items-start justify-between px-5 py-4 hover:bg-slate-50">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        trip.status === 'active'
                          ? 'bg-green-400'
                          : trip.status === 'delayed'
                            ? 'bg-amber-400'
                            : 'bg-red-500'
                      }`}
                    />
                    <span className="text-sm font-medium text-slate-dark">
                      {trip.driverName ?? `Trip ${trip.id.slice(0, 8)}…`}
                    </span>
                    {trip.vehiclePlateNumber && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        {trip.vehiclePlateNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-xs capitalize text-slate-500">{trip.status}</p>
                </div>
                <span className="mt-0.5 text-xs text-slate-400">
                  {trip.isLive ? 'Live' : 'Awaiting GPS'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && monitoredTrips.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-12 shadow-sm">
          <MapIcon className="mb-3 h-12 w-12 text-slate-300" />
          <p className="text-sm text-slate-400">No vehicles currently on a monitored trip.</p>
          <p className="mt-1 text-xs text-slate-300">Markers appear here once a trip starts.</p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-400">
        Default centre: Nigeria (9.0765° N, 7.3986° E) — live updates via WebSocket
      </div>
    </div>
  );
}
