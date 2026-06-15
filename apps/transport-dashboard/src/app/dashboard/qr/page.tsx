'use client';

import { useState, useEffect, useCallback } from 'react';
import { QrCode, Loader2, Download } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getUserSession } from '@/lib/auth-utils';

interface Vehicle {
  id: string;
  plateNumber: string;
  make: string | null;
  model: string | null;
}

interface QrState {
  loading: boolean;
  url: string | null;
  error: string | null;
}

export default function QrPage() {
  const session = getUserSession();
  const orgId = session?.orgId;

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrStates, setQrStates] = useState<Record<string, QrState>>({});

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const query = orgId ? `?organizationId=${orgId}` : '';
      const data = await apiClient<{ vehicles: Vehicle[] }>(`/v1/vehicles${query}`);
      setVehicles(data.vehicles ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  async function generateQr(vehicleId: string) {
    setQrStates((prev) => ({
      ...prev,
      [vehicleId]: { loading: true, url: null, error: null },
    }));
    try {
      const data = await apiClient<{ qrCode?: string; dataUrl?: string; url?: string }>(
        `/v1/vehicles/${vehicleId}/qr`,
        { method: 'POST' },
      );
      const url = data.dataUrl ?? data.qrCode ?? data.url ?? null;
      setQrStates((prev) => ({
        ...prev,
        [vehicleId]: { loading: false, url, error: url ? null : 'No QR data in response' },
      }));
    } catch (err) {
      setQrStates((prev) => ({
        ...prev,
        [vehicleId]: {
          loading: false,
          url: null,
          error: err instanceof Error ? err.message : 'Failed to generate QR',
        },
      }));
    }
  }

  function downloadQr(url: string, plateNumber: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${plateNumber}.png`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-dark">QR Codes</h1>
        <p className="mt-1 text-sm text-slate-500">Generate and download QR codes for your vehicles</p>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
        </div>
      ) : vehicles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16">
          <QrCode className="mb-3 h-12 w-12 text-slate-300" />
          <p className="text-sm text-slate-400">No vehicles found. Add vehicles first.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => {
            const qr = qrStates[v.id];
            return (
              <div
                key={v.id}
                className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div>
                  <p className="font-semibold text-slate-dark">{v.plateNumber}</p>
                  {(v.make || v.model) && (
                    <p className="mt-0.5 text-sm text-slate-500">
                      {[v.make, v.model].filter(Boolean).join(' ')}
                    </p>
                  )}
                </div>

                {qr?.url ? (
                  <div className="flex flex-col items-center gap-3">
                    <img
                      src={qr.url}
                      alt={`QR code for ${v.plateNumber}`}
                      className="h-40 w-40 rounded-lg border border-slate-200 object-contain"
                    />
                    <button
                      onClick={() => downloadQr(qr.url!, v.plateNumber)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      <Download className="h-4 w-4" /> Download PNG
                    </button>
                  </div>
                ) : (
                  <>
                    {qr?.error && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{qr.error}</p>
                    )}
                    <button
                      onClick={() => generateQr(v.id)}
                      disabled={qr?.loading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      {qr?.loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <QrCode className="h-4 w-4" />
                      )}
                      {qr?.loading ? 'Generating...' : 'Generate QR'}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
