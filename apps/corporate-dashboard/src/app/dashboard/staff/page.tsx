/// Corporate Dashboard — Staff Management (C-02)
///
/// Add, view, and remove staff members for the organization.
/// Organization ID is sourced from the JWT payload (orgId claim).
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Users, UserPlus, Trash2, Search, Loader2, Ticket } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getUserSession } from '@/lib/auth-utils';

interface StaffMember {
  userId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  role: string;
}

export default function StaffPage() {
  const session = getUserSession();
  const orgId = session?.orgId;

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const fetchStaff = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await apiClient<{ staff: StaffMember[] }>(
        `/v1/organizations/${orgId}/staff`
      );
      setStaff(data.staff);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !newUserId.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      await apiClient(`/v1/organizations/${orgId}/staff`, {
        method: 'POST',
        body: JSON.stringify({ userId: newUserId.trim() }),
      });
      setNewUserId('');
      setShowAddModal(false);
      await fetchStaff();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add staff');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveStaff(userId: string) {
    if (!orgId) return;
    if (!confirm('Remove this staff member from the organization?')) return;
    try {
      await apiClient(`/v1/organizations/${orgId}/staff/${userId}`, {
        method: 'DELETE',
      });
      await fetchStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove staff');
    }
  }

  // Filter staff by search term.
  const filteredStaff = staff.filter((s) => {
    const term = search.toLowerCase();
    return (
      (s.fullName?.toLowerCase().includes(term) ?? false) ||
      (s.email?.toLowerCase().includes(term) ?? false) ||
      (s.phone?.includes(term) ?? false)
    );
  });

  // ── States ──
  if (!orgId) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Users className="mb-4 h-12 w-12 text-slate-300" />
        <p className="text-slate-500">Complete company setup to manage staff.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Staff Management</h1>
          <p className="mt-1 text-sm text-slate-500">
            {staff.length} staff member{staff.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/slots"
            className="flex items-center gap-2 rounded-xl border border-primary/30 px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
          >
            <Ticket className="h-4 w-4" />
            Manage Slots &amp; Tokens
          </Link>
          <Link
            href="/dashboard/slots"
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
          >
            <UserPlus className="h-4 w-4" />
            Add Staff
          </Link>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or phone..."
          className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Staff Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                Phone
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                Role
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredStaff.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                  {search ? 'No staff matching your search.' : 'No staff members yet. Add your first staff member above.'}
                </td>
              </tr>
            ) : (
              filteredStaff.map((s) => (
                <tr key={s.userId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-dark">
                    {s.fullName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {s.email ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {s.phone ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {s.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRemoveStaff(s.userId)}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      title="Remove staff"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-dark">Add Staff Member</h2>
            <p className="mt-1 text-sm text-slate-500">
              Enter the user ID of the staff member to add.
            </p>

            {addError && (
              <div className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">
                {addError}
              </div>
            )}

            <form onSubmit={handleAddStaff} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  User ID *
                </label>
                <input
                  type="text"
                  required
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  placeholder="UUID of the staff member"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding || !newUserId.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {adding ? 'Adding...' : 'Add Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
