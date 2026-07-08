'use client';

/// VehicleQrCard — shared QR generate/render/download UI for a single
/// vehicle (T-05 / Screen 35's "QR Generation" element). Used by both the
/// standalone QR Codes page (dashboard/qr) and the Vehicle Detail view
/// (dashboard/vehicles/[id]).
///
/// No image storage/rendering pipeline exists on the backend --
/// POST /v1/vehicles/:id/qr only mints a token + verification URL; the
/// actual scannable QR image is rendered entirely client-side here from
/// that URL.
import { useState, useEffect, useCallback } from 'react';
import { QrCode, Loader2, Download } from 'lucide-react';
import QRCodeLib from 'qrcode';
import { apiClient } from '@/lib/api-client';

interface VehicleQrCardProps {
  vehicleId: string;
  plateNumber: string;
  /** Pre-existing verification URL (from the vehicle's own qrCodeUrl field),
   * so an already-generated QR renders immediately without an extra API
   * call. Null if none has been generated yet. */
  initialVerificationUrl: string | null;
  /** Called with the updated vehicle response after a (re)generate, so the
   * parent can keep its own vehicle state in sync. */
  onGenerated?: (vehicle: { qrCodeUrl: string | null }) => void;
}

export default function VehicleQrCard({
  vehicleId,
  plateNumber,
  initialVerificationUrl,
  onGenerated,
}: VehicleQrCardProps) {
  const [loading, setLoading] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const renderQr = useCallback(async (verificationUrl: string) => {
    setLoading(true);
    setError(null);
    try {
      const dataUrl = await QRCodeLib.toDataURL(verificationUrl, { width: 320, margin: 2 });
      setImageDataUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to render QR');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialVerificationUrl) void renderQr(initialVerificationUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run if the vehicle identity changes
  }, [vehicleId]);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const vehicle = await apiClient<{ qrCodeUrl: string | null }>(`/v1/vehicles/${vehicleId}/qr`, {
        method: 'POST',
      });
      if (!vehicle.qrCodeUrl) throw new Error('No verification URL in response');
      await renderQr(vehicle.qrCodeUrl);
      onGenerated?.(vehicle);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Failed to generate QR');
    }
  }

  function download() {
    if (!imageDataUrl) return;
    const a = document.createElement('a');
    a.href = imageDataUrl;
    a.download = `qr-${plateNumber}.png`;
    a.click();
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
      </div>
    );
  }

  if (imageDataUrl) {
    return (
      <div className="flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- imageDataUrl is a locally rendered data: URI (base64 PNG), not a remote asset next/image can optimize */}
        <img
          src={imageDataUrl}
          alt={`QR code for ${plateNumber}`}
          className="h-40 w-40 rounded-lg border border-slate-200 object-contain"
        />
        <div className="flex w-full gap-2">
          <button
            onClick={download}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> Download PNG
          </button>
          <button
            onClick={generate}
            title="Regenerate (invalidates the previous code if it's been compromised)"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50"
          >
            Regenerate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      <button
        onClick={generate}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
      >
        <QrCode className="h-4 w-4" /> Generate QR
      </button>
    </div>
  );
}
