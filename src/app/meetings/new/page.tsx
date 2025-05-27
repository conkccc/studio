
'use client';

import { useEffect, useState } from 'react';
import { getFriends } from '@/lib/data-store'; // Now async
import { CreateMeetingForm } from '@/components/meetings/CreateMeetingForm';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Friend } from '@/lib/types';

export default function NewMeetingPage() {
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && currentUser && isAdmin) {
      const fetchFriends = async () => {
        try {
          const fetchedFriends = await getFriends();
          setFriends(fetchedFriends);
        } catch (error) {
          console.error("Failed to fetch friends for new meeting:", error);
        } finally {
          setDataLoading(false);
        }
      };
      fetchFriends();
    } else if (!authLoading && (!currentUser || !isAdmin)) {
      setDataLoading(false);
    }
  }, [currentUser, isAdmin, authLoading]);

  if (authLoading || dataLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">페이지 로딩 중...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">로그인 필요</h1>
        <p className="text-muted-foreground mb-6">새 모임을 만들려면 로그인이 필요합니다.</p>
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
        <p className="text-muted-foreground">새 모임 만들기는 관리자만 가능합니다.</p>
         <Button asChild className="mt-4">
          <Link href="/">대시보드로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const currentUserId = currentUser?.uid || (friends.length > 0 ? friends[0].id : 'mock-user-id-if-no-auth-or-friends');


  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">새 모임 만들기</CardTitle>
          <CardDescription>모임의 세부 정보를 입력하고 친구들을 초대하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateMeetingForm friends={friends} currentUserId={currentUserId} />
        </CardContent>
      </Card>
    </div>
  );
}
