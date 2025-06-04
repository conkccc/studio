"use client";

"use client";

// useEffect, useState는 현재 사용되지 않으므로 React에서 직접 import할 필요가 없습니다.
// import React, { useState, useEffect } from 'react';
import { ReserveFundClient } from '@/components/reserve-fund/ReserveFundClient';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

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

  return (
    <div className="space-y-6">
      <ReserveFundClient />
    </div>
  );
}
