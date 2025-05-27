
'use client';

import { useEffect, useState } from 'react';
import { getReserveFundBalance, getLoggedReserveFundTransactions } from '@/lib/data-store'; // Now async
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ReserveFundClient } from '@/components/reserve-fund/ReserveFundClient';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { ReserveFundTransaction } from '@/lib/types';

export default function ReserveFundPage() {
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<ReserveFundTransaction[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && currentUser && isAdmin) {
      const fetchData = async () => {
        try {
          const [fetchedBalance, fetchedTransactions] = await Promise.all([
            getReserveFundBalance(),
            getLoggedReserveFundTransactions()
          ]);
          setBalance(fetchedBalance);
          setTransactions(fetchedTransactions);
        } catch (error) {
          console.error("Failed to fetch reserve fund data:", error);
        } finally {
          setDataLoading(false);
        }
      };
      fetchData();
    } else if (!authLoading && (!currentUser || !isAdmin)) {
      setDataLoading(false);
    }
  }, [currentUser, isAdmin, authLoading]);


  if (authLoading || dataLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">회비 정보 로딩 중...</p>
      </div>
    );
  }

  if (!currentUser) {
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
      
      <ReserveFundClient initialTransactions={transactions} initialBalance={balance} />

    </div>
  );
}
