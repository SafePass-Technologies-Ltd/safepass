'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Upload, Loader2, X } from 'lucide-react';
import { getUserSession } from '@/lib/auth-utils';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

const DOC_TYPES = [
  { value: 'vehicle_insurance', label: 'Vehicle Insurance' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'road_worthiness', label: 'Road Worthiness' },
  { value: 'hack_permit', label: 'Hack Permit' },
  { value: 'other', label: 'Other' },
];

interface Doc {
  id: string;
  documentName: string;
  documentType: string;
  status: string;
  expiryDate: string | null;
  createdAt: string;
}

const emptyForm = {
  documentName: '',
  documentType: 'vehicle_insurance',
  expiryDate: '',
};

export default function DocumentsPage() {
  const session = getUserSession();
  const orgId = session?.orgId;

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${BASE_URL}/v1/documents?organizationId=${orgId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      setDocs(data.documents ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !orgId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const fd = new FormData();
      fd.append('documentName', form.documentName.trim());
      fd.append('documentType', form.documentType);
      fd.append('organizationId', orgId);
      if (form.expiryDate) fd.append('expiryDate', form.expiryDate);
      fd.append('file', file);

      const token = localStorage.getItem('access_token');
      const res = await fetch(`${BASE_URL}/v1/documents`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? res.statusText);
      }

      setForm(emptyForm);
      setFile(null);
      setShowModal(false);
      await fetchDocs();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20';

  if (!orgId) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <FileText className="mb-4 h-12 w-12 text-slate-300" />
        <p className="text-slate-500">Complete company setup to manage documents.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Compliance Documents</h1>
          <p className="mt-1 text-sm text-slate-500">{docs.length} document{docs.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setForm(emptyForm); setFile(null); setSaveError(null); setShowModal(true); }}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
        >
          <Upload className="h-4 w-4" /> Upload Document
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                {['Document Name', 'Type', 'Status', 'Expiry Date', 'Uploaded'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                    <p className="text-sm text-slate-400">No documents uploaded yet.</p>
                  </td>
                </tr>
              ) : (
                docs.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-dark">{d.documentName}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {DOC_TYPES.find((t) => t.value === d.documentType)?.label ?? d.documentType}
                    </td>
                    <td className="px-4 py-3">
                      <DocStatusBadge status={d.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {d.expiryDate ? new Date(d.expiryDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-dark">Upload Document</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1 hover:bg-slate-100">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {saveError && (
              <div className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{saveError}</div>
            )}

            <form onSubmit={handleUpload} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Document Name *</label>
                <input
                  type="text"
                  required
                  value={form.documentName}
                  onChange={(e) => setForm((f) => ({ ...f, documentName: e.target.value }))}
                  className={inputCls}
                  placeholder="e.g. Vehicle Insurance 2025"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Document Type *</label>
                <select
                  required
                  value={form.documentType}
                  onChange={(e) => setForm((f) => ({ ...f, documentType: e.target.value }))}
                  className={inputCls}
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Expiry Date</label>
                <input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">File *</label>
                <input
                  type="file"
                  required
                  accept=".pdf,image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !file}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {saving ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DocStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    valid: 'bg-green-50 text-green-700',
    expired: 'bg-red-50 text-red-600',
    pending: 'bg-amber-50 text-amber-700',
  };
  const cls = map[status] ?? 'bg-slate-100 text-slate-500';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}
