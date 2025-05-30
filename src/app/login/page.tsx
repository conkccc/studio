
'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button'; // For logout button

export default function LoginPage() {
  const { currentUser, isAdmin, userRole, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log('LoginPage Effect Triggered:', { currentUser, loading, userRole, isAdmin });

    if (process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH === "true") {
      console.log("LoginPage: Dev mode skip auth is ON, redirecting to / from login page if user is mocked.");
      router.push('/'); // In dev mode, always try to push to dashboard as user is mocked
      return;
    }

    if (!loading && currentUser) {
      if (userRole !== null) { // Firestore에서 역할 정보를 가져온 후
        console.log('LoginPage: Redirecting to / with userRole:', userRole);
        router.push('/');
      } else {
        // userRole is still null, AuthContext is likely still fetching it
        console.log('LoginPage: CurrentUser exists, but userRole is still null. Waiting...');
      }
    } else if (!loading && !currentUser) {
      console.log('LoginPage: User not logged in, staying on login page.');
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
            console.log("LoginPage: Manual sign-out initiated.");
            await signOut();
            // signOut should trigger AuthContext update and then this useEffect will re-evaluate
        }}>
          로그아웃
        </Button>
      </div>
    );
  }
  
  // If user is logged in and role is determined (and not dev skip mode), they should have been redirected.
  // If we are here, it means user is not logged in (or dev skip is on but redirect failed, though unlikely)
  // or loading is still true for some reason (but caught above).
  // So, show login form if not logged in.
  if (!currentUser || process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH === "true" && !currentUser) { // Ensure login form shows in dev skip mode if somehow currentUser is not mocked yet
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
                <CardDescription>관리자로 지정된 Google 계정으로 로그인하거나, 역할 할당을 위해 로그인하세요.</CardDescription>
              </CardHeader>
              <CardContent>
                <LoginForm />
              </CardContent>
            </Card>
          </div>
        </div>
      );
  }

  // Fallback for any other state, e.g. currentUser exists but redirect hasn't happened (should be brief)
  return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center">
        <p className="text-xl text-muted-foreground">대시보드로 이동 중...</p>
         {currentUser && ( // Show logout if stuck with a user object
            <Button variant="outline" onClick={signOut} className="mt-4">
                로그아웃 (이동 문제 발생 시)
            </Button>
        )}
      </div>
    );
}
