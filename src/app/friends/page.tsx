
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

    if (!currentUser || !isAdmin) { 
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

  }, [authLoading, currentUser, isAdmin]);

  if (authLoading || (isAdmin && dataLoading)) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">친구 목록 로딩 중...</p>
      </div>
    );
  }

  if (!currentUser && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") {
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">로그인 필요</h1>
        <p className="text-muted-foreground mb-6">친구 목록을 보려면 로그인이 필요합니다.</p>
        <Button asChild>
          <Link href="/login">로그인 페이지로 이동</Link>
        </Button>
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

  // Admin view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">친구 목록</h1>
          <p className="text-muted-foreground">
            친구들을 관리하고 모임에 초대하세요.
          </p>
        </div>
        <AddFriendDialog triggerButton={
          <div className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 cursor-pointer">
            <PlusCircle className="h-5 w-5" />
            새 친구 추가
          </div>
        } />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>등록된 친구 ({friends.length}명)</CardTitle>
          <CardDescription>닉네임을 클릭하여 수정하거나 삭제할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {friends.length > 0 ? (
            <FriendListClient initialFriends={friends} />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>아직 등록된 친구가 없습니다.</p>
              <p className="mt-2">오른쪽 위의 '새 친구 추가' 버튼으로 첫 친구를 등록해보세요!</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
