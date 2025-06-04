'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUsers } from '@/lib/data-store';
import { getAllFriendGroupsAction } from '@/lib/actions';
import type { User, FriendGroup } from '@/lib/types';
import { UserListClient } from '@/components/users/UserListClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function UsersPage() {
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [allFriendGroups, setAllFriendGroups] = useState<FriendGroup[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      setDataLoading(true);
      return;
    }
    if (!isAdmin || !currentUser) {
      setDataLoading(false);
      setUsers([]);
      setAllFriendGroups([]);
      return;
    }

    const fetchData = async () => {
      setDataLoading(true);
      try {
        const fetchedUsers = await getUsers();
        setUsers(fetchedUsers);

        const groupsResult = await getAllFriendGroupsAction();
        if (groupsResult.success && groupsResult.groups) {
          setAllFriendGroups(groupsResult.groups);
        } else {
          console.error("Failed to fetch all friend groups:", groupsResult.error);
          setAllFriendGroups([]);
        }
      } catch (error) {
        console.error("Failed to fetch data for users page:", error);
        setUsers([]);
        setAllFriendGroups([]);
      } finally {
        setDataLoading(false);
      }
    };
    fetchData();
  }, [authLoading, isAdmin, currentUser]);

  if (authLoading || (isAdmin && dataLoading)) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">사용자 목록 로딩 중...</p>
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
      <Card>
        <CardHeader>
          <CardTitle>사용자 관리</CardTitle>
          <CardDescription>
            애플리케이션 사용자 목록을 확인하고 역할 및 참조 그룹을 관리합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserListClient
            initialUsers={users}
            currentAdminId={currentUser?.uid || ''}
            isAdmin={isAdmin}
            allFriendGroups={allFriendGroups}
          />
        </CardContent>
      </Card>
    </div>
  );
}
