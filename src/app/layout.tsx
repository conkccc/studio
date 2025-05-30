
import type { Metadata, Viewport } from 'next';
// GeistSans and GeistMono imports removed
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from "@/components/ui/toaster";
import { SidebarProvider } from '@/components/ui/sidebar';

export const metadata: Metadata = {
  title: 'N빵친구 - 모임 정산 도우미',
  description: '친구들과의 회비 및 모임 정산을 손쉽게 관리하세요.',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ADMIN_EMAIL logic removed
  return (
    <html lang="ko" className='h-full'> {/* Apply h-full to html */}
      <body className="h-full antialiased"> {/* Apply h-full to body, removed font variables */}
        <AuthProvider>
          <SidebarProvider>
            <AppShell>{children}</AppShell>
          </SidebarProvider>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
