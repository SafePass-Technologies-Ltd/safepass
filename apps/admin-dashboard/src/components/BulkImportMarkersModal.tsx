/// Bulk Import Markers Modal (A-09 CSV bulk import)
///
/// Implements the exact state machine from screens.md's Screen 14 "Bulk
/// Import" row: idle (dropzone + template download) -> validating ->
/// validation errors | row-count-exceeded | duplicate review -> success.
///
/// Uses a raw `fetch` (not the shared apiClient) for both the template
/// download and the upload itself: apiClient always sends/parses JSON,
/// which doesn't fit a CSV file download or a multipart/form-data upload.
'use client';

import { useState, useRef } from 'react';
import { Download, Upload, X, AlertTriangle, CheckCircle2, Loader2, FileWarning } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api-client';

type ModalState = 'idle' | 'validating' | 'errors' | 'row-limit' | 'duplicates' | 'success';

interface ValidationError {
  row: number;
  reason: string;
}

interface DuplicateCandidate {
  row: number;
  title: string;
  markerType: string;
  existingMarkerId: string;
  existingTitle: string;
  distanceKm: number;
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function BulkImportMarkersModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [state, setState] = useState<ModalState>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  // Rows the admin has chosen to SKIP (i.e. treat as a real duplicate, don't
  // create). Defaults to every flagged row -- the safer default is to not
  // create a duplicate unless the admin explicitly un-checks it.
  const [skipRows, setSkipRows] = useState<Set<number>>(new Set());
  const [totalRows, setTotalRows] = useState(0);
  const [rowLimitMessage, setRowLimitMessage] = useState('');
  const [genericError, setGenericError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleDownloadTemplate() {
    const res = await fetch(`${API_BASE_URL}/v1/admin/markers/csv-template`, {
      headers: authHeaders(),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'safepass-marker-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function submitFile(selectedFile: File, confirmDuplicates: boolean, skip: Set<number>) {
    setState('validating');
    setGenericError(null);

    const form = new FormData();
    form.append('file', selectedFile);
    if (confirmDuplicates) {
      form.append('confirmDuplicates', 'true');
      form.append('skipRows', JSON.stringify(Array.from(skip)));
    }

    try {
      const res = await fetch(`${API_BASE_URL}/v1/admin/markers/bulk-import`, {
        method: 'POST',
        headers: authHeaders(),
        body: form,
      });
      const data = await res.json();

      if (res.status === 201) {
        setResult({ created: data.created, skipped: data.skipped, total: data.total });
        setState('success');
        onImported();
        return;
      }

      if (res.status === 200 && data.status === 'needs_duplicate_review') {
        setDuplicates(data.duplicates ?? []);
        // Default every flagged row to "skip" (safer default per above).
        setSkipRows(new Set((data.duplicates ?? []).map((d: DuplicateCandidate) => d.row)));
        setTotalRows(data.totalRows ?? 0);
        setState('duplicates');
        return;
      }

      if (res.status === 400 && Array.isArray(data.validationErrors)) {
        setErrors(data.validationErrors);
        setState('errors');
        return;
      }

      if (res.status === 400 && typeof data?.error?.message === 'string' && data.error.message.includes('row limit')) {
        setRowLimitMessage(data.error.message);
        setState('row-limit');
        return;
      }

      // Any other 400/500 -- generic failure, back to idle with an inline message.
      setGenericError(data?.error?.message ?? 'Import failed. Please try again.');
      setState('idle');
    } catch {
      setGenericError('Network error — could not reach the server.');
      setState('idle');
    }
  }

  function handleFileSelected(selected: File | null) {
    if (!selected) return;
    setFile(selected);
    void submitFile(selected, false, new Set());
  }

  function toggleSkip(row: number) {
    setSkipRows((prev) => {
      const next = new Set(prev);
      if (next.has(row)) next.delete(row);
      else next.add(row);
      return next;
    });
  }

  function handleConfirmDuplicates() {
    if (!file) return;
    void submitFile(file, true, skipRows);
  }

  function resetToIdle() {
    setFile(null);
    setErrors([]);
    setDuplicates([]);
    setSkipRows(new Set());
    setGenericError(null);
    setState('idle');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-dark">Bulk Import Markers (CSV)</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6">
          {/* Idle: dropzone + template download */}
          {state === 'idle' && (
            <div className="space-y-4">
              <button
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Download CSV Template
              </button>

              {genericError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {genericError}
                </div>
              )}

              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 py-12 text-center transition-colors hover:border-primary hover:bg-primary/5">
                <Upload className="h-8 w-8 text-slate-400" />
                <p className="text-sm font-medium text-slate-600">Click to choose a CSV file</p>
                <p className="text-xs text-slate-400">Max 500 rows per file</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          )}

          {/* Validating */}
          {state === 'validating' && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-slate-500">Validating {file?.name}…</p>
            </div>
          )}

          {/* Validation errors */}
          {state === 'errors' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <FileWarning className="h-4 w-4 shrink-0" />
                {errors.length} row{errors.length !== 1 ? 's' : ''} failed validation. Fix these rows and re-upload the whole file — nothing has been imported.
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Row</th>
                      <th className="px-3 py-2 text-left">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {errors.map((e) => (
                      <tr key={e.row}>
                        <td className="px-3 py-2 font-medium text-slate-600">{e.row}</td>
                        <td className="px-3 py-2 text-slate-500">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={resetToIdle}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Choose a different file
              </button>
            </div>
          )}

          {/* Row count exceeded */}
          {state === 'row-limit' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {rowLimitMessage}
              </div>
              <button
                onClick={resetToIdle}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Choose a different file
              </button>
            </div>
          )}

          {/* Duplicate review */}
          {state === 'duplicates' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {duplicates.length} of {totalRows} row{totalRows !== 1 ? 's' : ''} look like duplicates of an existing marker (same type, within ~50m). Checked rows will be <strong>skipped</strong> — uncheck to import anyway.
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Skip</th>
                      <th className="px-3 py-2 text-left">Row</th>
                      <th className="px-3 py-2 text-left">New Title</th>
                      <th className="px-3 py-2 text-left">Matches Existing</th>
                      <th className="px-3 py-2 text-left">Distance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {duplicates.map((d) => (
                      <tr key={d.row}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={skipRows.has(d.row)}
                            onChange={() => toggleSkip(d.row)}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-600">{d.row}</td>
                        <td className="px-3 py-2 text-slate-700">{d.title}</td>
                        <td className="px-3 py-2 text-slate-500">{d.existingTitle}</td>
                        <td className="px-3 py-2 text-slate-500">{Math.round(d.distanceKm * 1000)}m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConfirmDuplicates}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                >
                  Confirm Import ({totalRows - skipRows.size} to create, {skipRows.size} to skip)
                </button>
                <button
                  onClick={resetToIdle}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Success */}
          {state === 'success' && result && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-sm font-medium text-slate-700">
                {result.created} marker{result.created !== 1 ? 's' : ''} created
                {result.skipped > 0 ? `, ${result.skipped} skipped as duplicates` : ''}.
              </p>
              <button
                onClick={onClose}
                className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
