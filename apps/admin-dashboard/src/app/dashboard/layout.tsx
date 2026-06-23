/// Admin Dashboard Layout — Sidebar + Top Bar + Content Area
///
/// This is the authenticated layout shell with:
/// - Left sidebar navigation
/// - Top header bar with user info
/// - Main content area

'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Map,
  AlertTriangle,
  Users,
  Wallet,
  Flag,
  LogOut,
  Menu,
  X,
  ChevronRight,
  MapPin,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';
import { useActiveTrips } from '@/hooks/useActiveTrips';
import { apiClient } from '@/lib/api-client';

/** Derive initials from a full name, e.g. "Jane Doe" -> "JD", "Jane" -> "J". */
function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

const navigation = [
  {
    name: 'Live Trip Map',
    href: '/dashboard',
    icon: Map,
    description: 'Monitor all active trips in real time',
  },
  {
    name: 'Trip Management',
    href: '/dashboard/trips',
    icon: Flag,
    description: 'Filter, search, and manage trips',
  },
  {
    name: 'Incidents',
    href: '/dashboard/incidents',
    icon: AlertTriangle,
    description: 'Review, verify, and manage reported incidents',
  },
  {
    name: 'Users',
    href: '/dashboard/users',
    icon: Users,
    description: 'User management and profiles',
  },
  {
    name: 'Payments',
    href: '/dashboard/payments',
    icon: Wallet,
    description: 'Wallet balances and transactions',
  },
  {
    name: 'Map Markers',
    href: '/dashboard/markers',
    icon: MapPin,
    description: 'Verify and manage map markers',
  },
  {
    name: 'Role Upgrades',
    href: '/dashboard/role-upgrades',
    icon: ShieldCheck,
    description: 'Approve corporate, transport, and admin access requests',
  },
  {
    name: 'Subscriptions',
    href: '/dashboard/subscriptions',
    icon: CreditCard,
    description: 'Review and activate org subscription plan requests',
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { trips } = useActiveTrips(30_000); // 30s poll for header only
  const [initials, setInitials] = useState<string | null>(null);

  const activeCount = trips.filter(
    (t) => t.status === 'active' || t.status === 'delayed'
  ).length;

  useEffect(() => {
    apiClient<{ fullName: string }>('/v1/users/me')
      .then((data) => setInitials(getInitials(data.fullName ?? '')))
      .catch(() => setInitials(''));
  }, []);

  function handleSignOut() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    router.push('/');
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 transform border-r border-slate-200 bg-white transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Sidebar header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Image src="/safepass-logo.png" alt="SafePass" width={20} height={20} className="object-contain" />
            </div>
            <span className="text-lg font-bold text-slate-dark">SafePass</span>
          </div>
          <button
            className="rounded-lg p-1 hover:bg-slate-100 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`
                  group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                  ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }
                `}
              >
                <item.icon className={`h-5 w-5 ${isActive ? 'text-primary' : 'text-slate-400'}`} />
                <span className="flex-1">{item.name}</span>
                {isActive && <ChevronRight className="h-4 w-4 text-primary" />}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="border-t border-slate-200 p-3">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="h-5 w-5 text-slate-400" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top header bar */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
          <button
            className="rounded-lg p-1.5 hover:bg-slate-100 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5 text-slate-600" />
          </button>

          <div className="flex flex-1 items-center justify-end gap-4">
            {/* Active trips indicator */}
            <div className="flex items-center gap-2 rounded-full bg-safety-green/10 px-3 py-1 text-xs font-medium text-safety-green">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-safety-green opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-safety-green" />
              </span>
              {activeCount} active trip{activeCount !== 1 ? 's' : ''}
            </div>

            {/* User avatar — links to profile page */}
            <Link
              href="/dashboard/profile"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              {initials}
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
