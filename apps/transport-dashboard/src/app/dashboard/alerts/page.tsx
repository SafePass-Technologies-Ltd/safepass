'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, RotateCcw, AlertTriangle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface EmergencyEvent {
  id: string;
  tripId: string;
  type: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
}

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  active: { bg: 'bg-red-100', text: 'text-red-700' },
  acknowledged: { bg: 'bg-amber-100', text: 'text-amber-700' },
  escalated: { bg: 'bg-purple-100', text: 'text-purple-700' },
  resolved_false_alarm: { bg: 'bg-slate-100', text: 'text-slate-500' },
  resolved_incident: { bg: 'bg-green-100', text: 'text-green-700' },
};

const POLL_INTERVAL_MS = 15_000;

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<EmergencyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchAlerts() {
    setError(null);
    try {
      const data = await apiClient<{ emergencies: EmergencyEvent[] }>(
        `/v1/admin/emergencies?status=active&limit=50`
      );
      setAlerts(data.emergencies ?? []);
    } catch {
      setError('Failed to load alerts. Is the API server running?');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAlerts();
    intervalRef.current = setInterval(fetchAlerts, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Safety Alerts</h1>
          <p className="mt-1 text-sm text-slate-500">
            Emergency alerts for trips using your fleet. Auto-refreshes every 15 seconds.
          </p>
        </div>
        <button
          onClick={fetchAlerts}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        Live — polling every {POLL_INTERVAL_MS / 1000}s
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
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Bell className="h-14 w-14 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-600">No active alerts</h3>
          <p className="mt-1 text-sm text-slate-400">
            No safety alerts for trips linked to your fleet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const style = STATUS_STYLE[alert.status] ?? { bg: 'bg-slate-100', text: 'text-slate-600' };
            return (
              <div
                key={alert.id}
                className="flex items-start gap-4 rounded-xl border border-red-200 bg-red-50 p-5"
              >
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-dark">
                      Trip <span className="font-mono">{alert.tripId.slice(0, 8)}…</span>
                    </p>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${style.bg} ${style.text}`}
                    >
                      {alert.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Triggered {new Date(alert.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
