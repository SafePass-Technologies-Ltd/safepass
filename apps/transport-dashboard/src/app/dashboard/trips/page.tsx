'use client';

/**
 * Trips page — lists all trips belonging to this organisation via GET /v1/trips.
 *
 * The API returns org-scoped results when the caller's JWT contains an orgId
 * (transport/corporate dashboard users), so every trip registered under this
 * organisation is visible here.
 *
 * Field names below match the real `trips` table (apps/api/src/db/schema/
 * trips.ts) as returned raw by getOrgTrips -- there is no response-shaping
 * layer for this endpoint (unlike vehicle/driver/document.service.ts, which
 * do reshape their rows). Earlier versions of this page used
 * passengerName/vehiclePlate/departureTime, none of which exist on the real
 * response (origin/destination are {name, latitude, longitude} objects, not
 * flat strings; there is no passenger-name field at all -- only userId).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Map, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface Trip {
  id: string;
  userId: string;
  driverName?: string | null;
  vehiclePlateNumber?: string | null;
  transportCompany?: string | null;
  status: string;
  scheduledDeparture?: string | null;
  startedAt?: string | null;
  origin?: { name?: string | null; latitude: number; longitude: number } | null;
  destination?: { name?: string | null; latitude: number; longitude: number } | null;
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

  // Screen 38 (Linked Trip Monitoring): "Trip List | Filterable by vehicle,
  // driver, date." GET /v1/trips only supports a `status` filter
  // server-side, so vehicle/driver/date are applied client-side over the
  // status-filtered result set below.
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

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

  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      if (vehicleFilter && !t.vehiclePlateNumber?.toLowerCase().includes(vehicleFilter.toLowerCase())) {
        return false;
      }
      if (driverFilter && !t.driverName?.toLowerCase().includes(driverFilter.toLowerCase())) {
        return false;
      }
      if (dateFilter) {
        const tripDate = (t.scheduledDeparture ?? t.startedAt ?? t.createdAt)?.slice(0, 10);
        if (tripDate !== dateFilter) return false;
      }
      return true;
    });
  }, [trips, vehicleFilter, driverFilter, dateFilter]);

  function formatDateTime(value?: string | null) {
    if (!value) return '—';
    return new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  function formatLocation(loc?: Trip['origin']) {
    if (!loc) return '?';
    return loc.name || `${loc.latitude.toFixed(3)}, ${loc.longitude.toFixed(3)}`;
  }

  const inputCls =
    'rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Trips</h1>
          <p className="mt-1 text-sm text-slate-500">
            {filteredTrips.length} of {trips.length} trip{trips.length !== 1 ? 's' : ''} across your organisation
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

      {/* Vehicle / driver / date filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={vehicleFilter}
          onChange={(e) => setVehicleFilter(e.target.value)}
          placeholder="Filter by vehicle plate..."
          className={inputCls}
        />
        <input
          type="text"
          value={driverFilter}
          onChange={(e) => setDriverFilter(e.target.value)}
          placeholder="Filter by driver name..."
          className={inputCls}
        />
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className={inputCls}
        />
        {(vehicleFilter || driverFilter || dateFilter) && (
          <button
            onClick={() => { setVehicleFilter(''); setDriverFilter(''); setDateFilter(''); }}
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Clear filters
          </button>
        )}
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
                  {['Trip ID', 'Driver', 'Vehicle', 'Origin → Destination', 'Departure', 'Status'].map(
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
                {filteredTrips.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <Map className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                      <p className="text-sm text-slate-400">
                        {trips.length === 0
                          ? 'No trips found for this account.'
                          : 'No trips match the current filters.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredTrips.map((trip) => (
                    <tr key={trip.id} className="hover:bg-slate-50">
                      {/* Truncated trip ID — full value in title for copy-on-hover */}
                      <td
                        className="px-4 py-3 font-mono text-xs text-slate-500"
                        title={trip.id}
                      >
                        {trip.id.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {trip.driverName ?? <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {trip.vehiclePlateNumber ?? <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {formatLocation(trip.origin)} → {formatLocation(trip.destination)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                        {formatDateTime(trip.scheduledDeparture ?? trip.startedAt ?? trip.createdAt)}
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
