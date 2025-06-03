'use client';

import { useEffect, useState } from 'react';
// getFriends might still be used for admin, getFriendGroupsByUser is used
import { getFriends } from '@/lib/data-store';
// Assuming getFriendsByGroupAction exists for fetching friends of a specific group
import { getFriendGroupsForUserAction, getFriendsByGroupAction } from '@/lib/actions';
import { CreateMeetingForm } from '@/components/meetings/CreateMeetingForm';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Friend, FriendGroup } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function NewMeetingPage() {
  const { currentUser, isAdmin, userRole, loading: authLoading } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false);
  const [isTemporaryMeeting, setIsTemporaryMeeting] = useState(false); // Added state

  const handleTemporaryChange = (isTemporary: boolean) => { // Added handler
    setIsTemporaryMeeting(isTemporary);
    if (isTemporary) {
      // Optionally, if a group was selected, clear it when switching to temporary
      // setSelectedGroupId(null);
      // This might be good UX, but the form itself will ignore friends/groupId if isTemporary is true.
    }
  };

  useEffect(() => {
    if (authLoading && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") {
      setDataLoading(true);
      return;
    }

    // Guard for page access, already handled below, but this useEffect is for data fetching.
    // User must be logged in and be either admin or user.
    if (!currentUser || !(isAdmin || userRole === 'user')) {
      setDataLoading(false);
      setFriends([]);
      setGroups([]); // Also clear groups if user has no permission
      return;
    }

    const fetchDataForUser = async () => {
      setDataLoading(true);
      try {
        let fetchedFriends: Friend[] = [];
        let userOwnedGroups: FriendGroup[] = []; // For user role, to populate group dropdown and fetch their friends

        if (isAdmin) {
          fetchedFriends = await getFriends(); // Admins get all friends
          // For admins, the groups prop for CreateMeetingForm should ideally list all groups for assignment.
          // Using getFriendGroupsForUserAction which gets all groups for admin.
          const adminGroupsResponse = await getFriendGroupsForUserAction(currentUser.uid);
          if (adminGroupsResponse.success && adminGroupsResponse.groups) {
            setGroups(adminGroupsResponse.groups);
          } else {
            setGroups([]);
          }
        } else if (userRole === 'user') {
          // Users get friends from their owned groups
          const groupResponse = await getFriendGroupsForUserAction(currentUser.uid);
          if (groupResponse.success && groupResponse.groups) {
            userOwnedGroups = groupResponse.groups.filter(g => g.ownerUserId === currentUser.uid);
            setGroups(userOwnedGroups); // For 'user', the group dropdown in form shows only their owned groups

            if (userOwnedGroups.length > 0) {
              const friendPromises = userOwnedGroups.map(g => getFriendsByGroupAction(g.id));
              const friendResults = await Promise.all(friendPromises);

              const tempFriendsMap = new Map<string, Friend>();
              friendResults.forEach(res => {
                if (res.success && res.friends) {
                  res.friends.forEach(f => tempFriendsMap.set(f.id, f));
                }
              });
              fetchedFriends = Array.from(tempFriendsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
            } else {
              fetchedFriends = []; // No owned groups, so no friends from groups
            }
          }
        }
        setFriends(fetchedFriends);

      } catch (error) {
        console.error("Failed to fetch data for new meeting:", error);
        setFriends([]);
        setGroups([]);
      } finally {
        setDataLoading(false);
      }
    };
    
    fetchDataForUser();

  }, [authLoading, currentUser, isAdmin, userRole]);
  // Removed the separate useEffect for groups as it's now handled within fetchDataForUser

  if (authLoading || ((isAdmin || userRole === 'user') && dataLoading)) { // dataLoading applies if user is permitted
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">페이지 로딩 중...</p>
      </div>
    );
  }

  if (!currentUser && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") { 
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
  
  // Allow 'admin' or 'user' to access this page
  if (!(isAdmin || userRole === 'user')) {
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">접근 권한 없음</h1>
        <p className="text-muted-foreground">새 모임 만들기는 관리자 또는 사용자만 가능합니다.</p>
         <Button asChild className="mt-4">
          <Link href="/">대시보드로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const currentUserId = currentUser!.uid; 

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">새 모임 만들기</CardTitle>
          <CardDescription>모임의 세부 정보를 입력하고 친구들을 초대하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateMeetingForm
            friends={isTemporaryMeeting
              ? []
              : (selectedGroupId ? friends.filter(f => f.groupId === selectedGroupId) : [])
            }
            currentUserId={currentUserId}
            groupId={selectedGroupId || undefined}
            groups={groups}
            selectedGroupId={selectedGroupId}
            setSelectedGroupId={setSelectedGroupId}
            onTemporaryChange={handleTemporaryChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
