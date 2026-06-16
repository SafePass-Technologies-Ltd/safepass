'use client';

import { useState, useEffect, useCallback } from 'react';
import { Car, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface Vehicle {
  id: string;
  organizationId: string;
  plateNumber: string;
  make: string | null;
  model: string | null;
  vehicleType: string | null;
  year: number | null;
  capacity: number | null;
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
}

type FilterMode = 'pending' | 'verified' | 'all';

export default function VehicleVerificationPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('pending');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.set('isVerified', filter === 'verified' ? 'true' : 'false');
      }
      const data = await apiClient<{ vehicles: Vehicle[] }>(
        `/v1/admin/vehicles?${params.toString()}`
      );
      setVehicles(data.vehicles ?? []);
    } catch {
      setError('Failed to load vehicles. Is the API server running?');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  async function setVerified(id: string, verified: boolean) {
    setPendingId(id);
    try {
      await apiClient(`/v1/admin/vehicles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isVerified: verified }),
      });
      setVehicles((prev) =>
        prev.map((v) => (v.id === id ? { ...v, isVerified: verified } : v))
      );
    } catch {
      setError('Failed to update vehicle verification status.');
    } finally {
      setPendingId(null);
    }
  }

  const FILTERS: { label: string; value: FilterMode }[] = [
    { label: 'Pending Review', value: 'pending' },
    { label: 'Verified', value: 'verified' },
    { label: 'All', value: 'all' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Vehicle Verification</h1>
          <p className="mt-1 text-sm text-slate-500">
            Approve or reject vehicles registered by transport partners.
          </p>
        </div>
        <button
          onClick={fetchVehicles}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              filter === f.value
                ? 'bg-primary text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : vehicles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Car className="h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-600">
            {filter === 'pending' ? 'No vehicles pending verification' : 'No vehicles found'}
          </h3>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">Plate Number</th>
                  <th className="px-6 py-3">Vehicle</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Capacity</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Registered</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vehicles.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 text-sm font-semibold text-slate-dark">
                      {v.plateNumber}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-600">
                      {[v.year, v.make, v.model].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-6 py-3 text-sm capitalize text-slate-500">
                      {v.vehicleType ?? '—'}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-500">
                      {v.capacity ?? '—'}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          v.isVerified
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {v.isVerified ? 'Verified' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-500">
                      {new Date(v.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        {!v.isVerified && (
                          <button
                            onClick={() => setVerified(v.id, true)}
                            disabled={pendingId === v.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-green-200 px-2.5 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-50 disabled:opacity-50"
                          >
                            <CheckCircle className="h-3.5 w-3.5" /> Approve
                          </button>
                        )}
                        {v.isVerified && (
                          <button
                            onClick={() => setVerified(v.id, false)}
                            disabled={pendingId === v.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" /> Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
