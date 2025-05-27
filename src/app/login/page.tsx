
'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function LoginPage() {
  const { currentUser, isAdmin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && currentUser) {
      // 이미 로그인된 사용자는 대시보드로 리디렉션
      // 관리자 여부 체크는 LoginForm 또는 AuthContext에서 처리
      router.push('/');
    }
  }, [currentUser, loading, router]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-xl text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  // currentUser가 있는데 아직 리디렉션되지 않은 경우 (짧은 순간) 또는 currentUser가 없는 경우 (로그인 폼 표시)
  if (currentUser) {
     return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-xl text-muted-foreground">대시보드로 이동 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">
            N빵친구 로그인
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            관리자 계정으로 로그인해주세요.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>로그인</CardTitle>
            <CardDescription>Google 계정을 사용하여 로그인하세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
