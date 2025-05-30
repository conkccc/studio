
'use client';

import { useEffect, useState } from 'react';
import { getReserveFundBalance, getLoggedReserveFundTransactions } from '@/lib/data-store';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ReserveFundClient } from '@/components/reserve-fund/ReserveFundClient';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { ReserveFundTransaction } from '@/lib/types';

export default function ReserveFundPage() {
  const { currentUser, isAdmin, userRole, loading: authLoading } = useAuth();
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<ReserveFundTransaction[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (authLoading && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") {
      setDataLoading(true);
      return;
    }

    if (!currentUser || !isAdmin) { 
      setDataLoading(false);
      setBalance(0);
      setTransactions([]);
      return;
    }

    const fetchData = async () => {
      setDataLoading(true);
      try {
        const [fetchedBalance, fetchedTransactions] = await Promise.all([
          getReserveFundBalance(),
          getLoggedReserveFundTransactions()
        ]);
        setBalance(fetchedBalance);
        setTransactions(fetchedTransactions);
      } catch (error) {
        console.error("Failed to fetch reserve fund data:", error);
        setBalance(0);
        setTransactions([]);
      } finally {
        setDataLoading(false);
      }
    };
    fetchData();

  }, [authLoading, currentUser, isAdmin]);


  if (authLoading || (isAdmin && dataLoading)) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">회비 정보 로딩 중...</p>
      </div>
    );
  }

  if (!currentUser && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") { 
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">로그인 필요</h1>
        <p className="text-muted-foreground mb-6">회비 관리 페이지를 보려면 로그인이 필요합니다.</p>
        <Button asChild>
          <Link href="/login">로그인 페이지로 이동</Link>
        </Button>
      </div>
    );
  }

  if (!isAdmin) { 
     return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">접근 권한 없음</h1>
        <p className="text-muted-foreground">이 페이지는 관리자만 접근할 수 있습니다.</p>
         <Button asChild className="mt-4">
          <Link href="/">대시보드로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">회비 관리</h1>
        <p className="text-muted-foreground">
          모임의 공동 회비 잔액을 설정하고, 사용 내역을 확인하세요.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>현재 잔액</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold text-primary">{balance.toLocaleString()}원</p>
        </CardContent>
      </Card>
      
      <ReserveFundClient 
        initialTransactions={transactions} 
        initialBalance={balance}
        currentUserId={currentUser?.uid || ''} 
      />

    </div>
  );
}
