/// Corporate Dashboard — Root Layout
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'SafePass — Corporate Dashboard',
  description: 'Staff trip monitoring and safety management for organizations',
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
