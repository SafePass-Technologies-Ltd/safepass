/// Transport Dashboard — Main Page (Screen 34: Transport Partner Overview)
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Car, Users, FileText, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

interface OverviewStats {
  activeVehicles: number;
  activeDrivers: number;
  linkedTripsToday: number;
  verifiedVehicles: number;
  totalVehicles: number;
}

async function fetchOverviewStats(): Promise<OverviewStats> {
  // No single "overview" endpoint exists -- Screen 34's stats cards
  // (active vehicles, active drivers, linked trips today, verification
  // status) are each derived from the same list endpoints the Vehicles/
  // Drivers/Trips pages already use.
  const [vehiclesRes, driversRes, tripsRes] = await Promise.all([
    apiClient<{ vehicles: Array<{ status: string; isVerified: boolean }> }>('/v1/vehicles'),
    apiClient<{ drivers: Array<{ status: string }> }>('/v1/drivers'),
    apiClient<{ trips: Array<{ createdAt?: string | null; scheduledDeparture?: string | null; status: string }> }>(
      '/v1/trips'
    ),
  ]);

  const vehicles = vehiclesRes.vehicles ?? [];
  const drivers = driversRes.drivers ?? [];
  const trips = tripsRes.trips ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const linkedTripsToday = trips.filter((t) => {
    const date = (t.scheduledDeparture ?? t.createdAt)?.slice(0, 10);
    return date === today;
  }).length;

  return {
    activeVehicles: vehicles.filter((v) => v.status === 'active').length,
    activeDrivers: drivers.filter((d) => d.status === 'active').length,
    linkedTripsToday,
    verifiedVehicles: vehicles.filter((v) => v.isVerified).length,
    totalVehicles: vehicles.length,
  };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await fetchOverviewStats());
    } catch {
      // Non-fatal -- cards just show "—" below if stats couldn't load.
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-dark">Transport Partner Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Fleet, driver, and vehicle management</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Vehicles"
          value={loading ? '—' : String(stats?.activeVehicles ?? 0)}
          change="Manage fleet"
          changeType="neutral"
          icon={Car}
        />
        <StatsCard
          title="Active Drivers"
          value={loading ? '—' : String(stats?.activeDrivers ?? 0)}
          change="Manage drivers"
          changeType="neutral"
          icon={Users}
        />
        <StatsCard
          title="Linked Trips Today"
          value={loading ? '—' : String(stats?.linkedTripsToday ?? 0)}
          change="View all trips"
          changeType="neutral"
          icon={FileText}
        />
        <StatsCard
          title="Verification Status"
          value={loading ? '—' : `${stats?.verifiedVehicles ?? 0}/${stats?.totalVehicles ?? 0}`}
          change="Vehicles verified"
          changeType={
            stats && stats.totalVehicles > 0 && stats.verifiedVehicles === stats.totalVehicles
              ? 'positive'
              : 'neutral'
          }
          icon={ShieldCheck}
        />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <Car className="mx-auto h-12 w-12 text-slate-300" />
        <h3 className="mt-3 text-lg font-semibold text-slate-600">Fleet Management</h3>
        <p className="mt-1 text-sm text-slate-400">Add vehicles, assign drivers, and upload documents to get started.</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard/vehicles"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            Add Vehicle
          </Link>
          <Link
            href="/dashboard/drivers"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Add Driver
          </Link>
          <Link
            href="/dashboard/documents"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Upload Documents
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatsCard({ title, value, change, changeType, icon: Icon }: {
  title: string; value: string; change: string;
  changeType: 'positive' | 'negative' | 'neutral';
  icon: React.ComponentType<{ className?: string }>;
}) {
  // Color the change indicator based on direction — neutral stays the
  // default slate tone used for informational (non-trend) captions.
  const changeColor = {
    positive: 'text-green-600',
    negative: 'text-red-600',
    neutral: 'text-slate-500',
  }[changeType];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <Icon className="h-5 w-5 text-slate-400" />
      </div>
      <p className="mt-2 text-3xl font-bold text-slate-dark">{value}</p>
      <p className={`mt-1 text-xs ${changeColor}`}>{change}</p>
    </div>
  );
}
