/// Admin Dashboard — Request Staff Access
///
/// Landing spot for any authenticated user whose role doesn't already grant
/// admin dashboard access (see dashboard/layout.tsx's role gate, which
/// redirects here). Lets them submit a self-service role upgrade request
/// (admin or monitoring_officer) and shows the status of any existing
/// request instead of a bare, resubmittable form once one exists.
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Clock, XCircle, LogOut } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type RequestableRole = 'admin' | 'monitoring_officer';

interface RoleUpgradeRequest {
  id: string;
  requestedRole: RequestableRole;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  createdAt: string;
}

const STAFF_ROLES = new Set(['admin', 'super_admin', 'monitoring_officer']);

const ROLE_OPTIONS: { value: RequestableRole; label: string; description: string }[] = [
  {
    value: 'monitoring_officer',
    label: 'Monitoring Officer',
    description: 'Monitor live trips, respond to alerts, message travellers, and log check-ins.',
  },
  {
    value: 'admin',
    label: 'Administrator',
    description: 'Full platform access — user management, payments, incident/marker review, and approving other staff requests.',
  },
];

export default function RequestAccessPage() {
  const router = useRouter();
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [existingRequest, setExistingRequest] = useState<RoleUpgradeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<RequestableRole>('monitoring_officer');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [me, mine] = await Promise.all([
        apiClient<{ role: string }>('/v1/users/me'),
        apiClient<{ request: RoleUpgradeRequest | null }>('/v1/role-upgrades/mine'),
      ]);
      setCurrentRole(me.role);
      setExistingRequest(mine.request);

      // Already has staff access (e.g. approved since this tab was opened,
      // or landed here by mistake) -- no reason to stay on this page.
      if (STAFF_ROLES.has(me.role)) {
        router.replace('/dashboard');
      }
    } catch {
      setError('Failed to load your account status.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const request = await apiClient<RoleUpgradeRequest>('/v1/role-upgrades/request', {
        method: 'POST',
        body: { requestedRole: selectedRole },
      });
      setExistingRequest(request);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSignOut() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    router.push('/');
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const isPending = existingRequest?.status === 'pending';
  const isRejected = existingRequest?.status === 'rejected';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-dark">Request Admin Access</h1>
          <p className="mt-1 text-sm text-slate-500">
            {currentRole === 'user'
              ? 'Your account doesn’t currently have access to the SafePass admin dashboard.'
              : 'Your account doesn’t currently have staff-level access to this dashboard.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isPending ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center">
            <Clock className="h-8 w-8 text-amber-500" />
            <p className="text-sm font-medium text-amber-800">
              Your request for {ROLE_OPTIONS.find((r) => r.value === existingRequest?.requestedRole)?.label} access is pending review.
            </p>
            <p className="text-xs text-amber-600">
              Submitted {new Date(existingRequest!.createdAt).toLocaleString()}. A super admin will review it shortly — you&rsquo;ll get an email once it&rsquo;s decided.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {isRejected && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <div className="flex items-center gap-2 font-medium">
                  <XCircle className="h-4 w-4" />
                  Your previous request was rejected.
                </div>
                {existingRequest?.reason && (
                  <p className="mt-1 text-xs text-red-600">Reason: {existingRequest.reason}</p>
                )}
                <p className="mt-2 text-xs text-red-500">You can submit a new request below.</p>
              </div>
            )}

            <div className="space-y-2">
              {ROLE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    selectedRole === option.value
                      ? 'border-primary bg-primary/5'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="requestedRole"
                    value={option.value}
                    checked={selectedRole === option.value}
                    onChange={() => setSelectedRole(option.value)}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-dark">{option.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{option.description}</p>
                  </div>
                </label>
              ))}
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        )}

        <button
          onClick={handleSignOut}
          className="mt-6 flex w-full items-center justify-center gap-2 text-sm text-slate-400 hover:text-slate-600"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
