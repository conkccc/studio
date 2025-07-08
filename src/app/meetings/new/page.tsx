'use client';

import { useEffect, useState } from 'react';
import { getFriendGroupsForUserAction, getFriendsByGroupAction } from '@/lib/actions';
import { CreateMeetingForm } from '@/components/meetings/CreateMeetingForm';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Friend, FriendGroup } from '@/lib/types';

export default function NewMeetingPage() {
  const { currentUser, appUser, isAdmin, userRole, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [allOwnedGroups, setAllOwnedGroups] = useState<FriendGroup[]>([]);
  const [selectedMeetingGroupId, setSelectedMeetingGroupId] = useState<string | null>(null);
  const [friendsForParticipantSelect, setFriendsForParticipantSelect] = useState<Friend[]>([]);
  const [isLoadingInitialData, setIsLoadingInitialData] = useState(true);
  const [isLoadingParticipants, setIsLoadingParticipants] = useState(false);

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
          setAllOwnedGroups(groupResponse.groups);
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

  useEffect(() => {
    const fetchFriendsForGroup = async () => {
      if (!selectedMeetingGroupId) {
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

    if (selectedMeetingGroupId) {
        fetchFriendsForGroup();
    } else {
        setFriendsForParticipantSelect([]);
    }
  }, [selectedMeetingGroupId, toast]);


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
        <h1 className="text-2xl font-bold mb-4">로그인이 필요합니다</h1>
        <p className="text-muted-foreground">새 모임을 만들려면 로그인이 필요합니다.</p>
         <Button asChild className="mt-4">
          <Link href="/login">로그인 페이지로 이동</Link>
        </Button>
      </div>
    );
  }
  
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

  const currentUserId = appUser!.id;

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
            groups={allOwnedGroups}
            selectedGroupId={selectedMeetingGroupId}
            onGroupChange={setSelectedMeetingGroupId}
            friends={friendsForParticipantSelect}
            isLoadingFriends={isLoadingParticipants}
            isEditMode={false}
          />
        </CardContent>
      </Card>
    </div>
  );
}
