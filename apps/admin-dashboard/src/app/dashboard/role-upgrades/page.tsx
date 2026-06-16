/// Admin Dashboard — Role Upgrade Approval Workflow
///
/// Lists pending requests created when a user submits corporate/transport
/// org onboarding (or is manually flagged for admin/super_admin/monitoring_officer
/// elevation). Approving an admin/super_admin request requires the logged-in
/// reviewer to be super_admin — regular admins see a disabled button with a
/// tooltip explaining why.
'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, CheckCircle, XCircle, RotateCcw, Info } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface RoleUpgradeRequest {
  id: string;
  userId: string;
  requestedRole: 'admin' | 'super_admin' | 'corporate_admin' | 'transport_partner' | 'monitoring_officer';
  organizationId: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reason: string | null;
  createdAt: string;
}

interface UserSummary {
  id: string;
  fullName: string;
  email: string;
}

interface OrgSummary {
  id: string;
  name: string;
}

type FilterMode = 'pending' | 'approved' | 'rejected' | 'all';

const ROLE_LABELS: Record<RoleUpgradeRequest['requestedRole'], string> = {
  admin: 'Admin',
  super_admin: 'Super Admin',
  corporate_admin: 'Corporate Admin',
  transport_partner: 'Transport Partner',
  monitoring_officer: 'Monitoring Officer',
};

const SUPER_ADMIN_GATED_ROLES: ReadonlySet<RoleUpgradeRequest['requestedRole']> = new Set([
  'admin',
  'super_admin',
]);

export default function RoleUpgradesPage() {
  const [requests, setRequests] = useState<RoleUpgradeRequest[]>([]);
  const [users, setUsers] = useState<Record<string, UserSummary>>({});
  const [orgs, setOrgs] = useState<Record<string, OrgSummary>>({});
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('pending');
  const [pendingId, setPendingId] = useState<string | null>(null);

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
      if (filter !== 'all') {
        params.set('status', filter);
      }
      const data = await apiClient<{ requests: RoleUpgradeRequest[] }>(
        `/v1/admin/role-upgrades?${params.toString()}`
      );
      setRequests(data.requests ?? []);

      // Fetch user and org names for display. Best-effort — failures fall
      // back to showing the raw ID rather than blocking the whole page.
      const userIds = Array.from(new Set(data.requests.map((r) => r.userId)));
      const orgIds = Array.from(
        new Set(data.requests.map((r) => r.organizationId).filter((id): id is string => Boolean(id)))
      );

      const userEntries = await Promise.all(
        userIds.map(async (id) => {
          try {
            const u = await apiClient<UserSummary>(`/v1/admin/users/${id}`);
            return [id, u] as const;
          } catch {
            return [id, { id, fullName: 'Unknown user', email: '' }] as const;
          }
        })
      );
      setUsers(Object.fromEntries(userEntries));

      const orgEntries = await Promise.all(
        orgIds.map(async (id) => {
          try {
            const o = await apiClient<OrgSummary>(`/v1/organizations/${id}`);
            return [id, o] as const;
          } catch {
            return [id, { id, name: 'Unknown organization' }] as const;
          }
        })
      );
      setOrgs(Object.fromEntries(orgEntries));
    } catch {
      setError('Failed to load role upgrade requests. Is the API server running?');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  async function review(id: string, action: 'approve' | 'reject') {
    setPendingId(id);
    try {
      await apiClient(`/v1/admin/role-upgrades/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      await fetchRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update request.');
    } finally {
      setPendingId(null);
    }
  }

  const FILTERS: { label: string; value: FilterMode }[] = [
    { label: 'Pending Review', value: 'pending' },
    { label: 'Approved', value: 'approved' },
    { label: 'Rejected', value: 'rejected' },
    { label: 'All', value: 'all' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Role Upgrade Requests</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review and approve requests for corporate, transport, and admin-level access.
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
          <ShieldCheck className="h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-600">
            {filter === 'pending' ? 'No role upgrade requests pending' : 'No requests found'}
          </h3>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">User</th>
                  <th className="px-6 py-3">Requested Role</th>
                  <th className="px-6 py-3">Organization</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Requested</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => {
                  const user = users[r.userId];
                  const org = r.organizationId ? orgs[r.organizationId] : null;
                  const gated = SUPER_ADMIN_GATED_ROLES.has(r.requestedRole);
                  const canReview = !gated || currentRole === 'super_admin';

                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 text-sm">
                        <div className="font-semibold text-slate-dark">{user?.fullName ?? r.userId}</div>
                        <div className="text-xs text-slate-500">{user?.email}</div>
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-slate-600">
                        {ROLE_LABELS[r.requestedRole]}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-500">{org?.name ?? '—'}</td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            r.status === 'approved'
                              ? 'bg-green-100 text-green-700'
                              : r.status === 'rejected'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {r.status === 'pending' ? 'Pending' : r.status === 'approved' ? 'Approved' : 'Rejected'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-500">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3">
                        {r.status === 'pending' ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => review(r.id, 'approve')}
                              disabled={pendingId === r.id || !canReview}
                              title={
                                !canReview
                                  ? 'Only a super_admin can approve admin/super_admin role upgrades'
                                  : undefined
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-green-200 px-2.5 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <CheckCircle className="h-3.5 w-3.5" /> Approve
                            </button>
                            <button
                              onClick={() => review(r.id, 'reject')}
                              disabled={pendingId === r.id || !canReview}
                              title={
                                !canReview
                                  ? 'Only a super_admin can reject admin/super_admin role upgrades'
                                  : undefined
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <XCircle className="h-3.5 w-3.5" /> Reject
                            </button>
                            {!canReview && (
                              <span className="inline-flex items-center text-slate-400" title="Requires super_admin">
                                <Info className="h-4 w-4" />
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString() : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
