'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Loader2, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getUserSession } from '@/lib/auth-utils';

interface Driver {
  id: string;
  fullName: string | null;
  phone: string | null;
  licenseNumber: string | null;
  status: string;
}

const emptyForm = { fullName: '', phone: '', licenseNumber: '' };

export default function DriversPage() {
  const session = getUserSession();
  const orgId = session?.orgId;

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    try {
      let data: { drivers?: Driver[]; staff?: Driver[] };
      try {
        data = await apiClient<{ drivers: Driver[] }>('/v1/drivers');
        setDrivers(data.drivers ?? []);
      } catch {
        if (!orgId) throw new Error('Organization not configured');
        data = await apiClient<{ staff: Driver[] }>(
          `/v1/organizations/${orgId}/staff?role=driver`,
        );
        setDrivers(data.staff ?? []);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load drivers');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient('/v1/drivers', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          licenseNumber: form.licenseNumber.trim(),
          organizationId: orgId,
        }),
      });
      setForm(emptyForm);
      setShowModal(false);
      await fetchDrivers();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to add driver');
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Drivers</h1>
          <p className="mt-1 text-sm text-slate-500">
            {drivers.length} driver{drivers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { setForm(emptyForm); setSaveError(null); setShowModal(true); }}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
        >
          <UserPlus className="h-4 w-4" /> Add Driver
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                {['Name', 'Phone', 'License Number', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {drivers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center">
                    <Users className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                    <p className="text-sm text-slate-400">No drivers yet. Add your first driver above.</p>
                  </td>
                </tr>
              ) : (
                drivers.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-dark">{d.fullName ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{d.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-500">
                      {d.licenseNumber ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <DriverStatusBadge status={d.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-dark">Add Driver</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1 hover:bg-slate-100">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {saveError && (
              <div className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{saveError}</div>
            )}

            <form onSubmit={handleAdd} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Full Name *</label>
                <input
                  type="text"
                  required
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  className={inputCls}
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Phone *</label>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className={inputCls}
                  placeholder="+234..."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">License Number *</label>
                <input
                  type="text"
                  required
                  value={form.licenseNumber}
                  onChange={(e) => setForm((f) => ({ ...f, licenseNumber: e.target.value }))}
                  className={inputCls}
                  placeholder="ABC12345678"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {saving ? 'Adding...' : 'Add Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DriverStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-50 text-green-700',
    inactive: 'bg-slate-100 text-slate-500',
    suspended: 'bg-red-50 text-red-600',
  };
  const cls = map[status] ?? 'bg-slate-100 text-slate-500';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}
