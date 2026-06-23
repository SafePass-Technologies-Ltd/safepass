/// Admin Trip Management Page — trip list with filtering (A-03).
///
/// Shows all trips with status filters, search, and quick actions.
/// Clicking a trip navigates to its detail view (Week 3: A-04).
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, RotateCcw, MapPin, Clock } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { IncomingMessage } from '@/hooks/useDashboardWebSocket';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface TripData {
  id: string;
  userId: string;
  origin: { name?: string; latitude: number; longitude: number };
  destination: { name?: string; latitude: number; longitude: number };
  status: TripStatus;
  startedAt: string | null;
  estimatedArrival: string | null;
  vehiclePlateNumber: string | null;
  transportCompany: string | null;
  /** Count of unread messages from the traveller (senderRole='user', isRead=false). */
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

type TripStatus = 'draft' | 'active' | 'delayed' | 'emergency' | 'escalated' | 'completed' | 'cancelled';

const STATUS_FILTERS: { label: string; value: TripStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Delayed', value: 'delayed' },
  { label: 'Emergency', value: 'emergency' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

// ────────────────────────────────────────────────────────────
// Status badge styling
// ────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<TripStatus, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Draft' },
  active: { bg: 'bg-green-100', text: 'text-green-700', label: 'Active' },
  delayed: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Delayed' },
  emergency: { bg: 'bg-red-100', text: 'text-red-700', label: 'Emergency' },
  escalated: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Escalated' },
  completed: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Completed' },
  cancelled: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Cancelled' },
};

// ────────────────────────────────────────────────────────────
// Page Component
// ────────────────────────────────────────────────────────────

export default function TripManagementPage() {
  const [trips, setTrips] = useState<TripData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TripStatus | 'all'>('active');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchTrips = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = apiClient;
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      const data = await apiClient<{ trips: TripData[] }>(
        `/v1/admin/trips/active?${params.toString()}`
      );
      const allTrips = data.trips;

      // If filtering by non-active status, we filter client-side
      // (active trips endpoint returns all active; admin full list is Week 3)
      const filtered =
        statusFilter === 'all' || ['active', 'delayed', 'emergency', 'escalated'].includes(statusFilter)
          ? allTrips
          : allTrips.filter((t) => t.status === statusFilter);

      setTrips(filtered);
    } catch (err) {
      setError('Failed to load trips. Is the API server running?');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  // Real-time per-trip unread count — when a traveller sends a message the
  // layout broadcasts 'sp:new_message' (senderRole is always 'user' here).
  // Find the matching row by tripId and bump its unreadCount immediately so
  // the badge updates without waiting for a manual refresh.
  useEffect(() => {
    function onNewMessage(evt: Event) {
      const msg = (evt as CustomEvent<IncomingMessage>).detail;
      if (!msg.tripId) return;
      setTrips((prev) =>
        prev.map((trip) =>
          trip.id === msg.tripId
            ? { ...trip, unreadCount: trip.unreadCount + 1 }
            : trip
        )
      );
    }
    window.addEventListener('sp:new_message', onNewMessage);
    return () => window.removeEventListener('sp:new_message', onNewMessage);
  }, []);

  // Client-side search filter
  const displayedTrips = searchQuery
    ? trips.filter((t) => {
        const q = searchQuery.toLowerCase();
        const originName = t.origin?.name?.toLowerCase() ?? '';
        const destName = t.destination?.name?.toLowerCase() ?? '';
        const plate = t.vehiclePlateNumber?.toLowerCase() ?? '';
        return originName.includes(q) || destName.includes(q) || plate.includes(q);
      })
    : trips;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Trip Management</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor and manage all trips across the platform.
          </p>
        </div>
        <button
          onClick={fetchTrips}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Status filter pills */}
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by route or plate number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary sm:w-80"
          />
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && displayedTrips.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Filter className="h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-600">No trips found</h3>
          <p className="mt-1 text-sm text-slate-400">
            {statusFilter === 'all'
              ? 'No trips recorded yet.'
              : `No trips with status "${statusFilter}".`}
          </p>
        </div>
      )}

      {/* Trip table */}
      {!loading && !error && displayedTrips.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">Route</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Unread</th>
                  <th className="px-6 py-3">Vehicle / Company</th>
                  <th className="px-6 py-3">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedTrips.map((trip) => {
                  const statusStyle = STATUS_STYLE[trip.status];
                  const originName = trip.origin?.name ?? `${trip.origin.latitude.toFixed(3)}, ${trip.origin.longitude.toFixed(3)}`;
                  const destName = trip.destination?.name ?? `${trip.destination.latitude.toFixed(3)}, ${trip.destination.longitude.toFixed(3)}`;

                  return (
                    <tr
                      key={trip.id}
                      className="group cursor-pointer transition-colors hover:bg-slate-50"
                      onClick={() => {
                        window.location.href = `/dashboard/trips/${trip.id}`;
                      }}
                    >
                      {/* Route */}
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-slate-400" />
                          <div>
                            <p className="text-sm font-medium text-slate-700">{originName}</p>
                            <p className="text-xs text-slate-400">→ {destName}</p>
                          </div>
                        </div>
                      </td>

                      {/* Status badge */}
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
                        >
                          {statusStyle.label}
                        </span>
                      </td>

                      {/* Unread messages from traveller */}
                      <td className="px-6 py-3">
                        {trip.unreadCount > 0 ? (
                          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
                            {trip.unreadCount}
                          </span>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>

                      {/* Vehicle / Company */}
                      <td className="px-6 py-3 text-sm text-slate-600">
                        {trip.vehiclePlateNumber ?? trip.transportCompany ?? '—'}
                      </td>

                      {/* Started at */}
                      <td className="px-6 py-3 text-sm text-slate-500">
                        {trip.startedAt ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(trip.startedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stats summary */}
      {!loading && !error && (
        <p className="text-xs text-slate-400">
          Showing {displayedTrips.length} trip{displayedTrips.length !== 1 ? 's' : ''}
          {statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''}
          {searchQuery ? ` matching "${searchQuery}"` : ''}
        </p>
      )}
    </div>
  );
}
