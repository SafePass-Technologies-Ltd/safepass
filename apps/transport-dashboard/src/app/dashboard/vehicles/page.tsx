'use client';

import { useState, useEffect, useCallback } from 'react';
import { Car, Plus, Loader2, X, Pencil } from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

interface Vehicle {
  id: string;
  plateNumber: string;
  make: string | null;
  model: string | null;
  vehicleType: string | null;
  capacity: number | null;
  year: number | null;
  status: string;
  isVerified: boolean;
  qrCodeUrl: string | null;
}

const emptyForm = {
  plateNumber: '',
  make: '',
  model: '',
  vehicleType: 'sedan',
  capacity: '',
  year: '',
};

const VEHICLE_TYPES = ['sedan', 'suv', 'bus', 'truck', 'motorcycle'];

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient<{ vehicles: Vehicle[] }>('/v1/vehicles');
      setVehicles(data.vehicles ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm);
    setSaveError(null);
    setShowModal(true);
  }

  function openEdit(v: Vehicle) {
    setEditTarget(v);
    setForm({
      plateNumber: v.plateNumber,
      make: v.make ?? '',
      model: v.model ?? '',
      vehicleType: v.vehicleType ?? 'sedan',
      capacity: v.capacity?.toString() ?? '',
      year: v.year?.toString() ?? '',
    });
    setSaveError(null);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    const payload = {
      plateNumber: form.plateNumber.trim(),
      make: form.make.trim() || undefined,
      model: form.model.trim() || undefined,
      vehicleType: form.vehicleType || undefined,
      capacity: form.capacity ? parseInt(form.capacity) : undefined,
      year: form.year ? parseInt(form.year) : undefined,
    };
    try {
      if (editTarget) {
        await apiClient(`/v1/vehicles/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiClient('/v1/vehicles', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setShowModal(false);
      await fetchVehicles();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save vehicle');
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
          <h1 className="text-2xl font-bold text-slate-dark">Vehicles</h1>
          <p className="mt-1 text-sm text-slate-500">{vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} in fleet</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add Vehicle
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
                {['Plate Number', 'Make', 'Model', 'Type', 'Status', 'Capacity', 'Verification', 'QR', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vehicles.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <Car className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                    <p className="text-sm text-slate-400">No vehicles yet. Add your first vehicle above.</p>
                  </td>
                </tr>
              ) : (
                vehicles.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-semibold">
                      <Link href={`/dashboard/vehicles/${v.id}`} className="text-primary hover:underline">
                        {v.plateNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{v.make ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{v.model ?? '—'}</td>
                    <td className="px-4 py-3 text-sm capitalize text-slate-500">{v.vehicleType ?? '—'}</td>
                    <td className="px-4 py-3">
                      <VehicleStatusBadge status={v.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{v.capacity ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          v.isVerified ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {v.isVerified ? 'Verified' : 'Unverified'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          v.qrCodeUrl ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {v.qrCodeUrl ? 'Generated' : 'Not generated'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEdit(v)}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
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
              <h2 className="text-lg font-bold text-slate-dark">
                {editTarget ? 'Edit Vehicle' : 'Add Vehicle'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1 hover:bg-slate-100"
              >
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {saveError && (
              <div className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{saveError}</div>
            )}

            <form onSubmit={handleSave} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Plate Number *</label>
                <input
                  type="text"
                  required
                  value={form.plateNumber}
                  onChange={(e) => setForm((f) => ({ ...f, plateNumber: e.target.value }))}
                  className={inputCls}
                  placeholder="e.g. ABC-123-XY"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Make</label>
                  <input
                    type="text"
                    value={form.make}
                    onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))}
                    className={inputCls}
                    placeholder="Toyota"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Model</label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                    className={inputCls}
                    placeholder="Corolla"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Vehicle Type</label>
                <select
                  value={form.vehicleType}
                  onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value }))}
                  className={inputCls}
                >
                  {VEHICLE_TYPES.map((t) => (
                    <option key={t} value={t} className="capitalize">
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Capacity</label>
                  <input
                    type="number"
                    min={1}
                    value={form.capacity}
                    onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                    className={inputCls}
                    placeholder="5"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Year</label>
                  <input
                    type="number"
                    min={1990}
                    max={new Date().getFullYear() + 1}
                    value={form.year}
                    onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                    className={inputCls}
                    placeholder="2022"
                  />
                </div>
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
                  {saving ? 'Saving...' : editTarget ? 'Save Changes' : 'Add Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function VehicleStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-50 text-green-700',
    inactive: 'bg-slate-100 text-slate-500',
    maintenance: 'bg-amber-50 text-amber-700',
  };
  const cls = map[status] ?? 'bg-slate-100 text-slate-500';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}
