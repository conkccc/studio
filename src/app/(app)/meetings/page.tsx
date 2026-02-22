'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getFriendsForUserAction, getFriendGroupsForUserAction } from '@/lib/actions';
import { MeetingListClient } from '@/features/meetings';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import type { Friend, FriendGroup } from '@/lib/types';

export default function MeetingsPage() {
  const { currentUser, appUser, loading: authLoading } = useAuth();
  const [allFriends, setAllFriends] = useState<Friend[]>([]);
  const [friendGroups, setFriendGroups] = useState<FriendGroup[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const inFlightRef = useRef(false);
  const lastFetchedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) {
      setDataLoading(true);
      return;
    }
    if (currentUser && appUser?.id) {
      if (inFlightRef.current) return;
      if (lastFetchedUserIdRef.current === appUser.id) return;
      const fetchAllFriends = async () => {
        setDataLoading(true);
        inFlightRef.current = true;
        try {
          const [friendsResult, groupsResult] = await Promise.all([
            getFriendsForUserAction(appUser.id),
            getFriendGroupsForUserAction(appUser.id),
          ]);
          if (friendsResult.success) {
            setAllFriends(friendsResult.friends || []);
          } else {
            console.error("Failed to fetch friends:", friendsResult.error);
            setAllFriends([]);
          }
          if (groupsResult.success) {
            setFriendGroups(groupsResult.groups || []);
          } else {
            console.error("Failed to fetch friend groups:", groupsResult.error);
            setFriendGroups([]);
          }
        } catch (error) {
          console.error("Failed to fetch friends:", error);
          setAllFriends([]);
          setFriendGroups([]);
        } finally {
          setDataLoading(false);
          inFlightRef.current = false;
          lastFetchedUserIdRef.current = appUser.id;
        }
      };
      fetchAllFriends();
    } else {
      setAllFriends([]);
      setFriendGroups([]);
      setDataLoading(false);
    }
  }, [authLoading, currentUser, appUser?.id]);


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

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">모임 관리</h1>
          <p className="text-muted-foreground">
            지난 모임을 확인하고 새로운 모임을 만드세요.
          </p>
        </div>
      </div>

      { dataLoading && !allFriends.length && !friendGroups.length ? (
         <div className="flex justify-center items-center min-h-[200px]">
            <p className="text-muted-foreground">필터 목록 로딩중...</p>
         </div>
      ) : (
        <MeetingListClient allFriends={allFriends} friendGroups={friendGroups} filtersReady={!dataLoading} />
      )}
    </div>
  );
}
