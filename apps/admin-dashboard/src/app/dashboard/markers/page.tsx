'use client';

import { useState, useEffect, useCallback } from 'react';
import { RotateCcw, MapPin } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface MapMarker {
  id: string;
  type: string;
  description?: string;
  location: { latitude: number; longitude: number };
  status: string;
  verifyCount?: number;
  disputeCount?: number;
  createdAt: string;
}

export default function MarkersPage() {
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchMarkers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient<{ markers: MapMarker[] }>('/v1/admin/markers');
      setMarkers(data.markers ?? []);
    } catch (err) {
      setError('Failed to load map markers.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkers();
  }, [fetchMarkers]);

  async function handleAction(id: string, action: 'verify' | 'reject') {
    setActionId(`${id}-${action}`);
    try {
      // The backend's PATCH /v1/admin/markers/:id (see
      // apps/api/src/routes/map-marker.routes.ts's MarkerUpdateSchema)
      // takes a `verificationStatus` enum value, not an `action` verb --
      // sending { action } was silently ignored (zod isn't .strict()) and
      // never actually changed anything.
      await apiClient(`/v1/admin/markers/${id}`, {
        method: 'PATCH',
        body:
          action === 'verify'
            ? { verificationStatus: 'verified' }
            // Per README's cold-start strategy: "Rejected -- admin
            // explicitly rejects as false/malicious -- hidden from map."
            // isActive: false is what actually hides it (verification
            // status alone doesn't affect map/nearby-query visibility).
            : { verificationStatus: 'rejected', isActive: false },
      });
      await fetchMarkers();
    } catch (err) {
      console.error(err);
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Map Markers</h1>
          <p className="mt-1 text-sm text-slate-500">Verify and manage community-submitted map markers.</p>
        </div>
        <button
          onClick={fetchMarkers}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
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

      {!loading && !error && markers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MapPin className="h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-600">No markers found</h3>
          <p className="mt-1 text-sm text-slate-400">No map markers have been submitted yet.</p>
        </div>
      )}

      {!loading && !error && markers.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3">Location</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Verify / Dispute</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {markers.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-6 py-3 text-sm font-medium text-slate-700 capitalize">
                      {m.type}
                    </td>
                    <td className="px-6 py-3 max-w-xs">
                      <p className="truncate text-sm text-slate-600">{m.description ?? '—'}</p>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-500">
                      {m.location.latitude.toFixed(4)}, {m.location.longitude.toFixed(4)}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          m.status === 'verified'
                            ? 'bg-green-100 text-green-700'
                            : m.status === 'rejected'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-500">
                      <span className="text-green-600">{m.verifyCount ?? 0} verify</span>
                      {' / '}
                      <span className="text-red-500">{m.disputeCount ?? 0} dispute</span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAction(m.id, 'verify')}
                          disabled={actionId !== null || m.status === 'verified'}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                        >
                          {actionId === `${m.id}-verify` && (
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          )}
                          Verify
                        </button>
                        <button
                          onClick={() => handleAction(m.id, 'reject')}
                          disabled={actionId !== null || m.status === 'rejected'}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                        >
                          {actionId === `${m.id}-reject` && (
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          )}
                          Reject
                        </button>
                      </div>
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
          Showing {markers.length} marker{markers.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
