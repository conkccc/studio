'use client';

import { useEffect, useState } from 'react'; // useEffect는 authLoading 감지에만 사용되므로, authLoading 직접 사용 시 useState만 필요할 수 있음.
import { ReserveFundClient } from '@/components/reserve-fund/ReserveFundClient';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
// 미사용 import 주석 처리 또는 제거
// import type { ReserveFundTransaction } from '@/lib/types';
// import { getReserveFundBalance, getLoggedReserveFundTransactions } from '@/lib/data-store';
// import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import { useRouter, usePathname } from 'next/navigation';


export default function ReserveFundPage() {
  const { currentUser, loading: authLoading } = useAuth();

  // pageReady 상태 및 관련 useEffect 제거하고 authLoading 직접 사용
  // const [pageReady, setPageReady] = useState(false);
  // useEffect(() => {
  //   if (!authLoading) {
  //     setPageReady(true);
  //   }
  // }, [authLoading]);

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">회비 페이지 로딩 중...</p>
      </div>
    );
  }

  if (!currentUser) {
     return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">로그인이 필요합니다</h1>
        <p className="text-muted-foreground">회비 정보를 보려면 로그인이 필요합니다.</p>
         <Button asChild className="mt-4">
          <Link href="/login">로그인 페이지로 이동</Link>
        </Button>
      </div>
    );
  }

  // 역할 기반 접근 제어는 ReserveFundClient 내부 또는 AppShell에서 처리.
  // 이 페이지는 로그인된 사용자는 기본적으로 접근 가능.

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">그룹 회비 관리</h1>
        <p className="text-muted-foreground">
          그룹을 선택하여 회비 잔액을 설정하고 사용 내역을 확인하세요.
        </p>
      </div>
      <ReserveFundClient />
    </div>
  );
}
