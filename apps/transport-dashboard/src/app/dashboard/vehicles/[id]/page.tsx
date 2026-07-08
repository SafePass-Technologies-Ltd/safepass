'use client';

/// Vehicle Detail (Screen 35): "All vehicle info + assigned driver +
/// linked trips + documents + QR code."
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Car, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getUserSession } from '@/lib/auth-utils';
import VehicleQrCard from '@/components/VehicleQrCard';

interface Vehicle {
  id: string;
  plateNumber: string;
  make: string | null;
  model: string | null;
  vehicleType: string | null;
  capacity: number | null;
  year: number | null;
  status: string;
  isVerified: boolean;
  qrCodeUrl: string | null;
}

interface Driver {
  id: string;
  fullName: string | null;
  phone: string | null;
  licenseNumber: string | null;
  assignedVehicleId: string | null;
}

interface Trip {
  id: string;
  status: string;
  vehiclePlateNumber?: string | null;
  driverName?: string | null;
  origin?: { name?: string | null } | null;
  destination?: { name?: string | null } | null;
  createdAt?: string | null;
}

interface Doc {
  id: string;
  documentName: string;
  documentType: string;
  status: string;
  expiryDate: string | null;
}

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export default function VehicleDetailPage() {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const orgId = getUserSession()?.orgId;

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [assignedDrivers, setAssignedDrivers] = useState<Driver[]>([]);
  const [linkedTrips, setLinkedTrips] = useState<Trip[]>([]);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [vehicleData, driversData, tripsData] = await Promise.all([
        apiClient<Vehicle>(`/v1/vehicles/${vehicleId}`),
        apiClient<{ drivers: Driver[] }>('/v1/drivers'),
        apiClient<{ trips: Trip[] }>('/v1/trips'),
      ]);
      setVehicle(vehicleData);
      setAssignedDrivers(driversData.drivers.filter((d) => d.assignedVehicleId === vehicleId));
      setLinkedTrips(
        tripsData.trips.filter((t) => t.vehiclePlateNumber === vehicleData.plateNumber)
      );

      // Documents endpoint requires organizationId explicitly + isn't
      // wrapped by the shared apiClient in this app (see documents/page.tsx
      // for why -- same fetch-with-manual-auth pattern reused here).
      if (orgId) {
        const token = localStorage.getItem('access_token');
        const docsRes = await fetch(
          `${BASE_URL}/v1/documents?organizationId=${orgId}&entityType=vehicle&entityId=${vehicleId}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        if (docsRes.ok) {
          const docsData = await docsRes.json();
          setDocuments(docsData.documents ?? []);
        }
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicle');
    } finally {
      setLoading(false);
    }
  }, [vehicleId, orgId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Car className="mb-3 h-12 w-12 text-slate-300" />
        <p className="text-sm text-slate-400">{error ?? 'Vehicle not found'}</p>
        <Link href="/dashboard/vehicles" className="mt-4 text-sm font-medium text-primary hover:underline">
          Back to Vehicles
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/vehicles"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Vehicles
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">{vehicle.plateNumber}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'No make/model set'}
          </p>
        </div>
        <div className="flex gap-2">
          <StatusPill label={vehicle.status} tone={vehicle.status === 'active' ? 'green' : 'slate'} />
          <StatusPill label={vehicle.isVerified ? 'Verified' : 'Unverified'} tone={vehicle.isVerified ? 'green' : 'amber'} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Vehicle info */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Vehicle Info</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <Field label="Type" value={vehicle.vehicleType ?? '—'} />
            <Field label="Capacity" value={vehicle.capacity?.toString() ?? '—'} />
            <Field label="Year" value={vehicle.year?.toString() ?? '—'} />
          </dl>

          <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Assigned Driver{assignedDrivers.length !== 1 ? 's' : ''}
          </h3>
          {assignedDrivers.length === 0 ? (
            <p className="text-sm text-slate-400">No driver assigned yet — assign one from the Drivers page.</p>
          ) : (
            <ul className="space-y-2">
              {assignedDrivers.map((d) => (
                <li key={d.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-dark">{d.fullName ?? '—'}</span>{' '}
                  <span className="text-slate-500">
                    {d.phone ?? ''} {d.licenseNumber ? `· ${d.licenseNumber}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Linked Trips ({linkedTrips.length})
          </h3>
          {linkedTrips.length === 0 ? (
            <p className="text-sm text-slate-400">No trips linked to this vehicle yet.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-100">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {linkedTrips.slice(0, 10).map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-400" title={t.id}>
                        {t.id.slice(0, 8)}…
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {t.origin?.name ?? '?'} → {t.destination?.name ?? '?'}
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill label={t.status} tone={t.status === 'active' ? 'green' : 'slate'} small />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Documents ({documents.length})
          </h3>
          {documents.length === 0 ? (
            <p className="text-sm text-slate-400">
              No documents uploaded for this vehicle yet —{' '}
              <Link href="/dashboard/documents" className="text-primary hover:underline">
                upload one
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-2">
              {documents.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="text-slate-dark">{d.documentName}</span>
                  <StatusPill
                    label={d.status}
                    tone={d.status === 'valid' ? 'green' : d.status === 'expired' ? 'red' : 'amber'}
                    small
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* QR code */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">QR Code</h2>
          <VehicleQrCard
            vehicleId={vehicle.id}
            plateNumber={vehicle.plateNumber}
            initialVerificationUrl={vehicle.qrCodeUrl}
            onGenerated={(v) => setVehicle((prev) => (prev ? { ...prev, qrCodeUrl: v.qrCodeUrl } : prev))}
          />
        </section>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-dark">{value}</dd>
    </div>
  );
}

function StatusPill({
  label,
  tone,
  small,
}: {
  label: string;
  tone: 'green' | 'amber' | 'red' | 'slate';
  small?: boolean;
}) {
  const toneCls = {
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-slate-100 text-slate-500',
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium capitalize ${toneCls} ${
        small ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      }`}
    >
      {label}
    </span>
  );
}
