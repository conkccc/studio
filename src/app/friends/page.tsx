'use client';
import { useEffect, useState } from 'react';
import { getFriends } from '@/lib/data-store'; // Keep if general friend list is still needed
// import { AddFriendDialog } from '@/components/friends/AddFriendDialog'; // Keep if used
// import { FriendListClient } from '@/components/friends/FriendListClient'; // Keep if used
import FriendGroupListClient from '@/components/friends/FriendGroupListClient'; // Import the new client component
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext'; // Corrected path
import type { Friend } from '@/lib/types';
// Removed imports related to old group logic: FriendListByGroup, Accordion, deleteFriendGroupAction, getFriendsByGroupAction, FriendGroupForm, useToast (if only for group deletion)

export default function FriendsPage() {
  const { appUser, loading: authLoading } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]); // Keep if general friend list is still needed on this page
  const [dataLoading, setDataLoading] = useState(true); // For friends list if kept

  useEffect(() => {
    if (authLoading) {
      setDataLoading(true);
      return;
    }
    if (!appUser) {
      setDataLoading(false);
      setFriends([]);
      return;
    }
    // This part fetches all friends. If FriendGroupListClient handles all friend display logic
    // or if friends are only displayed within groups, this might be redundant.
    // For now, keeping it if there's a general friend list elsewhere on the page.
    const fetchAllFriends = async () => {
      setDataLoading(true);
      try {
        const fetchedFriends = await getFriends(); // General fetch
        setFriends(fetchedFriends);
      } catch (error) {
        console.error("Failed to fetch friends:", error);
        setFriends([]);
      } finally {
        setDataLoading(false);
      }
    };
    fetchAllFriends();
  }, [authLoading, appUser]);


  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-150px)]">
        {/* Consistent loading message with FriendGroupListClient */}
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
    <div className="max-w-4xl mx-auto space-y-8 p-4"> {/* Increased max-width and added padding */}
      <Card>
        <CardHeader>
          <CardTitle>친구 그룹 관리</CardTitle>
          <CardDescription>내 그룹을 만들거나 공유된 그룹을 확인하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* FriendGroupListClient now handles its own data fetching and UI */}
          <FriendGroupListClient />
        </CardContent>
      </Card>

      {/*
        If there's a general list of ALL friends (not by group) to be displayed,
        that UI would go here, potentially using the `friends` state.
        For example:
        <Card>
          <CardHeader>
            <CardTitle>All Friends</CardTitle>
          </CardHeader>
          <CardContent>
            {dataLoading && <p>Loading friends...</p>}
            {!dataLoading && friends.length === 0 && <p>No friends found.</p>}
            {!dataLoading && friends.length > 0 && (
              <ul>
                {friends.map(friend => <li key={friend.id}>{friend.name}</li>)}
              </ul>
            )}
            <AddFriendDialog /> // If you have a way to add friends without assigning to a group initially
          </CardContent>
        </Card>
      */}
    </div>
  );
}
