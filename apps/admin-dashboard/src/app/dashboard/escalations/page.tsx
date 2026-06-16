'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, RotateCcw, CheckCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface Escalation {
  id: string;
  tripId: string;
  emergencyEventId: string | null;
  escalatedBy: string;
  reason: string;
  notes: string | null;
  status: EscalationStatus;
  createdAt: string;
  resolvedAt: string | null;
}

type EscalationStatus = 'pending' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';

const STATUS_STYLE: Record<EscalationStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
  acknowledged: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Acknowledged' },
  in_progress: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'In Progress' },
  resolved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Resolved' },
  closed: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Closed' },
};

const STATUS_FILTERS: { label: string; value: EscalationStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Resolved', value: 'resolved' },
];

export default function EscalationsPage() {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<EscalationStatus | 'all'>('pending');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const fetchEscalations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const data = await apiClient<{ escalations: Escalation[] }>(
        `/v1/admin/escalations?${params.toString()}`
      );
      setEscalations(data.escalations);
    } catch {
      setError('Failed to load escalations.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchEscalations();
  }, [fetchEscalations]);

  async function resolve(id: string) {
    setPendingId(id);
    try {
      await apiClient(`/v1/admin/escalations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'resolved' }),
      });
      setEscalations((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: 'resolved' as const } : e))
      );
    } catch {
      setError('Failed to resolve escalation.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Escalation Workflow</h1>
          <p className="mt-1 text-sm text-slate-500">
            Active emergency escalations requiring officer attention.
          </p>
        </div>
        <button
          onClick={fetchEscalations}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

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

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : escalations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertTriangle className="h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-600">No escalations found</h3>
          <p className="mt-1 text-sm text-slate-400">
            {statusFilter === 'pending' ? 'No pending escalations — all clear.' : `No escalations with status "${statusFilter}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {escalations.map((esc) => {
            const style = STATUS_STYLE[esc.status];
            const isResolved = esc.status === 'resolved' || esc.status === 'closed';
            return (
              <div
                key={esc.id}
                className="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-sm"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-safety-red" />
                      <p className="text-sm font-semibold text-slate-dark">
                        Trip: <span className="font-mono">{esc.tripId.slice(0, 8)}…</span>
                      </p>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
                      >
                        {style.label}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">Reason:</span> {esc.reason}
                    </p>
                    {esc.notes && (
                      <p className="text-sm text-slate-500">
                        <span className="font-medium">Notes:</span> {esc.notes}
                      </p>
                    )}
                    <p className="text-xs text-slate-400">
                      Escalated {new Date(esc.createdAt).toLocaleString()}
                      {esc.resolvedAt && ` · Resolved ${new Date(esc.resolvedAt).toLocaleString()}`}
                    </p>
                  </div>

                  {!isResolved && (
                    <button
                      onClick={() => resolve(esc.id)}
                      disabled={pendingId === esc.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 px-3 py-2 text-xs font-medium text-green-700 transition-colors hover:bg-green-50 disabled:opacity-50"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      {pendingId === esc.id ? 'Resolving…' : 'Resolve'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
