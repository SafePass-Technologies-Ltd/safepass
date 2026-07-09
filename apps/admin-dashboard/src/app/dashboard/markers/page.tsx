'use client';

import { useState, useEffect, useCallback } from 'react';
import { RotateCcw, MapPin, Plus, X, Upload } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import MarkerLocationPicker from '@/components/map/marker-location-picker';
import BulkImportMarkersModal from '@/components/BulkImportMarkersModal';

// Matches the ACTUAL shape returned by GET /v1/admin/markers (raw Drizzle
// rows off the map_markers table -- see apps/api/src/services/
// map-marker.service.ts) -- flat latitude/longitude, markerType (not
// "type"), verificationStatus (not "status"), no verifyCount/disputeCount
// (those would require a separate aggregation over map_marker_interactions
// that doesn't exist yet -- verificationWeight is the closest available
// signal). The @safepass/shared MapMarkerSchema models a nested `location`
// object for API *responses*, but the actual route handlers never
// transform DB rows into that shape -- they return them as-is.
interface MapMarker {
  id: string;
  markerType: string;
  category?: string | null;
  latitude: number;
  longitude: number;
  title: string;
  description?: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  verificationStatus: 'unverified' | 'partially_confirmed' | 'verified' | 'disputed' | 'rejected';
  verificationWeight: number;
  isActive: boolean;
  createdAt: string;
}

// Matches MarkerTypeEnum in packages/shared/src/schemas/map-marker.schema.ts.
const MARKER_TYPES = [
  'kidnapping_hotspot',
  'checkpoint',
  'high_risk_zone',
  'recent_attack',
  'safe_zone',
  'admin_marker',
] as const;

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

interface NewMarkerForm {
  markerType: (typeof MARKER_TYPES)[number];
  category: string;
  latitude: number | null;
  longitude: number | null;
  title: string;
  description: string;
  severity: (typeof SEVERITIES)[number];
}

const EMPTY_FORM: NewMarkerForm = {
  markerType: 'admin_marker',
  category: '',
  latitude: null,
  longitude: null,
  title: '',
  description: '',
  severity: 'medium',
};

export default function MarkersPage() {
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  // "Add Marker" form state (A-09: admins manually place incident/
  // checkpoint/hotspot markers with coordinates, category, description,
  // severity -- per features.md. No map-click placement yet, just direct
  // lat/lng entry -- a click-to-place UX can be layered on later using the
  // same submit handler).
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewMarkerForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // CSV bulk import (A-09) — cold-start pre-seeding and ongoing re-seeding
  // without engineering involvement. See BulkImportMarkersModal for the
  // full validating/errors/duplicates/success state machine.
  const [showBulkImport, setShowBulkImport] = useState(false);

  const fetchMarkers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient<{ markers: MapMarker[] }>('/v1/admin/markers');
      setMarkers(data.markers ?? []);
    } catch (err) {
      setError('Failed to load map markers.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkers();
  }, [fetchMarkers]);

  async function handleAction(id: string, action: 'verify' | 'reject') {
    setActionId(`${id}-${action}`);
    try {
      // The backend's PATCH /v1/admin/markers/:id (see
      // apps/api/src/routes/map-marker.routes.ts's MarkerUpdateSchema)
      // takes a `verificationStatus` enum value, not an `action` verb --
      // sending { action } was silently ignored (zod isn't .strict()) and
      // never actually changed anything.
      await apiClient(`/v1/admin/markers/${id}`, {
        method: 'PATCH',
        body:
          action === 'verify'
            ? { verificationStatus: 'verified' }
            // Per README's cold-start strategy: "Rejected -- admin
            // explicitly rejects as false/malicious -- hidden from map."
            // isActive: false is what actually hides it (verification
            // status alone doesn't affect map/nearby-query visibility).
            : { verificationStatus: 'rejected', isActive: false },
      });
      await fetchMarkers();
    } catch (err) {
      console.error(err);
    } finally {
      setActionId(null);
    }
  }

  async function handleCreateMarker(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (form.latitude == null || form.longitude == null) {
      setFormError('Place the marker on the map (click, search, or drag) before submitting.');
      return;
    }
    if (!form.title.trim()) {
      setFormError('Title is required.');
      return;
    }

    setSubmitting(true);
    try {
      // POST /v1/admin/markers validates against MapMarkerCreateSchema
      // (packages/shared), which -- unlike the flat GET response shape --
      // DOES require a nested `location` object. `source: 'admin_manual'`
      // matches README's cold-start Layer 1/2 convention for dashboard-
      // placed markers (vs. 'user_report' for mobile incident reports,
      // wired automatically in apps/api/src/services/incident.service.ts).
      await apiClient('/v1/admin/markers', {
        method: 'POST',
        body: {
          markerType: form.markerType,
          category: form.category.trim() || undefined,
          location: { latitude: form.latitude, longitude: form.longitude },
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          severity: form.severity,
          source: 'admin_manual',
        },
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await fetchMarkers();
    } catch (err) {
      setFormError('Failed to create marker. Check the values and try again.');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Map Markers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Place, verify, and manage community-submitted and admin-placed safety markers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulkImport(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Cancel' : 'Add Marker'}
          </button>
          <button
            onClick={fetchMarkers}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreateMarker}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
        >
          <h2 className="text-sm font-semibold text-slate-700">New marker</h2>

          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Marker type</span>
              <select
                value={form.markerType}
                onChange={(e) => setForm({ ...form, markerType: e.target.value as NewMarkerForm['markerType'] })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {MARKER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-500">Severity</span>
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value as NewMarkerForm['severity'] })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <div className="sm:col-span-2">
              <span className="text-xs font-medium text-slate-500">Location</span>
              <div className="mt-1">
                <MarkerLocationPicker
                  latitude={form.latitude}
                  longitude={form.longitude}
                  onChange={(latitude, longitude) => setForm((f) => ({ ...f, latitude, longitude }))}
                />
              </div>
            </div>

            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-slate-500">Title</span>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Kidnapping Hotspot — Ore"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-slate-500">Category (optional)</span>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. FRSC checkpoint"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-slate-500">Description (optional)</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting && (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              Create marker
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {!loading && !error && markers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MapPin className="h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-600">No markers found</h3>
          <p className="mt-1 text-sm text-slate-400">No map markers have been submitted yet.</p>
        </div>
      )}

      {!loading && !error && markers.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Title / Description</th>
                  <th className="px-6 py-3">Location</th>
                  <th className="px-6 py-3">Severity</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Weight</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {markers.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-6 py-3 text-sm font-medium capitalize text-slate-700">
                      {m.markerType.replace(/_/g, ' ')}
                    </td>
                    <td className="px-6 py-3 max-w-xs">
                      <p className="truncate text-sm font-medium text-slate-700">{m.title}</p>
                      {m.description && (
                        <p className="truncate text-xs text-slate-500">{m.description}</p>
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-500">
                      {m.latitude.toFixed(4)}, {m.longitude.toFixed(4)}
                    </td>
                    <td className="px-6 py-3 text-sm capitalize text-slate-600">{m.severity}</td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          m.verificationStatus === 'verified'
                            ? 'bg-green-100 text-green-700'
                            : m.verificationStatus === 'rejected' || m.verificationStatus === 'disputed'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {m.verificationStatus.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-500">{m.verificationWeight}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAction(m.id, 'verify')}
                          disabled={actionId !== null || m.verificationStatus === 'verified'}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                        >
                          {actionId === `${m.id}-verify` && (
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          )}
                          Verify
                        </button>
                        <button
                          onClick={() => handleAction(m.id, 'reject')}
                          disabled={actionId !== null || m.verificationStatus === 'rejected'}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                        >
                          {actionId === `${m.id}-reject` && (
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          )}
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && (
        <p className="text-xs text-slate-400">
          Showing {markers.length} marker{markers.length !== 1 ? 's' : ''}
        </p>
      )}

      {showBulkImport && (
        <BulkImportMarkersModal
          onClose={() => setShowBulkImport(false)}
          onImported={fetchMarkers}
        />
      )}
    </div>
  );
}
