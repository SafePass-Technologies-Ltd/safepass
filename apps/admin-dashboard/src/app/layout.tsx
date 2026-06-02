/// SafePass Admin Dashboard — Root Layout
///
/// Provides the HTML shell, metadata, and global layout for all dashboard pages.

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'SafePass Admin Dashboard',
  description: 'Live trip monitoring, user management, and incident response for SafePass.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen antialiased">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
