'use client';

import { useState, useEffect, useCallback } from 'react';
import { Flag, Loader2, Plus, Download } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getUserSession } from '@/lib/auth-utils';

interface Trip {
  id: string;
  userId: string;
  origin: { name: string };
  destination: { name: string };
  transportCompany: string | null;
  status: string;
  createdAt: string;
}

/** Enrolled org staff member, from GET /v1/organizations/:id/staff -- only
 * these are eligible to appear in the Staff Selector (docs/SafePass/
 * screens.md Screen 31: "Dropdown/search to select staff member (only
 * enrolled org members shown)"). */
interface StaffMember {
  id: string;
  fullName: string;
  email: string | null;
}

const defaultForm = {
  staffUserId: '',
  originName: '',
  destinationName: '',
  transportCompany: '',
  skipTransportCompany: false,
};

export default function TripsPage() {
  const session = getUserSession();
  const orgId = session?.orgId;

  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripsError, setTripsError] = useState<string | null>(null);

  const fetchStaff = useCallback(async () => {
    if (!orgId) return;
    setStaffLoading(true);
    try {
      const data = await apiClient<{ staff: StaffMember[] }>(`/v1/organizations/${orgId}/staff`);
      setStaff(data.staff ?? []);
    } catch {
      setStaff([]);
    } finally {
      setStaffLoading(false);
    }
  }, [orgId]);

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
    fetchStaff();
    fetchTrips();
  }, [fetchStaff, fetchTrips]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // userId here is the STAFF MEMBER being registered for, not the
      // caller -- POST /v1/trips now honors a different userId than the
      // caller's own when the caller is a corporate_admin (or
      // transport_partner/platform admin) registering on behalf of someone
      // in their org (see apps/api/src/routes/trip.routes.ts). It records
      // `registeredBy` as this corporate_admin automatically server-side.
      await apiClient('/v1/trips', {
        method: 'POST',
        body: JSON.stringify({
          userId: form.staffUserId,
          origin: { name: form.originName.trim(), latitude: 0, longitude: 0 },
          destination: { name: form.destinationName.trim(), latitude: 0, longitude: 0 },
          // Matches the mobile form's single "Transport company" field
          // (docs/SafePass/screens.md Screen 31) -- skip toggle omits it
          // entirely rather than sending an empty string.
          transportCompany: form.skipTransportCompany ? undefined : form.transportCompany.trim() || undefined,
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Trip Registration</h1>
          <p className="mt-1 text-sm text-slate-500">Register a new trip for a staff member</p>
        </div>
        {trips.length > 0 && (
          <button
            onClick={() => exportCsv(trips)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        )}
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
              'Staff Member *',
              <select
                required
                value={form.staffUserId}
                onChange={(e) => setForm((f) => ({ ...f, staffUserId: e.target.value }))}
                disabled={staffLoading}
                className={inputCls}
              >
                <option value="" disabled>
                  {staffLoading
                    ? 'Loading staff…'
                    : staff.length === 0
                      ? 'No enrolled staff members'
                      : 'Select a staff member'}
                </option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                    {s.email ? ` (${s.email})` : ''}
                  </option>
                ))}
              </select>,
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
              'Transport Company',
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={form.transportCompany}
                  onChange={(e) => setForm((f) => ({ ...f, transportCompany: e.target.value }))}
                  disabled={form.skipTransportCompany}
                  placeholder="e.g. ABC Logistics"
                  className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`}
                />
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={form.skipTransportCompany}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, skipTransportCompany: e.target.checked, transportCompany: '' }))
                    }
                  />
                  Skip / Not applicable
                </label>
              </div>,
            )}
          </div>

          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            Covered by your organization&apos;s subscription — no per-trip charge.
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || staffLoading || staff.length === 0}
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
                  {['Staff ID', 'Origin', 'Destination', 'Status', 'Date'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trips.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
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

function exportCsv(trips: Trip[]) {
  const headers = ['ID', 'Staff ID', 'Origin', 'Destination', 'Status', 'Date'];
  const rows = trips.map((t) => [
    t.id,
    t.userId,
    t.origin.name,
    t.destination.name,
    t.status,
    new Date(t.createdAt).toISOString(),
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trips-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
