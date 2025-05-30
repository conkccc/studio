'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const { currentUser, userRole, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && currentUser && userRole !== null && userRole !== 'none') {
      router.push('/');
    }
  }, [currentUser, loading, router, userRole]);

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center">
        <p className="text-xl text-muted-foreground">페이지 로딩 중...</p>
      </div>
    );
  }

  if (!loading && currentUser && userRole === null) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center">
        <p className="text-xl text-muted-foreground mb-4">사용자 정보 확인 중...</p>
        <Button variant="outline" onClick={async () => { await signOut(); }}>로그아웃</Button>
      </div>
    );
  }

  if (!loading && currentUser && userRole === 'none') {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center">
        <p className="text-xl text-muted-foreground mb-4">
          아직 권한이 부여되지 않은 계정입니다.<br />
          관리자의 승인을 기다려주세요.
        </p>
        <Button variant="outline" onClick={async () => { await signOut(); }}>로그아웃</Button>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">N빵친구 로그인</h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">Google 계정을 사용하여 로그인해주세요.</p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>로그인</CardTitle>
              <CardDescription>Google 계정으로 로그인하고 관리자가 역활을 부여해야 사용 가능합니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <LoginForm />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // fallback: 로그인 후 리디렉션 대기
  return (
    <div className="flex flex-col justify-center items-center min-h-screen text-center">
      <p className="text-xl text-muted-foreground">대시보드로 이동 중...</p>
      {currentUser && (
        <Button variant="outline" onClick={signOut} className="mt-4">로그아웃 (이동 문제 발생 시)</Button>
      )}
    </div>
  );
}
