/// Admin Dashboard — Subscription Request Management (C-20, T-20)
///
/// SafePass admins review pending org subscription plan requests and
/// approve or reject them. Approval writes the plan + slot_count to the
/// org record immediately (MVP manual-invoicing flow).
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  X,
  Building2,
  RefreshCw,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────────────

type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
type FilterMode = 'pending' | 'approved' | 'rejected' | 'all';

interface OrgSummary {
  id: string;
  name: string;
  type: 'corporate' | 'transport_partner';
}

interface SubscriptionRequest {
  id: string;
  orgId: string;
  requestedPlan: string;
  requestedSlotCount: number;
  notes: string | null;
  status: RequestStatus;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  org: OrgSummary | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<RequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

function StatusBadge({ status }: { status: RequestStatus }) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium';
  switch (status) {
    case 'pending':
      return (
        <span className={`${base} bg-amber-100 text-amber-700`}>
          <Clock className="h-3 w-3" />
          Pending
        </span>
      );
    case 'approved':
      return (
        <span className={`${base} bg-green-100 text-green-700`}>
          <CheckCircle className="h-3 w-3" />
          Approved
        </span>
      );
    case 'rejected':
      return (
        <span className={`${base} bg-red-100 text-red-700`}>
          <XCircle className="h-3 w-3" />
          Rejected
        </span>
      );
    default:
      return (
        <span className={`${base} bg-slate-100 text-slate-500`}>
          {STATUS_LABELS[status]}
        </span>
      );
  }
}

function OrgTypeBadge({ type }: { type: 'corporate' | 'transport_partner' }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      <Building2 className="h-3 w-3" />
      {type === 'corporate' ? 'Corporate' : 'Transport Partner'}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ── Approve Modal ──────────────────────────────────────────────────────────

interface ApproveModalProps {
  request: SubscriptionRequest;
  onConfirm: (slotCount: number) => void;
  onCancel: () => void;
  submitting: boolean;
}

function ApproveModal({ request, onConfirm, onCancel, submitting }: ApproveModalProps) {
  const [slotCount, setSlotCount] = useState(request.requestedSlotCount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-lg font-bold text-slate-900">Approve Subscription Request</h2>
          <button onClick={onCancel} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Org: <span className="font-medium text-slate-700">{request.org?.name ?? request.orgId}</span>
        </p>

        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Requested plan</span>
            <span className="font-semibold capitalize text-slate-800">{request.requestedPlan}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-slate-500">Requested slots</span>
            <span className="font-semibold text-slate-800">{request.requestedSlotCount}</span>
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="slot-count">
            Slot count to activate
          </label>
          <p className="mb-1.5 text-xs text-slate-400">
            You can override the slot count (e.g. for enterprise custom deals).
          </p>
          <input
            id="slot-count"
            type="number"
            min={1}
            value={slotCount}
            onChange={(e) => setSlotCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(slotCount)}
            disabled={submitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            {submitting ? 'Approving…' : 'Approve & Activate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reject Modal ───────────────────────────────────────────────────────────

interface RejectModalProps {
  request: SubscriptionRequest;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  submitting: boolean;
}

function RejectModal({ request, onConfirm, onCancel, submitting }: RejectModalProps) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <XCircle className="h-6 w-6 text-red-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Reject Subscription Request</h2>
        <p className="mt-1 text-sm text-slate-500">
          Org: <span className="font-medium text-slate-700">{request.org?.name ?? request.orgId}</span>
          {' '}&middot; <span className="capitalize">{request.requestedPlan}</span> plan
        </p>

        <div className="my-4">
          <label className="block text-sm font-medium text-slate-700" htmlFor="reject-reason">
            Reason (optional)
          </label>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Let the org admin know why this request was rejected…"
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={submitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? 'Rejecting…' : 'Reject Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('pending');

  // Modal state
  const [approveTarget, setApproveTarget] = useState<SubscriptionRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SubscriptionRequest | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient<{ requests: SubscriptionRequest[] }>(
        `/v1/admin/subscriptions?status=${filter}`
      );
      setRequests(data.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription requests');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  async function handleApprove(slotCount: number) {
    if (!approveTarget) return;
    setActionLoading(true);
    try {
      await apiClient(`/v1/admin/subscriptions/${approveTarget.id}/approve`, {
        method: 'PATCH',
        body: { slotCount },
      });
      setApproveTarget(null);
      await fetchRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve request');
      setApproveTarget(null);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject(reason: string) {
    if (!rejectTarget) return;
    setActionLoading(true);
    try {
      await apiClient(`/v1/admin/subscriptions/${rejectTarget.id}/reject`, {
        method: 'PATCH',
        body: { reason: reason || undefined },
      });
      setRejectTarget(null);
      await fetchRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject request');
      setRejectTarget(null);
    } finally {
      setActionLoading(false);
    }
  }

  const filters: { key: FilterMode; label: string }[] = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Subscription Requests</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review and activate org subscription plans.
          </p>
        </div>
        <button
          onClick={fetchRequests}
          className="rounded-xl border border-slate-200 p-2.5 text-slate-500 transition-colors hover:bg-slate-50"
          title="Refresh"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 w-fit">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-primary/10 text-primary'
                : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-8 py-16 text-center">
          <CreditCard className="mx-auto mb-4 h-12 w-12 text-slate-200" />
          <p className="text-sm font-medium text-slate-500">No subscription requests.</p>
          <p className="mt-1 text-sm text-slate-400">
            {filter === 'pending'
              ? 'There are no pending requests right now.'
              : 'No requests match this filter.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Organisation
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Requested Plan
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Slots
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Notes
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Submitted
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-dark">
                      {req.org?.name ?? <span className="font-mono text-slate-400">{req.orgId.slice(0, 8)}…</span>}
                    </p>
                    {req.org && (
                      <div className="mt-0.5">
                        <OrgTypeBadge type={req.org.type} />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium capitalize text-slate-dark">
                    {req.requestedPlan}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{req.requestedSlotCount}</td>
                  <td className="max-w-xs px-4 py-3 text-slate-500">
                    {req.notes ? (
                      <span className="line-clamp-2">{req.notes}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(req.createdAt)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={req.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {req.status === 'pending' && (
                        <>
                          <button
                            onClick={() => setApproveTarget(req)}
                            className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Approve
                          </button>
                          <button
                            onClick={() => setRejectTarget(req)}
                            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        </>
                      )}
                      {req.status !== 'pending' && (
                        <span className="text-xs text-slate-400">
                          {req.reviewedAt ? formatDate(req.reviewedAt) : '—'}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {approveTarget && (
        <ApproveModal
          request={approveTarget}
          onConfirm={handleApprove}
          onCancel={() => setApproveTarget(null)}
          submitting={actionLoading}
        />
      )}
      {rejectTarget && (
        <RejectModal
          request={rejectTarget}
          onConfirm={handleReject}
          onCancel={() => setRejectTarget(null)}
          submitting={actionLoading}
        />
      )}
    </div>
  );
}
