"use client";

"use client";

// Removed useState, useEffect as ReserveFundClient handles its own data.
// Removed getFriendGroupsByUser, getReserveFundBalanceByGroup, getLoggedReserveFundTransactionsByGroup
// Removed Card components if page is just a wrapper.
// Removed FriendGroup, ReserveFundTransaction types if no longer needed here.
// Removed useRouter, usePathname if tabs are removed or handled differently.

import { ReserveFundClient } from '@/components/reserve-fund/ReserveFundClient';
import { useAuth } from '@/contexts/AuthContext'; // Keep for auth guard
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react'; // For loading state

export default function ReserveFundByGroupPage() {
  const { appUser, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-xl text-muted-foreground">인증 정보 로딩 중...</p>
      </div>
    );
  }

  if (!appUser) {
    // This case should ideally be handled by AuthContext/AppShell redirection for protected routes
    return (
       <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">로그인이 필요합니다</h1>
        <p className="text-muted-foreground">이 페이지에 접근하려면 로그인이 필요합니다.</p>
         <Button asChild className="mt-4">
          <Link href="/login">로그인 페이지로 이동</Link>
        </Button>
      </div>
    );
  }

  // The ReserveFundClient component now handles its own group selection and data fetching.
  // This page becomes a simple wrapper that ensures user is authenticated.
  return (
    <div className="space-y-6">
      {/*
        The page title "그룹별 회비 관리" could be here if desired,
        or it can be part of the ReserveFundClient's internal layout.
        For simplicity, let ReserveFundClient manage its titles.
      */}
      <ReserveFundClient />
    </div>
  );
}
