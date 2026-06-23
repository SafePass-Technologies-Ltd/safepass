/// Corporate Dashboard — Slot Management (C-02, C-03 / Screen 19b)
///
/// Org admins manage member slots: generate invite tokens, revoke members,
/// and bulk-generate tokens with CSV export. Members join via token redemption
/// in the mobile app — direct-add is not supported in MVP.
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Ticket, Copy, Check, RefreshCw, Loader2, Search, Download,
  AlertTriangle, X, ChevronDown, Users, Plus, Link,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────────────

type SlotStatus = 'empty' | 'token_pending' | 'active';

interface SlotToken {
  token: string;
  expiresAt: string;
}

interface Slot {
  slotId: string;
  status: SlotStatus;
  memberName: string | null;
  memberEmail: string | null;
  latestToken: SlotToken | null;
}

interface BulkGenerateResult {
  results: Array<{ slotId: string; token: string; expiresAt: string }>;
  skippedCount: number;
}

type FilterTab = 'all' | 'empty' | 'token_pending' | 'active';

// ── Helpers ────────────────────────────────────────────────────────────────

function formatExpiry(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  return `${hours}h ${mins}m`;
}

function csvFilename(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `safepass-invite-tokens-${y}-${m}-${day}.csv`;
}

function buildCsv(rows: Array<{ slotId: string; token: string; expiresAt: string }>): string {
  const header = 'slot_id,token,invite_link,expires_at';
  const lines = rows.map((r) =>
    `${r.slotId},${r.token},https://safepass.ng/join/${r.token},${r.expiresAt}`
  );
  return [header, ...lines].join('\n');
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SlotStatusBadge({ status, expiresAt }: { status: SlotStatus; expiresAt?: string | null }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Active Member
      </span>
    );
  }
  if (status === 'token_pending') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Token Pending
        {expiresAt && (
          <span className="ml-1 text-amber-600">· {formatExpiry(expiresAt)}</span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
      Empty
    </span>
  );
}

function TokenRevealRow({ token, expiresAt }: { token: string; expiresAt: string }) {
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const inviteLink = `https://safepass.ng/join/${token}`;

  async function handleCopyToken() {
    await navigator.clipboard.writeText(token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      {/* Token row */}
      <div className="flex items-center gap-2">
        <Ticket className="h-3 w-3 flex-shrink-0 text-amber-500" />
        <code className="flex-1 truncate text-xs font-mono text-amber-800">{token}</code>
        <button
          onClick={handleCopyToken}
          title={copiedToken ? 'Copied!' : 'Copy token'}
          className="rounded p-1 text-amber-700 transition-colors hover:bg-amber-200"
        >
          {copiedToken ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      {/* Invite link row */}
      <div className="flex items-center gap-2">
        <Link className="h-3 w-3 flex-shrink-0 text-amber-500" />
        <span className="flex-1 truncate text-xs text-amber-700">{inviteLink}</span>
        <button
          onClick={handleCopyLink}
          title={copiedLink ? 'Link copied!' : 'Copy invite link'}
          className="rounded p-1 text-amber-700 transition-colors hover:bg-amber-200"
        >
          {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <p className="text-xs text-amber-500">
        Expires {new Date(expiresAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
    </div>
  );
}

interface RevokeConfirmDialogProps {
  memberName: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function RevokeConfirmDialog({ memberName, onConfirm, onCancel, loading }: RevokeConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle className="h-6 w-6 text-red-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Revoke Member Access?</h2>
        <p className="mt-2 text-sm text-slate-500">
          Revoking <span className="font-semibold text-slate-700">{memberName}</span> will remove
          them from the organisation and release this slot. Their next trip will be charged per trip.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Revoking…' : 'Revoke Access'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface BulkConfirmDialogProps {
  selectedSlots: Slot[];
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function BulkConfirmDialog({ selectedSlots, onConfirm, onCancel, loading }: BulkConfirmDialogProps) {
  const newCount = selectedSlots.filter((s) => s.status === 'empty').length;
  const regenCount = selectedSlots.filter((s) => s.status === 'token_pending').length;
  const skipCount = selectedSlots.filter((s) => s.status === 'active').length;
  const allActive = newCount + regenCount === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-slate-900">Bulk Generate Tokens</h2>
        <p className="mt-1 text-sm text-slate-500">
          Tokens will be generated for eligible slots in your selection.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">{newCount}</span>
            <span className="text-slate-700">empty slots will receive new tokens</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">{regenCount}</span>
            <span className="text-slate-700">Token Pending slots will be regenerated (previous token invalidated)</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">{skipCount}</span>
            <span className="text-slate-500">Active Member slots will be skipped</span>
          </li>
        </ul>
        {allActive && (
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
            All selected slots already have active members. Nothing to generate.
          </div>
        )}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || allActive}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Generating…' : `Generate ${newCount + regenCount} Tokens`}
          </button>
        </div>
      </div>
    </div>
  );
}

interface BulkActionBarProps {
  selectedCount: number;
  allActive: boolean;
  generating: boolean;
  exporting: boolean;
  onGenerate: () => void;
  onExportCsv: () => void;
  onClear: () => void;
}

function BulkActionBar({ selectedCount, allActive, generating, exporting, onGenerate, onExportCsv, onClear }: BulkActionBarProps) {
  return (
    <div className="sticky top-0 z-30 flex items-center gap-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 shadow-sm">
      <Ticket className="h-4 w-4 text-primary" />
      <span className="text-sm font-medium text-slate-700">
        {selectedCount} slot{selectedCount !== 1 ? 's' : ''} selected
      </span>
      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={onGenerate}
          disabled={generating || exporting || allActive}
          title={allActive ? 'All selected slots already have active members.' : undefined}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
          {generating ? 'Generating…' : 'Generate Tokens'}
        </button>
        <button
          onClick={onExportCsv}
          disabled={generating || exporting || allActive}
          title={allActive ? 'All selected slots already have active members.' : 'Generate tokens and export as CSV'}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
        <button
          onClick={onClear}
          className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function SlotManagementPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & search
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Per-slot revealed tokens (after single generate)
  const [revealedTokens, setRevealedTokens] = useState<Record<string, SlotToken>>({});

  // "Add Slot & Generate Token" button state
  const [addingSlot, setAddingSlot] = useState(false);

  // Per-slot loading states
  const [generatingSlot, setGeneratingSlot] = useState<string | null>(null);
  const [revokingSlot, setRevokingSlot] = useState<string | null>(null);

  // Revoke dialog
  const [revokeTarget, setRevokeTarget] = useState<Slot | null>(null);

  // Bulk flow
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkExporting, setBulkExporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkGenerateResult | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // ── Data Fetching ──

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient<{ slots: Slot[] }>('/v1/org/slots');
      setSlots(data.slots);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load slots');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // ── Derived state ──

  const filteredSlots = useMemo(() => {
    let list = slots;
    if (filterTab !== 'all') list = list.filter((s) => s.status === filterTab);
    if (search.trim()) {
      const term = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.memberName?.toLowerCase().includes(term) ||
          s.memberEmail?.toLowerCase().includes(term)
      );
    }
    return list;
  }, [slots, filterTab, search]);

  // Clear selection when filter changes (per spec).
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filterTab, search]);

  const activeCount = slots.filter((s) => s.status === 'active').length;
  const totalSlots = slots.length;

  const selectedSlots = filteredSlots.filter((s) => selectedIds.has(s.slotId));
  const allSelectedActive = selectedSlots.every((s) => s.status === 'active');

  const allVisibleSelected =
    filteredSlots.length > 0 && filteredSlots.every((s) => selectedIds.has(s.slotId));
  const someSelected = selectedIds.size > 0 && !allVisibleSelected;

  // ── Add Slot ──

  /**
   * Creates a new org slot and immediately generates an invite token for it.
   * On success the new slot (token_pending) is prepended to the list and the
   * token is revealed inline so the admin can copy it right away.
   */
  async function handleAddSlot() {
    setAddingSlot(true);
    try {
      const data = await apiClient<{ slot: Slot }>('/v1/org/slots', { method: 'POST' });
      setSlots((prev) => [data.slot, ...prev]);
      if (data.slot.latestToken) {
        setRevealedTokens((prev) => ({ ...prev, [data.slot.slotId]: data.slot.latestToken! }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create slot');
    } finally {
      setAddingSlot(false);
    }
  }

  // ── Per-slot Actions ──

  async function handleGenerateToken(slotId: string) {
    setGeneratingSlot(slotId);
    try {
      const data = await apiClient<{ slot: Slot }>('/v1/org/slots/generate-token', {
        method: 'POST',
        body: JSON.stringify({ slotId }),
      });
      // Update local state with new token info.
      setSlots((prev) =>
        prev.map((s) => (s.slotId === slotId ? data.slot : s))
      );
      if (data.slot.latestToken) {
        setRevealedTokens((prev) => ({ ...prev, [slotId]: data.slot.latestToken! }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate token');
    } finally {
      setGeneratingSlot(null);
    }
  }

  async function handleRevokeMember(slotId: string) {
    setRevokingSlot(slotId);
    try {
      await apiClient(`/v1/org/slots/${slotId}/member`, { method: 'DELETE' });
      setRevokeTarget(null);
      await fetchSlots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke member');
    } finally {
      setRevokingSlot(null);
    }
  }

  // ── Bulk Actions ──

  async function handleBulkGenerate() {
    setBulkGenerating(true);
    setBulkError(null);
    const slotIds = selectedSlots
      .filter((s) => s.status !== 'active')
      .map((s) => s.slotId);

    try {
      const data = await apiClient<BulkGenerateResult>('/v1/org/slots/bulk-generate-tokens', {
        method: 'POST',
        body: JSON.stringify({ slotIds }),
      });
      setBulkResult(data);
      setShowBulkConfirm(false);
      setSelectedIds(new Set());
      await fetchSlots();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Token generation failed. Please try again.');
      setShowBulkConfirm(false);
    } finally {
      setBulkGenerating(false);
    }
  }

  function handleDownloadCsv() {
    if (!bulkResult) return;
    const csv = buildCsv(bulkResult.results);
    downloadCsv(csv, csvFilename());
  }

  /**
   * Bulk-generates tokens for all selected non-active slots and immediately
   * triggers a CSV download — combines generate + export into one action.
   */
  async function handleBulkExportCsv() {
    setBulkExporting(true);
    setBulkError(null);
    const slotIds = selectedSlots
      .filter((s) => s.status !== 'active')
      .map((s) => s.slotId);

    try {
      const data = await apiClient<BulkGenerateResult>('/v1/org/slots/bulk-generate-tokens', {
        method: 'POST',
        body: JSON.stringify({ slotIds }),
      });
      const csv = buildCsv(data.results);
      downloadCsv(csv, csvFilename());
      setSelectedIds(new Set());
      await fetchSlots();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Export failed. Please try again.');
    } finally {
      setBulkExporting(false);
    }
  }

  // ── Selection Helpers ──

  function toggleRow(slotId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(slotId) ? next.delete(slotId) : next.add(slotId);
      return next;
    });
  }

  function toggleAll() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSlots.map((s) => s.slotId)));
    }
  }

  // ── Render ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
      </div>
    );
  }

  const tabCounts: Record<FilterTab, number> = {
    all: slots.length,
    empty: slots.filter((s) => s.status === 'empty').length,
    token_pending: slots.filter((s) => s.status === 'token_pending').length,
    active: slots.filter((s) => s.status === 'active').length,
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'empty', label: 'Empty' },
    { key: 'token_pending', label: 'Token Pending' },
    { key: 'active', label: 'Active' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Slot Management</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage invite tokens and enrolled members for your organisation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddSlot}
            disabled={addingSlot}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {addingSlot ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {addingSlot ? 'Creating…' : 'Add Slot & Generate Token'}
          </button>
          <button
            onClick={fetchSlots}
            className="rounded-xl border border-slate-200 p-2.5 text-slate-500 transition-colors hover:bg-slate-50"
            title="Refresh"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Slot Summary Bar */}
      {totalSlots > 0 && (
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-dark">
              <span className="text-xl font-bold text-primary">{activeCount}</span>
              <span className="text-slate-400"> / {totalSlots}</span>
              <span className="ml-2">slots active</span>
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: totalSlots > 0 ? `${(activeCount / totalSlots) * 100}%` : '0%' }}
              />
            </div>
          </div>
          {activeCount >= totalSlots && (
            <button className="rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5">
              Upgrade Plan
            </button>
          )}
        </div>
      )}

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

      {/* Bulk Error */}
      {bulkError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {bulkError}
          <button onClick={() => setBulkError(null)} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Bulk Generation Result Banner */}
      {bulkResult && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-green-800">
                Tokens generated for {bulkResult.results.length} slot{bulkResult.results.length !== 1 ? 's' : ''}.
                {bulkResult.skippedCount > 0 && (
                  <span className="ml-1 font-normal text-green-700">
                    {bulkResult.skippedCount} slot{bulkResult.skippedCount !== 1 ? 's' : ''} skipped (active members).
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-green-700">
                Download the CSV and distribute invite links via your organisation&apos;s channels.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadCsv}
                className="flex items-center gap-2 rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-800"
              >
                <Download className="h-4 w-4" />
                Download CSV
              </button>
              <button
                onClick={() => setBulkResult(null)}
                className="rounded-lg p-1.5 text-green-700 transition-colors hover:bg-green-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs + Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filterTab === tab.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs ${
                  filterTab === tab.key
                    ? 'bg-primary/20 text-primary'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {tabCounts[tab.key]}
              </span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 sm:w-64"
          />
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          allActive={allSelectedActive}
          generating={bulkGenerating}
          exporting={bulkExporting}
          onGenerate={() => setShowBulkConfirm(true)}
          onExportCsv={handleBulkExportCsv}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      {/* Slot Table or Empty State */}
      {totalSlots === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-8 py-16 text-center">
          <Ticket className="mx-auto mb-4 h-12 w-12 text-slate-200" />
          <p className="text-sm font-medium text-slate-500">No slots yet.</p>
          <p className="mt-1 text-sm text-slate-400">
            Click &ldquo;Add Slot &amp; Generate Token&rdquo; to create your first slot and get an invite link for a member.
          </p>
          <button
            onClick={handleAddSlot}
            disabled={addingSlot}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {addingSlot ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {addingSlot ? 'Creating…' : 'Add Slot & Generate Token'}
          </button>
        </div>
      ) : filteredSlots.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-8 py-10 text-center">
          <p className="text-sm text-slate-400">No slots match your current filter.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/20"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Slot ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Member Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                  Member Email
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSlots.map((slot) => {
                const isSelected = selectedIds.has(slot.slotId);
                const isGenerating = generatingSlot === slot.slotId;
                const isRevoking = revokingSlot === slot.slotId;
                const revealed = revealedTokens[slot.slotId] ?? slot.latestToken;

                return (
                  <tr key={slot.slotId} className={`${isSelected ? 'bg-primary/5' : 'hover:bg-slate-50'}`}>
                    <td className="px-4 py-3">
                      {isGenerating ? (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                      ) : (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(slot.slotId)}
                          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/20"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-slate-500">
                        {slot.slotId.slice(0, 8)}…
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <SlotStatusBadge
                        status={slot.status}
                        expiresAt={slot.latestToken?.expiresAt}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-dark">
                      {slot.memberName ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {slot.memberEmail ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {slot.status === 'empty' && (
                          <button
                            onClick={() => handleGenerateToken(slot.slotId)}
                            disabled={isGenerating}
                            className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                          >
                            {isGenerating ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Ticket className="h-3 w-3" />
                            )}
                            Generate Token
                          </button>
                        )}
                        {slot.status === 'token_pending' && (
                          <button
                            onClick={() => handleGenerateToken(slot.slotId)}
                            disabled={isGenerating}
                            className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
                          >
                            {isGenerating ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Regenerate Token
                          </button>
                        )}
                        {slot.status === 'active' && (
                          <button
                            onClick={() => setRevokeTarget(slot)}
                            disabled={isRevoking}
                            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                          >
                            {isRevoking ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                            Revoke Member
                          </button>
                        )}
                      </div>
                      {/* Inline token reveal — shown for any token_pending slot that has a token,
                           whether it came from a just-triggered generate or was pre-existing from the server. */}
                      {slot.status === 'token_pending' && revealed && (
                        <TokenRevealRow
                          token={revealed.token}
                          expiresAt={revealed.expiresAt}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Revoke Confirmation Dialog */}
      {revokeTarget && (
        <RevokeConfirmDialog
          memberName={revokeTarget.memberName ?? 'this member'}
          onConfirm={() => handleRevokeMember(revokeTarget.slotId)}
          onCancel={() => setRevokeTarget(null)}
          loading={revokingSlot === revokeTarget.slotId}
        />
      )}

      {/* Bulk Confirm Dialog */}
      {showBulkConfirm && (
        <BulkConfirmDialog
          selectedSlots={selectedSlots}
          onConfirm={handleBulkGenerate}
          onCancel={() => setShowBulkConfirm(false)}
          loading={bulkGenerating}
        />
      )}
    </div>
  );
}
