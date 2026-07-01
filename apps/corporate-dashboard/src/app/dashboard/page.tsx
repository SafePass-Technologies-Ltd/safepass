/// Corporate Dashboard — Main Page
'use client';

import { Users, MapPin, Wallet, Flag } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-dark">Corporate Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Staff trip monitoring and safety management</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Staff Members" value="—" change="Manage in Staff section" changeType="neutral" icon={Users} />
        <StatsCard title="Active Staff Trips" value="0" change="No trips in progress" changeType="neutral" icon={MapPin} />
        <StatsCard title="Wallet Balance" value="₦0.00" change="Fund wallet to start" changeType="neutral" icon={Wallet} />
        <StatsCard title="Trips This Month" value="0" change="View trip history" changeType="neutral" icon={Flag} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <Users className="mx-auto h-12 w-12 text-slate-300" />
        <h3 className="mt-3 text-lg font-semibold text-slate-600">Staff Trip Monitoring</h3>
        <p className="mt-1 text-sm text-slate-400">Register staff trips from the Staff Management section to begin monitoring.</p>
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
