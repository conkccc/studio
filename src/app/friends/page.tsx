'use client';
import { useEffect, useState } from 'react';
import FriendGroupListClient from '@/components/friends/FriendGroupListClient';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';

export default function FriendsPage() {
  const { appUser, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">페이지 로딩 중...</p>
      </div>
    );
  }

  if (!appUser) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">로그인 후 이용해주세요.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4">
      <Card>
        <CardHeader>
          <CardTitle>친구 그룹 관리</CardTitle>
          <CardDescription>내 그룹을 만들거나 공유된 그룹을 확인하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <FriendGroupListClient />
        </CardContent>
      </Card>
    </div>
  );
}
