'use client';

import { useState, useEffect, useCallback } from 'react';
import { QrCode, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import VehicleQrCard from '@/components/VehicleQrCard';

interface Vehicle {
  id: string;
  plateNumber: string;
  make: string | null;
  model: string | null;
  qrCodeUrl: string | null;
}

export default function QrPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient<{ vehicles: Vehicle[] }>('/v1/vehicles');
      setVehicles(data.vehicles ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

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
          {vehicles.map((v) => (
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
              <VehicleQrCard
                vehicleId={v.id}
                plateNumber={v.plateNumber}
                initialVerificationUrl={v.qrCodeUrl}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
