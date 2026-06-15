'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RotateCcw, MapPin, Clock, User, Car } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type TripStatus = 'draft' | 'active' | 'delayed' | 'emergency' | 'escalated' | 'completed' | 'cancelled';

interface StatusHistoryEntry {
  status: TripStatus;
  changedAt: string;
  note?: string;
}

interface TripDetail {
  id: string;
  userId: string;
  tripMode: 'driver' | 'passenger';
  origin: { name?: string; latitude: number; longitude: number };
  destination: { name?: string; latitude: number; longitude: number };
  status: TripStatus;
  startedAt: string | null;
  estimatedArrival: string | null;
  vehiclePlateNumber: string | null;
  transportCompany: string | null;
  passengerCount: number;
  driverName?: string | null;
  driverPhone?: string | null;
  statusHistory?: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

const STATUS_STYLE: Record<TripStatus, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Draft' },
  active: { bg: 'bg-green-100', text: 'text-green-700', label: 'Active' },
  delayed: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Delayed' },
  emergency: { bg: 'bg-red-100', text: 'text-red-700', label: 'Emergency' },
  escalated: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Escalated' },
  completed: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Completed' },
  cancelled: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Cancelled' },
};

export default function TripDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchTrip = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient<{ trip: TripDetail }>(`/v1/trips/${id}`);
      setTrip(data.trip);
    } catch (err) {
      setError('Failed to load trip details.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  async function updateStatus(status: TripStatus) {
    setActionLoading(status);
    setActionError(null);
    try {
      await apiClient(`/v1/trips/${id}/status`, {
        method: 'PATCH',
        body: { status },
      });
      await fetchTrip();
    } catch (err) {
      setActionError('Failed to update status.');
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/trips"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Trips
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error ?? 'Trip not found.'}
        </div>
      </div>
    );
  }

  const statusStyle = STATUS_STYLE[trip.status];
  const originName = trip.origin?.name ?? `${trip.origin.latitude.toFixed(4)}, ${trip.origin.longitude.toFixed(4)}`;
  const destName = trip.destination?.name ?? `${trip.destination.latitude.toFixed(4)}, ${trip.destination.longitude.toFixed(4)}`;

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div>
        <Link
          href="/dashboard/trips"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Trips
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-dark">Trip Detail</h1>
            <p className="mt-0.5 text-xs text-slate-400 font-mono">{trip.id}</p>
          </div>
          <button
            onClick={fetchTrip}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => updateStatus('completed')}
          disabled={actionLoading !== null || trip.status === 'completed'}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          {actionLoading === 'completed' && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          )}
          Mark Safe
        </button>
        <button
          onClick={() => updateStatus('delayed')}
          disabled={actionLoading !== null || trip.status === 'delayed'}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          {actionLoading === 'delayed' && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          )}
          Mark Delayed
        </button>
        <button
          onClick={() => updateStatus('emergency')}
          disabled={actionLoading !== null || trip.status === 'emergency'}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {actionLoading === 'emergency' && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          )}
          Emergency
        </button>
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* Main details card */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-700">Trip Information</h2>
        </div>
        <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {/* Left column */}
          <div className="space-y-4 p-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Route</p>
              <div className="mt-1 flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-700">{originName}</p>
                  <p className="text-sm text-slate-500">→ {destName}</p>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Status</p>
              <div className="mt-1">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                  {statusStyle.label}
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Mode</p>
              <p className="mt-1 text-sm capitalize text-slate-700">{trip.tripMode}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Passenger Count</p>
              <p className="mt-1 text-sm text-slate-700">{trip.passengerCount}</p>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4 p-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Vehicle / Company</p>
              <div className="mt-1 flex items-center gap-2">
                <Car className="h-4 w-4 text-slate-400" />
                <p className="text-sm text-slate-700">
                  {trip.vehiclePlateNumber ?? trip.transportCompany ?? '—'}
                </p>
              </div>
            </div>
            {(trip.driverName || trip.driverPhone) && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Driver</p>
                <div className="mt-1 flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" />
                  <div>
                    {trip.driverName && <p className="text-sm text-slate-700">{trip.driverName}</p>}
                    {trip.driverPhone && <p className="text-xs text-slate-500">{trip.driverPhone}</p>}
                  </div>
                </div>
              </div>
            )}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Started At</p>
              <div className="mt-1 flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" />
                <p className="text-sm text-slate-700">
                  {trip.startedAt ? new Date(trip.startedAt).toLocaleString() : '—'}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Created At</p>
              <p className="mt-1 text-sm text-slate-700">{new Date(trip.createdAt).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Status history */}
      {trip.statusHistory && trip.statusHistory.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-700">Status History</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {trip.statusHistory.map((entry, i) => {
              const s = STATUS_STYLE[entry.status];
              return (
                <li key={i} className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
                      {s.label}
                    </span>
                    {entry.note && <p className="text-sm text-slate-500">{entry.note}</p>}
                  </div>
                  <p className="text-xs text-slate-400">{new Date(entry.changedAt).toLocaleString()}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
