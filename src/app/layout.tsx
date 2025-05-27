
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from '@/contexts/AuthContext';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'N빵친구 - 회비 관리',
  description: '친구들과의 회비 및 모임 정산을 손쉽게 관리하세요.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    // This console.warn will only appear in the server logs (Vercel function logs)
    console.warn("WARNING: ADMIN_EMAIL environment variable is not set. Admin functionality will not work correctly.");
  }

  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider adminEmail={adminEmail}>
          <SidebarProvider>
            <AppShell>
              {children}
            </AppShell>
          </SidebarProvider>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
