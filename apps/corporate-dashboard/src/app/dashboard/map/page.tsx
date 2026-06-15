'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Users, Loader2, Map as MapIcon } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3000';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Trip {
  id: string;
  userId: string;
  origin: { name: string; latitude: number; longitude: number };
  destination: { name: string; latitude: number; longitude: number };
  driverName: string | null;
  vehiclePlateNumber: string | null;
  status: string;
  updatedAt: string;
}

// ── Leaflet map (loaded client-side only to avoid SSR issues) ─────────────────
//
// react-leaflet requires the browser's window/document globals, and Leaflet
// itself bundles PNG marker icons that Next.js can't resolve at build time.
// Wrapping the map in a dynamic import with ssr:false sidesteps both issues.

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] items-center justify-center bg-slate-50">
      <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
    </div>
  ),
});

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LiveMapPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchActiveTrips = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient<{ trips: Trip[] }>('/v1/trips?status=active');
      setTrips(data.trips ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load active trips');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveTrips();
  }, [fetchActiveTrips]);

  // WebSocket: receive real-time trip-status and location updates.
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const url = token ? `${WS_URL}?token=${token}` : WS_URL;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === 'tripUpdate') {
          const updated: Trip = msg.data;
          setTrips((prev) => {
            const idx = prev.findIndex((t) => t.id === updated.id);
            // Remove trips that are no longer active.
            if (updated.status !== 'active') {
              return prev.filter((t) => t.id !== updated.id);
            }
            if (idx === -1) return [...prev, updated];
            const next = [...prev];
            next[idx] = updated;
            return next;
          });
        }
      } catch {
        // Non-JSON frames (e.g. ping) are intentionally ignored.
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Live Staff Map</h1>
          <p className="mt-1 text-sm text-slate-500">Real-time view of active staff trips</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-slate-dark">{trips.length}</span>
          <span className="text-sm text-slate-500">on trip</span>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Map panel */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <MapIcon className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium text-slate-600">Live map — Nigeria</span>
          {!loading && (
            <span className="ml-auto text-xs text-slate-400">
              {trips.length === 0 ? 'No active trips' : `${trips.length} trip${trips.length !== 1 ? 's' : ''} tracked`}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex h-[520px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
          </div>
        ) : (
          <LeafletMap trips={trips} />
        )}
      </div>

      {/* Trip list — visible alongside the map as a quick reference */}
      {!loading && trips.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
            <span className="text-sm font-medium text-slate-600">Active trips</span>
          </div>
          <div className="divide-y divide-slate-100">
            {trips.map((trip) => (
              <div
                key={trip.id}
                className="flex items-start justify-between px-5 py-4 hover:bg-slate-50"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-400" />
                    <span className="text-sm font-medium text-slate-dark">
                      {trip.driverName ?? `User ${trip.userId.slice(0, 8)}…`}
                    </span>
                    {trip.vehiclePlateNumber && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        {trip.vehiclePlateNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {trip.origin.name} → {trip.destination.name}
                  </p>
                </div>
                <span className="mt-0.5 text-xs text-slate-400">
                  {new Date(trip.updatedAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state — shown below the (empty) map */}
      {!loading && trips.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-12 shadow-sm">
          <MapIcon className="mb-3 h-12 w-12 text-slate-300" />
          <p className="text-sm text-slate-400">No staff currently on active trips.</p>
          <p className="mt-1 text-xs text-slate-300">Markers will appear on the map once trips start.</p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-400">
        Default centre: Nigeria (9.0765° N, 7.3986° E) — live updates via WebSocket
      </div>
    </div>
  );
}
