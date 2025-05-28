
import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from "@/components/ui/toaster";
import { SidebarProvider } from '@/components/ui/sidebar'; // Ensure SidebarProvider is imported

export const metadata: Metadata = {
  title: 'N빵친구 - 모임 정산 도우미',
  description: '친구들과의 회비 및 모임 정산을 손쉽게 관리하세요.',
  icons: {
    icon: '/favicon.ico', // Make sure you have a favicon.ico in your /public folder
  },
};

export const viewport: Viewport = {
  themeColor: [ // Example theme color, adjust as needed
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // Optional: to prevent zooming on mobile if desired
  // userScalable: false, // Optional: to prevent zooming on mobile if desired
};


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No longer reading ADMIN_EMAIL here, AuthContext handles admin logic via Firestore
  return (
    <html lang="ko" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="geist-sans geist-mono antialiased">
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
