/// Corporate Dashboard Layout — Sidebar + Content Area
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Map, Users, Wallet, Flag, Building2, LogOut, Menu, X, ChevronRight, Bell,
} from 'lucide-react';
import { getUserSession } from '@/lib/auth-utils';
import { apiClient } from '@/lib/api-client';

/** Derive initials from a full name, e.g. "Jane Doe" -> "JD", "Jane" -> "J". */
function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

const navigation = [
  { name: 'Live Trip Map', href: '/dashboard', icon: Map, description: 'Monitor staff trips' },
  { name: 'Staff', href: '/dashboard/staff', icon: Users, description: 'Manage staff members' },
  { name: 'Trip Registration', href: '/dashboard/trips', icon: Flag, description: 'Register staff trips' },
  { name: 'Live Staff Map', href: '/dashboard/map', icon: Map, description: 'Real-time staff locations' },
  { name: 'Wallet', href: '/dashboard/wallet', icon: Wallet, description: 'Corporate wallet' },
  { name: 'Alerts', href: '/dashboard/alerts', icon: Bell, description: 'Emergency alerts for staff' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [initials, setInitials] = useState<string | null>(null);

  useEffect(() => {
    apiClient<{ fullName: string }>('/v1/users/me')
      .then((data) => setInitials(getInitials(data.fullName ?? '')))
      .catch(() => setInitials(''));
  }, []);

  // Redirect to onboarding if the user hasn't set up a company profile yet.
  //
  // The JWT may be stale (issued before the org was created), so we also check
  // `org_id` in localStorage as a durable fallback. The onboarding page writes
  // this key on successful org creation and it is never cleared here — it
  // persists across all navigations until the user signs out.
  //
  // `pending_role_upgrade` is set when onboarding has been submitted but is
  // still awaiting admin approval — the user has no orgId yet, but they
  // should see the pending-approval screen rather than being bounced back
  // into the onboarding form repeatedly.
  useEffect(() => {
    if (pathname === '/dashboard/onboarding') return;
    const session = getUserSession();
    if (session && !session.orgId) {
      const localOrgId = localStorage.getItem('org_id');
      if (localOrgId) return; // org exists locally — JWT is just stale
      if (localStorage.getItem('pending_role_upgrade')) return; // awaiting admin review
      router.replace('/dashboard/onboarding');
    }
  }, [pathname, router]);

  function handleSignOut() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('org_id');
    localStorage.removeItem('pending_role_upgrade');
    router.push('/');
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-slate-200 bg-white transition-transform lg:relative lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-4">
          <Building2 className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold text-slate-dark">SafePass Corp</span>
          <button className="ml-auto rounded-lg p-1 hover:bg-slate-100 lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.name} href={item.href} className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100'}`}>
                <item.icon className={`h-5 w-5 ${isActive ? 'text-primary' : 'text-slate-400'}`} />
                <span className="flex-1">{item.name}</span>
                {isActive && <ChevronRight className="h-4 w-4 text-primary" />}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <button onClick={handleSignOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
            <LogOut className="h-5 w-5 text-slate-400" /> Sign Out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center border-b border-slate-200 bg-white px-4 lg:px-6">
          <button className="rounded-lg p-1.5 hover:bg-slate-100 lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5 text-slate-600" />
          </button>
          <div className="flex flex-1 items-center justify-end">
            <Link href="/dashboard/profile" className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary transition-colors hover:bg-primary/20">{initials}</Link>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
