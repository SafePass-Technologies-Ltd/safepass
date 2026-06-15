/// Corporate Dashboard Layout — Sidebar + Content Area
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Map, Users, Wallet, Flag, Building2, LogOut, Menu, X, ChevronRight,
} from 'lucide-react';
import { getUserSession } from '@/lib/auth-utils';

const navigation = [
  { name: 'Live Trip Map', href: '/dashboard', icon: Map, description: 'Monitor staff trips' },
  { name: 'Staff', href: '/dashboard/staff', icon: Users, description: 'Manage staff members' },
  { name: 'Trip History', href: '/dashboard/trips', icon: Flag, description: 'Past trips and reports' },
  { name: 'Wallet', href: '/dashboard/wallet', icon: Wallet, description: 'Corporate wallet' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Redirect to onboarding if the user hasn't set up a company profile yet.
  useEffect(() => {
    if (pathname === '/dashboard/onboarding') return;
    const session = getUserSession();
    if (session && !session.orgId) {
      router.replace('/dashboard/onboarding');
    }
  }, [pathname, router]);

  function handleSignOut() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
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
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">CO</div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
