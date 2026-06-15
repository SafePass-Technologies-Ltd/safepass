'use client';

import { useState, useEffect, useCallback } from 'react';
import { RotateCcw, CheckCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface CheckIn {
  id: string;
  userId: string;
  tripId: string;
  userName?: string;
  userEmail?: string;
  checkedInAt: string;
  location?: { latitude: number; longitude: number };
  status?: string;
}

export default function CheckInsPage() {
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCheckIns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient<{ checkIns: CheckIn[] }>('/v1/admin/checkins');
      setCheckIns(data.checkIns ?? []);
    } catch (err) {
      setError('Check-in data is not yet available from the API.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCheckIns();
  }, [fetchCheckIns]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Check-In Log</h1>
          <p className="mt-1 text-sm text-slate-500">Passenger check-in records across all trips.</p>
        </div>
        <button
          onClick={fetchCheckIns}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-center">
          <CheckCircle className="h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-600">Check-ins Coming Soon</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            The check-in log endpoint is not yet available. This page will automatically display
            check-in data once the API is ready.
          </p>
          <button
            onClick={fetchCheckIns}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            <RotateCcw className="h-4 w-4" />
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && checkIns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle className="h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-600">No check-ins yet</h3>
          <p className="mt-1 text-sm text-slate-400">Check-in records will appear here.</p>
        </div>
      )}

      {!loading && !error && checkIns.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">User / Passenger</th>
                  <th className="px-6 py-3">Trip ID</th>
                  <th className="px-6 py-3">Check-in Time</th>
                  <th className="px-6 py-3">Location</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {checkIns.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-6 py-3">
                      <p className="text-sm font-medium text-slate-700">
                        {c.userName ?? c.userEmail ?? c.userId}
                      </p>
                      {c.userEmail && c.userName && (
                        <p className="text-xs text-slate-400">{c.userEmail}</p>
                      )}
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-slate-500">{c.tripId}</td>
                    <td className="px-6 py-3 text-sm text-slate-600">
                      {new Date(c.checkedInAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-500">
                      {c.location
                        ? `${c.location.latitude.toFixed(4)}, ${c.location.longitude.toFixed(4)}`
                        : '—'}
                    </td>
                    <td className="px-6 py-3">
                      {c.status ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          {c.status}
                        </span>
                      ) : (
                        '—'
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
          Showing {checkIns.length} check-in{checkIns.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
