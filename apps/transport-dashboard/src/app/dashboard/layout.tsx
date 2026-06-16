/// Transport Dashboard Layout
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Map, Car, Users, Wallet, FileText, QrCode, LogOut, Menu, X, Truck, Bell } from 'lucide-react';
import { getUserSession } from '@/lib/auth-utils';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Map },
  { name: 'Vehicles', href: '/dashboard/vehicles', icon: Car },
  { name: 'Drivers', href: '/dashboard/drivers', icon: Users },
  { name: 'Trips', href: '/dashboard/trips', icon: Map },
  { name: 'Documents', href: '/dashboard/documents', icon: FileText },
  { name: 'QR Codes', href: '/dashboard/qr', icon: QrCode },
  { name: 'Wallet', href: '/dashboard/wallet', icon: Wallet },
  { name: 'Alerts', href: '/dashboard/alerts', icon: Bell },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Redirect to onboarding if the user hasn't set up a company profile yet.
  useEffect(() => {
    if (pathname === '/dashboard/onboarding') return;
    const session = getUserSession();
    if (session && !session.orgId && !localStorage.getItem('org_id')) {
      router.replace('/dashboard/onboarding');
    }
  }, [pathname, router]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-slate-200 bg-white transition-transform lg:relative lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-4">
          <Truck className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold text-slate-dark">SafePass Fleet</span>
          <button className="ml-auto rounded-lg p-1 hover:bg-slate-100 lg:hidden" onClick={() => setSidebarOpen(false)}><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link key={item.name} href={item.href} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100'}`}>
                <item.icon className={`h-5 w-5 ${isActive ? 'text-primary' : 'text-slate-400'}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <button onClick={() => { localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token'); localStorage.removeItem('org_id'); router.push('/'); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
            <LogOut className="h-5 w-5 text-slate-400" /> Sign Out
          </button>
        </div>
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center border-b border-slate-200 bg-white px-4 lg:px-6">
          <button className="rounded-lg p-1.5 hover:bg-slate-100 lg:hidden" onClick={() => setSidebarOpen(true)}><Menu className="h-5 w-5 text-slate-600" /></button>
          <div className="flex flex-1 items-center justify-end">
            <Link href="/dashboard/profile" className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary transition-colors hover:bg-primary/20">TP</Link>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
