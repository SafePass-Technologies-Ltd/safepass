'use client';

import { useState, useEffect, useCallback } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type IncidentStatus = 'pending' | 'verified';

interface Incident {
  id: string;
  type: string;
  description: string;
  location?: { latitude: number; longitude: number; address?: string };
  status: IncidentStatus;
  reportedAt: string;
  createdAt: string;
}

const STATUS_FILTERS: { label: string; value: IncidentStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Verified', value: 'verified' },
];

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | 'all'>('all');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient<{ incidents: Incident[] }>('/v1/incidents');
      setIncidents(data.incidents ?? []);
    } catch (err) {
      setError('Failed to load incidents.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  async function handleVerify(id: string) {
    setVerifyingId(id);
    try {
      await apiClient(`/v1/incidents/${id}/verify`, { method: 'PATCH' });
      setIncidents((prev) =>
        prev.map((inc) => (inc.id === id ? { ...inc, status: 'verified' } : inc))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setVerifyingId(null);
    }
  }

  const displayed =
    statusFilter === 'all' ? incidents : incidents.filter((i) => i.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Incidents</h1>
          <p className="mt-1 text-sm text-slate-500">Review and verify reported incidents.</p>
        </div>
        <button
          onClick={fetchIncidents}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filter pills */}
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

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {!loading && !error && displayed.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertTriangle className="h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-600">No incidents found</h3>
          <p className="mt-1 text-sm text-slate-400">
            {statusFilter === 'all' ? 'No incidents have been reported.' : `No ${statusFilter} incidents.`}
          </p>
        </div>
      )}

      {!loading && !error && displayed.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3">Location</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Reported At</th>
                  <th className="px-6 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayed.map((inc) => (
                  <tr key={inc.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-6 py-3 text-sm font-medium text-slate-700 capitalize">
                      {inc.type}
                    </td>
                    <td className="px-6 py-3 max-w-xs">
                      <p className="truncate text-sm text-slate-600">{inc.description}</p>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-500">
                      {inc.location?.address ??
                        (inc.location
                          ? `${inc.location.latitude.toFixed(4)}, ${inc.location.longitude.toFixed(4)}`
                          : '—')}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          inc.status === 'verified'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {inc.status === 'verified' ? 'Verified' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-500">
                      {new Date(inc.reportedAt ?? inc.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-3">
                      {inc.status !== 'verified' && (
                        <button
                          onClick={() => handleVerify(inc.id)}
                          disabled={verifyingId === inc.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                        >
                          {verifyingId === inc.id && (
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          )}
                          Verify
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && (
        <p className="text-xs text-slate-400">
          Showing {displayed.length} incident{displayed.length !== 1 ? 's' : ''}
          {statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''}
        </p>
      )}
    </div>
  );
}
