
'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const { currentUser, isAdmin, userRole, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log('LoginPage Effect Triggered:', { currentUser, loading, userRole, isAdmin });

    if (process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH === "true") {
      console.log("LoginPage: Dev mode skip auth is ON, redirecting to / from login page if user is mocked.");
      router.push('/');
      return;
    }

    if (!loading && currentUser) {
      if (userRole !== null) { 
        console.log('LoginPage: Redirecting to / with userRole:', userRole);
        router.push('/');
      } else {
        console.log('LoginPage: CurrentUser exists, but userRole is still null. Waiting for role from AuthContext...');
      }
    } else if (!loading && !currentUser) {
      console.log('LoginPage: User not logged in, staying on login page.');
    } else if (loading) {
      console.log('LoginPage: AuthContext is loading...');
    }
  }, [currentUser, loading, router, userRole, isAdmin]);


  if (loading && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center">
        <p className="text-xl text-muted-foreground">페이지 로딩 중...</p>
      </div>
    );
  }

  if (!loading && currentUser && userRole === null && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center">
        <p className="text-xl text-muted-foreground mb-4">사용자 정보 확인 중...</p>
        <Button variant="outline" onClick={async () => {
            console.log("LoginPage: Manual sign-out initiated due to stuck state.");
            await signOut();
        }}>
          로그아웃
        </Button>
      </div>
    );
  }
  
  if (!currentUser || (process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH === "true" && !currentUser) ) {
     return (
        <div className="min-h-screen flex items-center justify-center bg-muted/40 py-12 px-4 sm:px-6 lg:px-8">
          <div className="w-full max-w-md space-y-8">
            <div>
              <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">
                N빵친구 로그인
              </h2>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Google 계정을 사용하여 로그인해주세요.
              </p>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>로그인</CardTitle>
                <CardDescription>관리자 역할을 부여받으려면 지정된 Google 계정으로 로그인하세요.</CardDescription>
              </CardHeader>
              <CardContent>
                <LoginForm />
              </CardContent>
            </Card>
          </div>
        </div>
      );
  }

  // Fallback for any other state, e.g. currentUser exists but redirect hasn't happened
  // This also includes the "대시보드로 이동 중..." scenario if role is determined
  return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center">
        <p className="text-xl text-muted-foreground">대시보드로 이동 중...</p>
         {currentUser && (
            <Button variant="outline" onClick={signOut} className="mt-4">
                로그아웃 (이동 문제 발생 시)
            </Button>
        )}
      </div>
    );
}
