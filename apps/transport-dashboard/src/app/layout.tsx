import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'SafePass — Transport Partner Dashboard',
  description: 'Fleet, driver, and vehicle management for transport partners',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 font-sans text-slate-dark antialiased">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
