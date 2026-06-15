'use client';

/**
 * Trips page — lists trips returned by GET /v1/trips.
 *
 * NOTE: The /v1/trips endpoint is scoped to the authenticated user (the transport
 * operator account), not an organisation. Trips created by passengers linked to
 * this operator will appear once org-scoped filtering is supported by the API.
 */

import { useState, useEffect, useCallback } from 'react';
import { Map, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface Trip {
  id: string;
  userId: string;
  passengerName?: string | null;
  driverName?: string | null;
  vehiclePlate?: string | null;
  status: string;
  departureTime?: string | null;
  origin?: string | null;
  destination?: string | null;
  createdAt?: string | null;
}

/** Maps trip status values to Tailwind colour classes. */
const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-500',
  active: 'bg-green-50 text-green-700',
  delayed: 'bg-amber-50 text-amber-700',
  emergency: 'bg-red-100 text-red-700',
  escalated: 'bg-red-50 text-red-600',
  completed: 'bg-blue-50 text-blue-700',
  cancelled: 'bg-slate-100 text-slate-400',
};

const STATUS_FILTERS = ['all', 'active', 'completed', 'cancelled', 'delayed', 'emergency'];

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchTrips = useCallback(async (status: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = status !== 'all' ? `?status=${status}` : '';
      const data = await apiClient<{ trips: Trip[] }>(`/v1/trips${query}`);
      setTrips(data.trips ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trips');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrips(statusFilter);
  }, [fetchTrips, statusFilter]);

  function formatDateTime(value?: string | null) {
    if (!value) return '—';
    return new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Trips</h1>
          <p className="mt-1 text-sm text-slate-500">
            {trips.length} trip{trips.length !== 1 ? 's' : ''} — scoped to this operator account
          </p>
        </div>

        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-primary text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {['Trip ID', 'Passenger', 'Driver', 'Vehicle', 'Origin → Destination', 'Departure', 'Status'].map(
                    (h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trips.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <Map className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                      <p className="text-sm text-slate-400">
                        {statusFilter === 'all'
                          ? 'No trips found for this account.'
                          : `No ${statusFilter} trips.`}
                      </p>
                    </td>
                  </tr>
                ) : (
                  trips.map((trip) => (
                    <tr key={trip.id} className="hover:bg-slate-50">
                      {/* Truncated trip ID — full value in title for copy-on-hover */}
                      <td
                        className="px-4 py-3 font-mono text-xs text-slate-500"
                        title={trip.id}
                      >
                        {trip.id.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {trip.passengerName ?? <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {trip.driverName ?? <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {trip.vehiclePlate ?? <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {trip.origin || trip.destination
                          ? `${trip.origin ?? '?'} → ${trip.destination ?? '?'}`
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                        {formatDateTime(trip.departureTime ?? trip.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <TripStatusBadge status={trip.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TripStatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-500';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}
