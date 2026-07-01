/// Transport Dashboard — Main Page
'use client';

import { Car, Users, Wallet, FileText } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-dark">Transport Partner Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Fleet, driver, and vehicle management</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Vehicles" value="—" change="Manage fleet" changeType="neutral" icon={Car} />
        <StatsCard title="Drivers" value="—" change="Active drivers" changeType="neutral" icon={Users} />
        <StatsCard title="Wallet" value="₦0.00" change="Fund wallet" changeType="neutral" icon={Wallet} />
        <StatsCard title="Documents" value="—" change="Pending verification" changeType="neutral" icon={FileText} />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <Car className="mx-auto h-12 w-12 text-slate-300" />
        <h3 className="mt-3 text-lg font-semibold text-slate-600">Fleet Management</h3>
        <p className="mt-1 text-sm text-slate-400">Add vehicles, assign drivers, and upload documents to get started.</p>
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
