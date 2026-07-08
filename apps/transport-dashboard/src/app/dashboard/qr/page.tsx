'use client';

import { useState, useEffect, useCallback } from 'react';
import { QrCode, Loader2, Download } from 'lucide-react';
import QRCode from 'qrcode';
import { apiClient } from '@/lib/api-client';

interface Vehicle {
  id: string;
  plateNumber: string;
  make: string | null;
  model: string | null;
  qrCodeUrl: string | null;
  qrGeneratedAt: string | null;
}

interface QrState {
  loading: boolean;
  /** Client-rendered data: URI (PNG) encoding the vehicle's verification URL. */
  imageDataUrl: string | null;
  error: string | null;
}

export default function QrPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrStates, setQrStates] = useState<Record<string, QrState>>({});

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient<{ vehicles: Vehicle[] }>('/v1/vehicles');
      setVehicles(data.vehicles ?? []);
      setError(null);

      // Vehicles that already have a QR code (generated on a previous
      // visit) render it immediately from the stored verification URL --
      // no need to hit "Generate" again just to see it.
      for (const v of data.vehicles ?? []) {
        if (v.qrCodeUrl) void renderQr(v.id, v.qrCodeUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  /**
   * Renders `verificationUrl` into an actual scannable QR code image,
   * entirely client-side (no image storage/rendering pipeline exists on
   * the backend -- see apps/api/src/services/vehicle.service.ts's
   * generateVehicleQr(), which only mints the token/URL a QR code encodes).
   */
  async function renderQr(vehicleId: string, verificationUrl: string) {
    setQrStates((prev) => ({ ...prev, [vehicleId]: { loading: true, imageDataUrl: null, error: null } }));
    try {
      const imageDataUrl = await QRCode.toDataURL(verificationUrl, { width: 320, margin: 2 });
      setQrStates((prev) => ({ ...prev, [vehicleId]: { loading: false, imageDataUrl, error: null } }));
    } catch (err) {
      setQrStates((prev) => ({
        ...prev,
        [vehicleId]: { loading: false, imageDataUrl: null, error: err instanceof Error ? err.message : 'Failed to render QR' },
      }));
    }
  }

  async function generateQr(vehicleId: string) {
    setQrStates((prev) => ({ ...prev, [vehicleId]: { loading: true, imageDataUrl: null, error: null } }));
    try {
      // POST /v1/vehicles/:id/qr mints a fresh token + verification URL
      // (apps/api/src/routes/vehicle.routes.ts) -- invalidates any
      // previous token for this vehicle immediately, per Screen 35's
      // "Regenerate if compromised."
      const vehicle = await apiClient<Vehicle>(`/v1/vehicles/${vehicleId}/qr`, { method: 'POST' });
      if (!vehicle.qrCodeUrl) throw new Error('No verification URL in response');
      await renderQr(vehicleId, vehicle.qrCodeUrl);
      setVehicles((prev) => prev.map((v) => (v.id === vehicleId ? vehicle : v)));
    } catch (err) {
      setQrStates((prev) => ({
        ...prev,
        [vehicleId]: { loading: false, imageDataUrl: null, error: err instanceof Error ? err.message : 'Failed to generate QR' },
      }));
    }
  }

  function downloadQr(dataUrl: string, plateNumber: string) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-${plateNumber}.png`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-dark">QR Codes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Generate and download QR codes for your vehicles — each links to a public verification page.
        </p>
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

                {qr?.loading ? (
                  <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                  </div>
                ) : qr?.imageDataUrl ? (
                  <div className="flex flex-col items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- qr.imageDataUrl is a locally rendered data: URI (base64 PNG), not a remote asset next/image can optimize */}
                    <img
                      src={qr.imageDataUrl}
                      alt={`QR code for ${v.plateNumber}`}
                      className="h-40 w-40 rounded-lg border border-slate-200 object-contain"
                    />
                    <div className="flex w-full gap-2">
                      <button
                        onClick={() => downloadQr(qr.imageDataUrl!, v.plateNumber)}
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                      >
                        <Download className="h-4 w-4" /> Download PNG
                      </button>
                      <button
                        onClick={() => generateQr(v.id)}
                        title="Regenerate (invalidates the previous code if it's been compromised)"
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50"
                      >
                        Regenerate
                      </button>
                    </div>
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
                      <QrCode className="h-4 w-4" />
                      Generate QR
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
