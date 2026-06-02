/// Admin Dashboard — Main Page (Live Trip Map placeholder)
///
/// This will become the full-screen live trip map in Week 2.
/// For Week 1, it shows a summary dashboard with placeholder cards.

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Trips"
          value="12"
          change="+3 today"
          changeType="positive"
          icon="trip"
        />
        <StatsCard
          title="Incidents Today"
          value="4"
          change="2 pending review"
          changeType="neutral"
          icon="incident"
        />
        <StatsCard
          title="Users Online"
          value="47"
          change="Active monitoring"
          changeType="neutral"
          icon="user"
        />
        <StatsCard
          title="Alerts (24h)"
          value="8"
          change="2 critical"
          changeType="negative"
          icon="alert"
        />
      </div>

      {/* Map placeholder */}
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex h-96 items-center justify-center bg-slate-100">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <svg
                className="h-8 w-8 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-700">Live Trip Map</h3>
            <p className="mt-1 text-sm text-slate-500">
              Google Maps integration will be added in Week 2
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatsCardProps {
  title: string;
  value: string;
  change: string;
  changeType: 'positive' | 'negative' | 'neutral';
  icon: 'trip' | 'incident' | 'user' | 'alert';
}

function StatsCard({ title, value, change, changeType }: StatsCardProps) {
  const changeColor =
    changeType === 'positive'
      ? 'text-safety-green'
      : changeType === 'negative'
        ? 'text-safety-red'
        : 'text-slate-500';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-bold text-slate-dark">{value}</p>
      <p className={`mt-1 text-xs ${changeColor}`}>{change}</p>
    </div>
  );
}
