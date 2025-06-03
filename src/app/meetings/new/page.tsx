'use client';

import { useEffect, useState } from 'react';
// getFriends might still be used for admin, getFriendGroupsByUser is used
import { getFriends } from '@/lib/data-store';
// Assuming getFriendsByGroupAction exists for fetching friends of a specific group
import { getFriendGroupsForUserAction, getFriendsByGroupAction } from '@/lib/actions';
import { CreateMeetingForm } from '@/components/meetings/CreateMeetingForm';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast'; // For error notifications
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Friend, FriendGroup } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function NewMeetingPage() {
  const { currentUser, appUser, isAdmin, userRole, loading: authLoading } = useAuth(); // Use appUser for id
  const { toast } = useToast(); // For error notifications

  const [allOwnedGroups, setAllOwnedGroups] = useState<FriendGroup[]>([]);
  const [selectedMeetingGroupId, setSelectedMeetingGroupId] = useState<string | null>(null);
  const [friendsForParticipantSelect, setFriendsForParticipantSelect] = useState<Friend[]>([]);
  const [isLoadingInitialData, setIsLoadingInitialData] = useState(true); // For groups and initial friends (if any)
  const [isLoadingParticipants, setIsLoadingParticipants] = useState(false); // For friends of selected group

  const [isTemporaryMeeting, setIsTemporaryMeeting] = useState(false);

  const handleTemporaryChange = (isTemporary: boolean) => {
    setIsTemporaryMeeting(isTemporary);
    if (isTemporary) {
      setSelectedMeetingGroupId(null); // Clear group selection if switching to temporary
      setFriendsForParticipantSelect([]); // Clear participant list
    }
  };

  // Fetch initial data: groups for the dropdown
  useEffect(() => {
    if (authLoading || !appUser?.id) {
      setIsLoadingInitialData(false);
      setAllOwnedGroups([]);
      return;
    }
    setIsLoadingInitialData(true);
    const fetchInitialData = async () => {
      try {
        const groupResponse = await getFriendGroupsForUserAction(appUser.id);
        if (groupResponse.success && groupResponse.groups) {
          if (appUser.role === 'admin') {
            setAllOwnedGroups(groupResponse.groups); // Admin sees all accessible groups in dropdown
          } else { // 'user' or 'viewer' (though viewer shouldn't be here)
            setAllOwnedGroups(groupResponse.groups.filter(g => g.ownerUserId === appUser.id));
          }
        } else {
          setAllOwnedGroups([]);
          toast({ title: "오류", description: groupResponse.error || "모임 생성을 위한 그룹 목록을 가져오지 못했습니다.", variant: "destructive"});
        }
      } catch (error) {
        console.error("Error fetching initial data for new meeting:", error);
        setAllOwnedGroups([]);
        toast({ title: "오류", description: "데이터 로딩 중 오류 발생.", variant: "destructive"});
      } finally {
        setIsLoadingInitialData(false);
      }
    };
    fetchInitialData();
  }, [authLoading, appUser, toast]);


  // Fetch friends when selectedMeetingGroupId changes
  useEffect(() => {
    const fetchFriendsForGroup = async () => {
      if (!selectedMeetingGroupId) {
        // If no group is selected, or if it's a temporary meeting,
        // participant list should be empty or handled by CreateMeetingForm based on its 'friends' prop.
        // For non-temporary meetings, if no group is selected, users might not be able to pick participants
        // until a group is chosen.
        setFriendsForParticipantSelect([]);
        return;
      }
      if (isTemporaryMeeting) { // No specific group friends for temporary meetings.
        setFriendsForParticipantSelect([]);
        return;
      }

      setIsLoadingParticipants(true);
      try {
        const response = await getFriendsByGroupAction(selectedMeetingGroupId);
        if (response.success && response.friends) {
          setFriendsForParticipantSelect(response.friends);
        } else {
          setFriendsForParticipantSelect([]);
          toast({ title: "오류", description: response.error || "선택된 그룹의 친구 목록을 가져오지 못했습니다.", variant: "destructive" });
        }
      } catch (error) {
        setFriendsForParticipantSelect([]);
        toast({ title: "오류", description: "참여자 목록 조회 중 예외가 발생했습니다.", variant: "destructive" });
        console.error("Error fetching friends for group:", error);
      } finally {
        setIsLoadingParticipants(false);
      }
    };

    fetchFriendsForGroup();
  }, [selectedMeetingGroupId, isTemporaryMeeting, toast]);


  if (authLoading || isLoadingInitialData) {
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

  const currentUserId = appUser!.id; // appUser is confirmed to exist here due to authLoading/!appUser checks

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">새 모임 만들기</CardTitle>
          <CardDescription>모임의 세부 정보를 입력하고 친구들을 초대하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateMeetingForm
            currentUserId={currentUserId}
            groups={allOwnedGroups} // Groups for the dropdown in the form
            selectedGroupId={selectedMeetingGroupId} // To control the form's group selection
            onGroupChange={setSelectedMeetingGroupId} // Callback for when group selection changes in form
            friends={isTemporaryMeeting ? [] : friendsForParticipantSelect} // Friends for participant selection
            isLoadingFriends={isLoadingParticipants} // Loading state for friends list
            onTemporaryChange={handleTemporaryChange}
            isEditMode={false} // Explicitly set for clarity
          />
        </CardContent>
      </Card>
    </div>
  );
}
