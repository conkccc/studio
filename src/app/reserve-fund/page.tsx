'use client';

import { useState } from 'react';
import { ReserveFundClient } from '@/components/reserve-fund/ReserveFundClient';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function ReserveFundPage() {
  const { currentUser, loading: authLoading } = useAuth();

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
