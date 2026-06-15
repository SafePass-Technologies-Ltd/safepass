'use client';

import { useState, useEffect, useCallback } from 'react';
import { Flag, Loader2, Plus } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getUserSession } from '@/lib/auth-utils';

interface Trip {
  id: string;
  userId: string;
  origin: { name: string };
  destination: { name: string };
  vehiclePlateNumber: string | null;
  driverName: string | null;
  passengerCount: number;
  tripMode: string;
  status: string;
  createdAt: string;
}

const defaultForm = {
  userId: '',
  originName: '',
  destinationName: '',
  vehiclePlateNumber: '',
  driverName: '',
  driverPhone: '',
  passengerCount: 1,
  tripMode: 'passenger' as 'driver' | 'passenger',
};

export default function TripsPage() {
  const session = getUserSession();
  const orgId = session?.orgId;

  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripsError, setTripsError] = useState<string | null>(null);

  const fetchTrips = useCallback(async () => {
    if (!orgId) return;
    setTripsLoading(true);
    try {
      const data = await apiClient<{ trips: Trip[] }>(`/v1/trips?organizationId=${orgId}`);
      setTrips(data.trips ?? []);
      setTripsError(null);
    } catch (err) {
      setTripsError(err instanceof Error ? err.message : 'Failed to load trips');
    } finally {
      setTripsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiClient('/v1/trips', {
        method: 'POST',
        body: JSON.stringify({
          userId: form.userId.trim(),
          origin: { name: form.originName.trim(), latitude: 0, longitude: 0 },
          destination: { name: form.destinationName.trim(), latitude: 0, longitude: 0 },
          vehiclePlateNumber: form.vehiclePlateNumber.trim() || undefined,
          driverName: form.driverName.trim() || undefined,
          driverPhone: form.driverPhone.trim() || undefined,
          passengerCount: form.passengerCount,
          tripMode: form.tripMode,
          organizationId: orgId,
        }),
      });
      setForm(defaultForm);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
      await fetchTrips();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to register trip');
    } finally {
      setSubmitting(false);
    }
  }

  function field(label: string, node: React.ReactNode) {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
        {node}
      </div>
    );
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20';

  if (!orgId) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Flag className="mb-4 h-12 w-12 text-slate-300" />
        <p className="text-slate-500">Complete company setup to register trips.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-dark">Trip Registration</h1>
        <p className="mt-1 text-sm text-slate-500">Register a new trip for a staff member</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {success && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm font-medium text-green-700">
            Trip registered successfully.
          </div>
        )}
        {submitError && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{submitError}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {field(
              'Staff Member (User ID / Email) *',
              <input
                type="text"
                required
                value={form.userId}
                onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                placeholder="User ID or email"
                className={inputCls}
              />,
            )}
            {field(
              'Origin *',
              <input
                type="text"
                required
                value={form.originName}
                onChange={(e) => setForm((f) => ({ ...f, originName: e.target.value }))}
                placeholder="e.g. Lagos Island"
                className={inputCls}
              />,
            )}
            {field(
              'Destination *',
              <input
                type="text"
                required
                value={form.destinationName}
                onChange={(e) => setForm((f) => ({ ...f, destinationName: e.target.value }))}
                placeholder="e.g. Victoria Island"
                className={inputCls}
              />,
            )}
            {field(
              'Vehicle Plate Number',
              <input
                type="text"
                value={form.vehiclePlateNumber}
                onChange={(e) => setForm((f) => ({ ...f, vehiclePlateNumber: e.target.value }))}
                placeholder="e.g. ABC-123-XY"
                className={inputCls}
              />,
            )}
            {field(
              'Driver Name',
              <input
                type="text"
                value={form.driverName}
                onChange={(e) => setForm((f) => ({ ...f, driverName: e.target.value }))}
                placeholder="Driver full name"
                className={inputCls}
              />,
            )}
            {field(
              'Driver Phone',
              <input
                type="tel"
                value={form.driverPhone}
                onChange={(e) => setForm((f) => ({ ...f, driverPhone: e.target.value }))}
                placeholder="+234..."
                className={inputCls}
              />,
            )}
            {field(
              'Passenger Count *',
              <input
                type="number"
                required
                min={1}
                value={form.passengerCount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, passengerCount: Math.max(1, parseInt(e.target.value) || 1) }))
                }
                className={inputCls}
              />,
            )}
            {field(
              'Trip Mode *',
              <div className="flex gap-2">
                {(['driver', 'passenger'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, tripMode: mode }))}
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium capitalize transition-colors ${
                      form.tripMode === mode
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>,
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {submitting ? 'Registering...' : 'Register Trip'}
            </button>
          </div>
        </form>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-dark">Recent Trips</h2>
        {tripsLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
          </div>
        ) : tripsError ? (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{tripsError}</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {['Staff ID', 'Origin', 'Destination', 'Mode', 'Passengers', 'Status', 'Date'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trips.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                      No trips registered yet.
                    </td>
                  </tr>
                ) : (
                  trips.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-mono text-slate-500">
                        {t.userId.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-dark">{t.origin.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-dark">{t.destination.name}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium capitalize text-primary">
                          {t.tripMode}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">{t.passengerCount}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-50 text-green-700',
    completed: 'bg-slate-100 text-slate-600',
    cancelled: 'bg-red-50 text-red-600',
    pending: 'bg-amber-50 text-amber-700',
  };
  const cls = map[status] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}
