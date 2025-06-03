'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getFriends } from '@/lib/data-store'; // Keep getFriends
import { MeetingListClient } from '@/components/meetings/MeetingListClient';
import { Button } from '@/components/ui/button';
// PlusCircle can be removed if MeetingListClient handles its own "New Meeting" button
// import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext'; // Corrected path
import type { Friend } from '@/lib/types';
// Removed useSearchParams, useMemo, getMeetings, getFriendGroupsByUser, Meeting type, FriendGroup type
// Removed ITEMS_PER_PAGE

export default function MeetingsPage() {
  const { currentUser, loading: authLoading } = useAuth(); // Simplified: isAdmin, userRole might not be needed here
  const [allFriends, setAllFriends] = useState<Friend[]>([]);
  const [dataLoading, setDataLoading] = useState(true); // This loading state is now primarily for allFriends

  useEffect(() => {
    if (authLoading) {
      setDataLoading(true);
      return;
    }
    // If MeetingCard doesn't need allFriends or fetches them itself, this can be removed too.
    // Assuming MeetingListClient or MeetingCard might still want allFriends for display purposes.
    if (currentUser) { // Fetch friends only if a user is logged in
      const fetchAllFriends = async () => {
        setDataLoading(true); // Set loading before fetch
        try {
          const fetchedFriends = await getFriends();
          setAllFriends(fetchedFriends);
        } catch (error) {
          console.error("Failed to fetch friends:", error);
          setAllFriends([]); // Set to empty on error
        } finally {
          setDataLoading(false);
        }
      };
      fetchAllFriends();
    } else {
      // No user, no friends to fetch
      setAllFriends([]);
      setDataLoading(false);
    }
  }, [authLoading, currentUser]);


  if (authLoading) { // Simplified loading check
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">페이지 로딩 중...</p>
      </div>
    );
  }

  if (!currentUser) { // Access control: if no user, show login prompt or redirect
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
  // If `userRole` from `useAuth` is reliable:
  // if (currentUser.role === 'none') { // Or whatever role should be completely restricted
  //   return (
  //     <div className="container mx-auto py-8 text-center">
  //       <h1 className="text-2xl font-bold mb-4">접근 권한 없음</h1>
  //       <p className="text-muted-foreground mb-6">이 페이지에 접근할 권한이 없습니다.</p>
  //       <Button asChild className="mt-4">
  //         <Link href="/">대시보드로 돌아가기</Link>
  //       </Button>
  //     </div>
  //   );
  // }


  return (
    <div className="space-y-6 p-4 md:p-6"> {/* Added padding */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">모임 관리</h1>
          <p className="text-muted-foreground">
            지난 모임을 확인하고 새로운 모임을 만드세요.
          </p>
        </div>
        {/* "새 모임 만들기" button is now inside MeetingListClient and role-dependent */}
      </div>

      {/* MeetingListClient handles its own data fetching and loading state internally for meetings */}
      {/* We only pass allFriends if MeetingCard needs it. If MeetingCard can fetch friends by ID, this prop can be removed. */}
      { dataLoading && !allFriends.length ? (
         <div className="flex justify-center items-center min-h-[200px]">
            <p className="text-muted-foreground">친구 목록 로딩중...</p>
            {/* This message shows if allFriends is still loading. MeetingListClient has its own loader for meetings. */}
         </div>
      ) : (
        <MeetingListClient allFriends={allFriends} />
      )}
    </div>
  );
}
