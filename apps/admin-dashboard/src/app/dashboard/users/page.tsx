'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import { Search, UserCheck, UserX, RotateCcw, Users, Trash2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface DeletionRequestSummary {
  id: string;
  status: 'pending' | 'cancelled' | 'legal_hold' | 'completed' | 'force_deleted';
  scheduledFor: string;
}

interface User {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  deletedAt?: string | null;
  /** Only populated when fetched via GET /v1/admin/users/:id (detail lookup), not the list endpoint. */
  deletionRequest?: DeletionRequestSummary | null;
}

type RoleFilter = 'all' | 'user' | 'admin' | 'monitoring_officer' | 'super_admin';

const ROLE_FILTERS: { label: string; value: RoleFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Users', value: 'user' },
  { label: 'Admin', value: 'admin' },
  { label: 'Monitoring', value: 'monitoring_officer' },
];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailUsers, setDetailUsers] = useState<Record<string, User>>({});
  const [forceDeleteTarget, setForceDeleteTarget] = useState<User | null>(null);
  const [forceDeleteReason, setForceDeleteReason] = useState('');

  const isSuperAdmin = currentRole === 'super_admin';

  useEffect(() => {
    apiClient<{ role: string }>('/v1/users/me')
      .then((data) => setCurrentRole(data.role))
      .catch(() => setCurrentRole(null));
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter !== 'all') params.set('role', roleFilter);
      const data = await apiClient<{ users: User[] }>(
        `/v1/admin/users?${params.toString()}`
      );
      setUsers(data.users);
    } catch {
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function toggleSuspend(user: User) {
    setPendingId(user.id);
    try {
      await apiClient(`/v1/admin/users/${user.id}/suspend`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u))
      );
    } catch {
      setError('Failed to update user status.');
    } finally {
      setPendingId(null);
    }
  }

  // M-38/A-27: fetch the full user detail (including deletionRequest, only
  // returned by the single-user GET, not the list endpoint) on demand when
  // a row is expanded, rather than N+1 fetching it for every row up front.
  async function toggleExpand(user: User) {
    if (expandedId === user.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(user.id);
    if (!detailUsers[user.id]) {
      try {
        const detail = await apiClient<User>(`/v1/admin/users/${user.id}`);
        setDetailUsers((prev) => ({ ...prev, [user.id]: detail }));
      } catch {
        setError('Failed to load user detail.');
      }
    }
  }

  function openForceDeleteDialog(user: User) {
    setForceDeleteReason('');
    setForceDeleteTarget(user);
  }

  async function confirmForceDelete() {
    if (!forceDeleteTarget) return;
    const trimmed = forceDeleteReason.trim();
    if (!trimmed) return;

    setPendingId(forceDeleteTarget.id);
    try {
      await apiClient(`/v1/admin/users/${forceDeleteTarget.id}/force-delete`, {
        method: 'POST',
        body: { reason: trimmed },
      });
      setForceDeleteTarget(null);
      // Refresh this user's detail so the expanded row reflects the new status.
      const detail = await apiClient<User>(`/v1/admin/users/${forceDeleteTarget.id}`);
      setDetailUsers((prev) => ({ ...prev, [forceDeleteTarget.id]: detail }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to force-delete account.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">User Management</h1>
          <p className="mt-1 text-sm text-slate-500">Manage accounts and access levels.</p>
        </div>
        <button
          onClick={fetchUsers}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setRoleFilter(f.value)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                roleFilter === f.value
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary sm:w-72"
          />
        </div>
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
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-600">No users found</h3>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Joined</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => {
                  const isExpanded = expandedId === user.id;
                  const detail = detailUsers[user.id];
                  const deletionRequest = detail?.deletionRequest;

                  return (
                    <Fragment key={user.id}>
                      <tr className="cursor-pointer hover:bg-slate-50" onClick={() => toggleExpand(user)}>
                        <td className="px-6 py-3">
                          <p className="text-sm font-medium text-slate-700">
                            {user.fullName ?? '—'}
                          </p>
                          <p className="text-xs text-slate-400">{user.phone ?? ''}</p>
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-600">{user.email ?? '—'}</td>
                        <td className="px-6 py-3">
                          <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium capitalize text-primary">
                            {user.role.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              user.isActive
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-600'
                            }`}
                          >
                            {user.isActive ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-500">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSuspend(user);
                            }}
                            disabled={pendingId === user.id}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                              user.isActive
                                ? 'border border-red-200 text-red-600 hover:bg-red-50'
                                : 'border border-green-200 text-green-700 hover:bg-green-50'
                            }`}
                          >
                            {user.isActive ? (
                              <>
                                <UserX className="h-3.5 w-3.5" /> Suspend
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-3.5 w-3.5" /> Activate
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50">
                          <td colSpan={6} className="px-6 py-4">
                            {/* M-38/A-27: Deletion Status Note (screens.md Screen 15) */}
                            {deletionRequest &&
                            (deletionRequest.status === 'pending' || deletionRequest.status === 'legal_hold') ? (
                              <p className="text-sm text-slate-600">
                                {deletionRequest.status === 'pending'
                                  ? `Account scheduled for deletion on ${new Date(deletionRequest.scheduledFor).toLocaleDateString()}`
                                  : 'Deletion on hold — see Legal Hold Queue'}{' '}
                                <a href="/dashboard/account-deletions" className="text-primary underline">
                                  View in Account Deletions
                                </a>
                              </p>
                            ) : deletionRequest?.status === 'completed' || deletionRequest?.status === 'force_deleted' ? (
                              <p className="text-sm text-slate-500">
                                Account deleted{' '}
                                {deletionRequest.status === 'force_deleted' ? '(force-deleted by an admin)' : ''}
                              </p>
                            ) : (
                              <p className="text-sm text-slate-400">No account deletion request on file.</p>
                            )}

                            {/* Force Delete (super_admin only, screens.md Screen 15) */}
                            {isSuperAdmin && !detail?.deletedAt && deletionRequest?.status !== 'completed' && deletionRequest?.status !== 'force_deleted' && (
                              <button
                                onClick={() => openForceDeleteDialog(user)}
                                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Force Delete Account
                              </button>
                            )}
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

      {!loading && (
        <p className="text-xs text-slate-400">
          Showing {users.length} user{users.length !== 1 ? 's' : ''}
        </p>
      )}

      {forceDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-dark">Force delete account</h2>
            <p className="mt-1 text-sm text-slate-500">
              This immediately deletes {forceDeleteTarget.fullName ?? 'this user'}&rsquo;s account,
              bypassing the 14-day cooling-off period. Blocked by an open legal hold unless already
              overridden. This action is logged with your name, reason, and timestamp.
            </p>
            <textarea
              value={forceDeleteReason}
              onChange={(e) => setForceDeleteReason(e.target.value)}
              placeholder="Justification reason (required)"
              rows={4}
              className="mt-4 w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setForceDeleteTarget(null)}
                disabled={pendingId === forceDeleteTarget.id}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmForceDelete}
                disabled={pendingId === forceDeleteTarget.id || !forceDeleteReason.trim()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {pendingId === forceDeleteTarget.id ? 'Deleting...' : 'Force delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
