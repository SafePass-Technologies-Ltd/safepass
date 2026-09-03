/// Admin Dashboard — Marketing Leads
///
/// Lists leads captured by SafePassLanding (partner inquiries, demo requests,
/// waitlist signups) so sales/partnerships can actually read what the forms
/// collect — including the partner inquiry "current challenges" answer the
/// client asked for. Without this page, every lead type lands in the database
/// with no read path, which defeats the forms' purpose ("helps your sales team
/// before they even make contact").
///
/// Mirrors the role-upgrades review-queue pattern: filter tabs, a table,
/// click-through detail, and triage actions wired to the existing
/// PATCH /v1/admin/leads/:id endpoint (status + notes).
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Inbox,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Mail,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type LeadType = 'waitlist' | 'demo_request' | 'partner_inquiry';
type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'rejected';

interface LeadRow {
  id: string;
  submissionId: string;
  leadType: LeadType;
  sourcePage: string;
  submittedAt: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  cityOrRegion: string | null;
  teamSize: string | null;
  fleetSize: number | null;
  currentChallenges: string | null;
  message: string | null;
  status: LeadStatus;
  notes: string | null;
  createdAt: string;
}

type TypeFilter = 'all' | LeadType;
type StatusFilter = 'all' | LeadStatus;

const TYPE_LABELS: Record<LeadType, string> = {
  waitlist: 'Waitlist',
  demo_request: 'Demo Request',
  partner_inquiry: 'Partner Inquiry',
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  converted: 'Converted',
  rejected: 'Rejected',
};

const STATUS_STYLES: Record<LeadStatus, string> = {
  new: 'bg-amber-100 text-amber-700',
  contacted: 'bg-blue-100 text-blue-700',
  qualified: 'bg-purple-100 text-purple-700',
  converted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

/** Human labels for the partner-challenge taxonomy (mirrors the landing form). */
const CHALLENGE_LABELS: Record<string, string> = {
  passenger_safety: 'Passenger safety',
  brand_differentiation: 'Brand differentiation',
  incident_management: 'Incident management',
  compliance: 'Compliance',
  journey_visibility: 'Journey visibility',
  driver_accountability: 'Driver accountability',
  other: 'Other',
};

const TYPE_FILTERS: { label: string; value: TypeFilter }[] = [
  { label: 'All types', value: 'all' },
  { label: 'Partner inquiries', value: 'partner_inquiry' },
  { label: 'Demo requests', value: 'demo_request' },
  { label: 'Waitlist', value: 'waitlist' },
];

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All statuses', value: 'all' },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ label, value: value as LeadStatus })),
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.set('leadType', typeFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const data = await apiClient<{ leads: LeadRow[] }>(
        `/v1/admin/leads?${params.toString()}`
      );
      setLeads(data.leads ?? []);
    } catch {
      setError('Failed to load leads. Is the API server running?');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  /** Triage: update status or notes via PATCH /v1/admin/leads/:id. */
  async function updateLead(
    id: string,
    patch: Partial<Pick<LeadRow, 'status' | 'notes'>>
  ) {
    setPendingId(id);
    try {
      await apiClient(`/v1/admin/leads/${id}`, { method: 'PATCH', body: patch });
      await fetchLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update lead.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Marketing Leads</h1>
          <p className="mt-1 text-sm text-slate-500">
            Leads captured from the landing site — read the answers your forms collect, and triage
            them for follow-up.
          </p>
        </div>
        <button
          onClick={fetchLeads}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setTypeFilter(f.value)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              typeFilter === f.value
                ? 'bg-primary text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="mx-1 hidden w-px bg-slate-200 sm:block" aria-hidden="true" />
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === f.value
                ? 'bg-slate-700 text-white'
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
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Inbox className="h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-600">No leads found</h3>
          <p className="mt-1 text-sm text-slate-400">
            Try a different filter — or submit a form on the landing site to create one.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">Lead</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Source</th>
                  <th className="px-6 py-3">Submitted</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((lead) => {
                  const expanded = expandedId === lead.id;
                  return (
                    <LeadRowView
                      key={lead.id}
                      lead={lead}
                      expanded={expanded}
                      onToggle={() => setExpandedId(expanded ? null : lead.id)}
                      onUpdate={updateLead}
                      pending={pendingId === lead.id}
                    />
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

function LeadRowView({
  lead,
  expanded,
  onToggle,
  onUpdate,
  pending,
}: {
  lead: LeadRow;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, patch: Partial<Pick<LeadRow, 'status' | 'notes'>>) => Promise<void>;
  pending: boolean;
}) {
  const primary = lead.companyName || lead.contactName || lead.email || lead.phone || 'Anonymous';
  const secondary = lead.contactName ? lead.contactName : lead.email ?? lead.phone ?? '';

  return (
    <>
      <tr className="cursor-pointer hover:bg-slate-50" onClick={onToggle}>
        <td className="px-6 py-3 text-sm">
          <div className="font-semibold text-slate-dark">{primary}</div>
          <div className="text-xs text-slate-500">{secondary}</div>
        </td>
        <td className="px-6 py-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {lead.leadType === 'partner_inquiry' ? (
              <Building2 className="h-3 w-3" />
            ) : lead.leadType === 'demo_request' ? (
              <Mail className="h-3 w-3" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            {TYPE_LABELS[lead.leadType]}
          </span>
        </td>
        <td className="px-6 py-3">
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[lead.status]}`}
          >
            {STATUS_LABELS[lead.status]}
          </span>
        </td>
        <td className="px-6 py-3 text-sm text-slate-500">{lead.sourcePage}</td>
        <td className="px-6 py-3 text-sm text-slate-500">{formatDate(lead.submittedAt)}</td>
        <td className="px-6 py-3 text-right">
          {expanded ? (
            <ChevronUp className="ml-auto h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="ml-auto h-4 w-4 text-slate-400" />
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-slate-100 bg-slate-50/50">
          <td colSpan={6} className="px-6 py-4">
            <LeadDetail lead={lead} onUpdate={onUpdate} pending={pending} />
          </td>
        </tr>
      )}
    </>
  );
}

function LeadDetail({
  lead,
  onUpdate,
  pending,
}: {
  lead: LeadRow;
  onUpdate: (id: string, patch: Partial<Pick<LeadRow, 'status' | 'notes'>>) => Promise<void>;
  pending: boolean;
}) {
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await onUpdate(lead.id, { notes });
    } finally {
      setSavingNotes(false);
    }
  }

  const rows: { label: string; value: string | null }[] = [
    { label: 'Company', value: lead.companyName },
    { label: 'Contact', value: lead.contactName },
    { label: 'Email', value: lead.email },
    { label: 'Phone', value: lead.phone },
    { label: 'Source page', value: lead.sourcePage },
    { label: 'Submission ID', value: lead.submissionId },
    ...(lead.leadType === 'partner_inquiry'
      ? [
          { label: 'Fleet size', value: lead.fleetSize != null ? String(lead.fleetSize) : null },
          {
            label: 'Current challenges',
            value: lead.currentChallenges
              ? CHALLENGE_LABELS[lead.currentChallenges] ?? lead.currentChallenges
              : null,
          },
        ]
      : []),
    ...(lead.leadType === 'demo_request'
      ? [{ label: 'Team size', value: lead.teamSize }]
      : []),
    ...(lead.leadType === 'waitlist' ? [{ label: 'City / region', value: lead.cityOrRegion }] : []),
    { label: 'Message', value: lead.message },
    { label: 'Submitted', value: formatDate(lead.submittedAt) },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(
            (row) =>
              row.value && (
                <div key={row.label}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {row.label}
                  </dt>
                  <dd className="mt-0.5 text-sm text-slate-700">{row.value}</dd>
                </div>
              )
          )}
        </div>

        <div>
          <label htmlFor={`lead-notes-${lead.id}`} className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Triage notes
          </label>
          <textarea
            id={`lead-notes-${lead.id}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Internal notes for sales/partnerships follow-up"
            className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
          />
          <button
            onClick={saveNotes}
            disabled={pending || savingNotes || notes === (lead.notes ?? '')}
            className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            {savingNotes ? 'Saving…' : 'Save notes'}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor={`lead-status-${lead.id}`} className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Triage status
        </label>
        <div className="mt-1 flex items-center gap-2">
          <select
            id={`lead-status-${lead.id}`}
            value={lead.status}
            onChange={(e) => onUpdate(lead.id, { status: e.target.value as LeadStatus })}
            disabled={pending}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {pending && (
            <span className="text-xs text-slate-400">Updating…</span>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Status drives the sales funnel: New → Contacted → Qualified → Converted, or Rejected.
        </p>
      </div>
    </div>
  );
}