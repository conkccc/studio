
'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUsers } from '@/lib/data-store';
import type { User } from '@/lib/types';
import { UserListClient } from '@/components/users/UserListClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function UsersPage() {
  const { currentUser, isAdmin, userRole, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      setDataLoading(true); // Explicitly set data loading if auth is loading
      return;
    }

    if (!currentUser || !isAdmin) { // Stricter check: only admin can fetch users
      setDataLoading(false);
      setUsers([]); // Clear users if not admin
      return;
    }

    // At this point, currentUser is an admin
    const fetchUsers = async () => {
      setDataLoading(true);
      try {
        const fetchedUsers = await getUsers();
        setUsers(fetchedUsers);
      } catch (error) {
        console.error("Failed to fetch users:", error);
        setUsers([]);
      } finally {
        setDataLoading(false);
      }
    };

    fetchUsers();
    
  }, [authLoading, currentUser, isAdmin]);

  if (authLoading || (isAdmin && dataLoading)) { // Show loader if auth is loading OR if admin and data is loading
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">사용자 목록 로딩 중...</p>
      </div>
    );
  }

  if (!currentUser && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") { // Should be caught by middleware
     return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">로그인 필요</h1>
        <p className="text-muted-foreground mb-6">사용자 목록을 보려면 로그인이 필요합니다.</p>
        <Button asChild>
          <Link href="/login">로그인 페이지로 이동</Link>
        </Button>
      </div>
    );
  }

  if (!isAdmin) { // If not an admin (includes role 'user' and 'none')
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

  // Admin view
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>사용자 관리</CardTitle>
          <CardDescription>
            애플리케이션 사용자 목록을 확인하고 역할을 관리합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserListClient initialUsers={users} currentAdminId={currentUser?.uid || ''} />
        </CardContent>
      </Card>
    </div>
  );
}
