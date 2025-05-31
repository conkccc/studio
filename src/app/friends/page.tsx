'use client';
import { useEffect, useState } from 'react';
import { getFriends } from '@/lib/data-store';
import { AddFriendDialog } from '@/components/friends/AddFriendDialog';
import { FriendListClient } from '@/components/friends/FriendListClient';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Friend } from '@/lib/types';

export default function FriendsPage() {
  const { currentUser, isAdmin, userRole, loading: authLoading } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      setDataLoading(true);
      return;
    }
    if (!currentUser) {
      setDataLoading(false);
      setFriends([]);
      return;
    }
    const fetchFriends = async () => {
      setDataLoading(true);
      try {
        const fetchedFriends = await getFriends();
        setFriends(fetchedFriends);
      } catch (error) {
        console.error("Failed to fetch friends:", error);
        setFriends([]);
      } finally {
        setDataLoading(false);
      }
    };
    fetchFriends();
  }, [authLoading, currentUser]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">친구 목록 로딩 중...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">로그인이 필요합니다</h1>
        <p className="text-muted-foreground">이 페이지는 로그인한 사용자만 접근할 수 있습니다.</p>
        <Button asChild className="mt-4">
          <Link href="/login">로그인 페이지로 이동</Link>
        </Button>
      </div>
    );
  }

  // 로그인한 모든 사용자(관리자/일반)에게 친구 목록 노출
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">친구 목록</h1>
          <p className="text-muted-foreground">
            친구들을 관리하고 모임에 초대하세요.
          </p>
        </div>
        {isAdmin && (
          <AddFriendDialog triggerButton={
            <div className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 cursor-pointer">
              <PlusCircle className="h-5 w-5" />
              새 친구 추가
            </div>
          } />
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>등록된 친구 ({friends.length}명)</CardTitle>
          <CardDescription>닉네임을 클릭하여 수정하거나 삭제할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {friends.length > 0 ? (
            <FriendListClient initialFriends={friends} isReadOnly={!isAdmin} />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>아직 등록된 친구가 없습니다.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
