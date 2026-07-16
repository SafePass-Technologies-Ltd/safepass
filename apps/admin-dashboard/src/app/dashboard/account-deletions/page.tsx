/// Admin Dashboard — Account Deletion Requests (Legal Hold Queue)
///
/// Backs A-27 "Account Deletion Oversight & Legal Holds" (screens.md
/// Screen 17c). Lists AccountDeletionRequest rows so an admin/super_admin
/// can see why a request is on legal hold (linked open Incident/
/// EmergencyEvent/Escalation IDs) and either resolve the underlying safety
/// record elsewhere in the dashboard, or -- super_admin only -- explicitly
/// override the hold with a logged justification reason.
'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import { UserMinus, RotateCcw, ShieldAlert } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface DeletionRequest {
  id: string;
  userId: string;
  status: 'pending' | 'cancelled' | 'legal_hold' | 'completed' | 'force_deleted';
  requestedAt: string;
  scheduledFor: string;
  legalHoldReason: string | null;
  legalHoldRefs: string[];
  cancelledAt: string | null;
  completedAt: string | null;
  forceDeletedBy: string | null;
  forceDeleteReason: string | null;
  holdOverriddenBy: string | null;
}

interface UserSummary {
  id: string;
  fullName: string;
  email: string | null;
}

type FilterMode = 'legal_hold' | 'pending' | 'completed' | 'all';

const FILTERS: { label: string; value: FilterMode }[] = [
  { label: 'Legal Hold', value: 'legal_hold' },
  { label: 'Pending', value: 'pending' },
  { label: 'Completed', value: 'completed' },
  { label: 'All', value: 'all' },
];

const STATUS_STYLES: Record<DeletionRequest['status'], string> = {
  pending: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-slate-100 text-slate-500',
  legal_hold: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
  force_deleted: 'bg-purple-100 text-purple-700',
};

const STATUS_LABELS: Record<DeletionRequest['status'], string> = {
  pending: 'Pending',
  cancelled: 'Cancelled',
  legal_hold: 'Legal Hold',
  completed: 'Completed',
  force_deleted: 'Force Deleted',
};

export default function AccountDeletionsPage() {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [users, setUsers] = useState<Record<string, UserSummary>>({});
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('legal_hold');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<DeletionRequest | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const isSuperAdmin = currentRole === 'super_admin';

  useEffect(() => {
    apiClient<{ role: string }>('/v1/users/me')
      .then((data) => setCurrentRole(data.role))
      .catch(() => setCurrentRole(null));
  }, []);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      const data = await apiClient<{ requests: DeletionRequest[] }>(
        `/v1/admin/account-deletions?${params.toString()}`
      );
      setRequests(data.requests ?? []);

      // Best-effort user name lookup -- failures fall back to the raw ID
      // rather than blocking the whole page (same pattern as role-upgrades).
      const userIds = Array.from(new Set(data.requests.map((r) => r.userId)));
      const userEntries = await Promise.all(
        userIds.map(async (id) => {
          try {
            const u = await apiClient<UserSummary>(`/v1/admin/users/${id}`);
            return [id, u] as const;
          } catch {
            return [id, { id, fullName: 'Unknown user', email: null }] as const;
          }
        })
      );
      setUsers(Object.fromEntries(userEntries));
    } catch {
      setError('Failed to load account deletion requests. Is the API server running?');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  function openOverrideDialog(request: DeletionRequest) {
    setOverrideReason('');
    setOverrideTarget(request);
  }

  async function confirmOverride() {
    if (!overrideTarget) return;
    const trimmed = overrideReason.trim();
    if (!trimmed) return;

    setPendingId(overrideTarget.id);
    try {
      await apiClient(`/v1/admin/account-deletions/${overrideTarget.id}/override`, {
        method: 'POST',
        body: { reason: trimmed },
      });
      setOverrideTarget(null);
      await fetchRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to override legal hold.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Account Deletion Requests</h1>
          <p className="mt-1 text-sm text-slate-500">
            Oversight for self-service account deletion — resolve legal holds and review the deletion audit trail.
          </p>
        </div>
        <button
          onClick={fetchRequests}
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
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <UserMinus className="h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-600">
            {filter === 'legal_hold' ? 'No deletions currently on legal hold' : 'No account deletion requests'}
          </h3>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">User</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Requested</th>
                  <th className="px-6 py-3">Scheduled</th>
                  <th className="px-6 py-3">Blocking Record(s)</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => {
                  const user = users[r.userId];
                  const isExpanded = expandedId === r.id;

                  return (
                    <Fragment key={r.id}>
                      <tr
                        className={`hover:bg-slate-50 ${r.status === 'legal_hold' ? 'cursor-pointer' : ''}`}
                        onClick={() =>
                          r.status === 'legal_hold' && setExpandedId(isExpanded ? null : r.id)
                        }
                      >
                        <td className="px-6 py-3 text-sm">
                          <div className="font-semibold text-slate-dark">
                            {user?.fullName ?? r.userId}
                          </div>
                          <div className="text-xs text-slate-500">{user?.email}</div>
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}
                          >
                            {STATUS_LABELS[r.status]}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-500">
                          {new Date(r.requestedAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-500">
                          {new Date(r.scheduledFor).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3">
                          {r.legalHoldRefs.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {r.legalHoldRefs.map((ref) => (
                                <span
                                  key={ref}
                                  className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600"
                                  title={ref}
                                >
                                  <ShieldAlert className="h-3 w-3" />
                                  {ref.slice(0, 8)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-3">
                          {r.status === 'legal_hold' ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openOverrideDialog(r);
                              }}
                              disabled={!isSuperAdmin}
                              title={!isSuperAdmin ? 'Only a super_admin can override a legal hold' : undefined}
                              className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Override Hold
                            </button>
                          ) : r.status === 'cancelled' ? (
                            <span className="text-xs text-slate-400">
                              Cancelled {r.cancelledAt ? new Date(r.cancelledAt).toLocaleDateString() : ''}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">
                              {r.completedAt ? new Date(r.completedAt).toLocaleDateString() : '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && r.status === 'legal_hold' && (
                        <tr className="bg-slate-50">
                          <td colSpan={6} className="px-6 py-4">
                            <p className="text-sm text-slate-600">{r.legalHoldReason}</p>
                            <p className="mt-2 text-xs text-slate-500">
                              Resolve the linked Incident/EmergencyEvent/Escalation record(s) above via
                              Incident Management or Escalation Workflow — the next hourly sweep will
                              automatically re-check and complete the deletion once no open records remain.
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {overrideTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-dark">Override legal hold</h2>
            <p className="mt-1 text-sm text-slate-500">
              This immediately executes the deletion cascade for{' '}
              {users[overrideTarget.userId]?.fullName ?? 'this user'}, bypassing the open safety hold.
              This action is logged with your name, reason, and timestamp.
            </p>
            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Justification reason (required)"
              rows={4}
              className="mt-4 w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setOverrideTarget(null)}
                disabled={pendingId === overrideTarget.id}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmOverride}
                disabled={pendingId === overrideTarget.id || !overrideReason.trim()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {pendingId === overrideTarget.id ? 'Overriding...' : 'Override & delete now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
