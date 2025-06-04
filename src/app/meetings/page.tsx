'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getFriends } from '@/lib/data-store';
import { MeetingListClient } from '@/components/meetings/MeetingListClient';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import type { Friend } from '@/lib/types';

export default function MeetingsPage() {
  const { currentUser, loading: authLoading } = useAuth();
  const [allFriends, setAllFriends] = useState<Friend[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      setDataLoading(true);
      return;
    }
    // MeetingCard가 참여자 이름 등을 표시하기 위해 allFriends 목록을 필요로 할 수 있습니다.
    if (currentUser) {
      const fetchAllFriends = async () => {
        setDataLoading(true);
        try {
          const fetchedFriends = await getFriends();
          setAllFriends(fetchedFriends);
        } catch (error) {
          console.error("Failed to fetch friends:", error);
          setAllFriends([]);
        } finally {
          setDataLoading(false);
        }
      };
      fetchAllFriends();
    } else {
      setAllFriends([]);
      setDataLoading(false);
    }
  }, [authLoading, currentUser]);


  if (authLoading) {
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
        <p className="text-muted-foreground mb-6">모임 정보를 보려면 로그인이 필요합니다.</p>
        <Button asChild>
          <Link href="/login">로그인</Link>
        </Button>
      </div>
    );
  }

  // Viewer role check: Viewers cannot access the main meetings management page directly
  // This specific check might be too restrictive depending on whether viewers should see *any* list here.
  // The MeetingListClient itself will filter based on refFriendGroupIds for viewers.
  // If viewers should not even see the page structure, this check is fine.
  // However, the original requirement was that MeetingListClient handles data fetching based on role.
  // So, perhaps a viewer *can* see this page, but MeetingListClient will show them a limited view.
  // For now, let's assume viewers *can* access the page, and MeetingListClient does the data scoping.
  // The original page had a check for `!(isAdmin || userRole === 'user')`.
  // 역할 기반 접근 제어는 MeetingListClient 내부 또는 AppShell에서 처리될 수 있습니다.
  // 이 페이지 자체는 로그인된 사용자는 접근 가능하도록 합니다.

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">모임 관리</h1>
          <p className="text-muted-foreground">
            지난 모임을 확인하고 새로운 모임을 만드세요.
          </p>
        </div>
        {/* "새 모임 만들기" 버튼은 MeetingListClient 내부에 역할 기반으로 표시됩니다. */}
      </div>

      {/* MeetingListClient는 자체적으로 모임 데이터를 가져오고 로딩 상태를 관리합니다. */}
      {/* MeetingCard에서 친구 이름을 표시하기 위해 allFriends prop을 전달합니다. */}
      { dataLoading && !allFriends.length ? ( // allFriends 로딩 중일 때만 별도 로딩 표시
         <div className="flex justify-center items-center min-h-[200px]">
            <p className="text-muted-foreground">친구 목록 로딩중...</p>
         </div>
      ) : (
        <MeetingListClient allFriends={allFriends} />
      )}
    </div>
  );
}
