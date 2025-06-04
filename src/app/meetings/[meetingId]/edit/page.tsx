
'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getMeetingByIdAction,
  getFriendsByGroupAction,
  getFriendGroupsForUserAction,
  getAllUsersAction // Ensure this is imported if used, though not strictly needed for this page's direct functionality if MeetingCard handles users
} from '@/lib/actions';
import { CreateMeetingForm } from '@/components/meetings/CreateMeetingForm';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Meeting, Friend, FriendGroup, User } from '@/lib/types'; // Added FriendGroup, User
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export default function EditMeetingPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { appUser, loading: authLoading } = useAuth(); // Use appUser
  const meetingId = typeof params.meetingId === 'string' ? params.meetingId : undefined;

  const [meetingToEdit, setMeetingToEdit] = useState<Meeting | null>(null);
  const [friendsForForm, setFriendsForForm] = useState<Friend[]>([]);
  const [groupsForForm, setGroupsForForm] = useState<FriendGroup[]>([]);
  // allUsers state might not be needed here if MeetingCard fetches/receives it another way
  // For now, assuming it's not directly managed here unless CreateMeetingForm needs it.
  const [hasEditPermission, setHasEditPermission] = useState(false);
  const [isLoadingPageData, setIsLoadingPageData] = useState(true);

  const [selectedGroupIdInForm, setSelectedGroupIdInForm] = useState<string | null>(null);

  const fetchPageData = useCallback(async () => {
    if (!meetingId || !appUser?.id) {
        setIsLoadingPageData(false);
        return;
    }
    setIsLoadingPageData(true);
    try {
      // Fetch meeting details and groups user has access to
      const [meetingResult, groupsResult] = await Promise.all([
        getMeetingByIdAction(meetingId),
        getFriendGroupsForUserAction(appUser.id),
        // No need to fetch allUsers here if only CreateMeetingForm uses it internally or via MeetingCard
      ]);

      if (groupsResult.success && groupsResult.groups) {
        setGroupsForForm(groupsResult.groups);
      } else {
        toast({ title: "경고", description: `사용자 그룹 목록 로드 실패: ${groupsResult.error}`, variant: "default" });
        setGroupsForForm([]);
      }

      if (meetingResult.success && meetingResult.meeting) {
        const fetchedMeeting = meetingResult.meeting;
        setMeetingToEdit(fetchedMeeting);

        if (fetchedMeeting.groupId) {
          setSelectedGroupIdInForm(fetchedMeeting.groupId);
          const friendsResult = await getFriendsByGroupAction(fetchedMeeting.groupId);
          if (friendsResult.success && friendsResult.friends) {
            setFriendsForForm(friendsResult.friends);
          } else {
            toast({ title: "경고", description: `초기 그룹의 친구 목록 로드 실패: ${friendsResult.error}`, variant: "default" });
            setFriendsForForm([]);
          }
        } else {
            setFriendsForForm([]);
        }
        
        console.log("모임 수정 권한 검사 시작 - Edit Page");
        console.log("Current User ID (appUser.id):", appUser.id, typeof appUser.id);
        console.log("Meeting Creator ID (fetchedMeeting.creatorId):", fetchedMeeting.creatorId, typeof fetchedMeeting.creatorId);
        const isAdmin = appUser.role === 'admin';
        const isCreator = fetchedMeeting.creatorId === appUser.id;
        console.log("Is Admin:", isAdmin);
        console.log("Is Creator:", isCreator);

        if (isAdmin || isCreator) {
          setHasEditPermission(true);
        } else {
          setHasEditPermission(false);
          toast({ title: "권한 없음", description: "이 모임을 수정할 권한이 없습니다. (관리자 또는 생성자만 가능)", variant: "destructive" });
        }
      } else {
        toast({ title: "오류", description: meetingResult.error || "모임 정보를 가져오는 데 실패했습니다.", variant: "destructive" });
        setMeetingToEdit(null);
        setHasEditPermission(false);
      }
    } catch (error) {
      toast({ title: "오류", description: "페이지 데이터 조회 중 예외가 발생했습니다.", variant: "destructive" });
      setMeetingToEdit(null);
      setHasEditPermission(false);
      setGroupsForForm([]);
      setFriendsForForm([]);
    } finally {
      setIsLoadingPageData(false);
    }
  }, [meetingId, appUser?.id, toast]); // appUser.id is the key dependency

  useEffect(() => {
    if (authLoading) {
      setIsLoadingPageData(true);
      return;
    }
    if (!appUser?.id) {
      toast({ title: "인증 필요", description: "모임을 수정하려면 로그인이 필요합니다.", variant: "destructive" });
      router.push('/login');
      setIsLoadingPageData(false);
      return;
    }
    if (!meetingId) {
      toast({ title: "오류", description: "모임 ID가 유효하지 않습니다.", variant: "destructive" });
      setIsLoadingPageData(false);
      // router.push('/meetings'); // Optional: redirect
      return;
    }
    fetchPageData();
  }, [authLoading, appUser?.id, meetingId, router, toast, fetchPageData]);

  useEffect(() => {
    if (selectedGroupIdInForm && appUser?.id) {
      const fetchFriendsForSelectedGroup = async () => {
        const friendsResult = await getFriendsByGroupAction(selectedGroupIdInForm);
        if (friendsResult.success && friendsResult.friends) {
          setFriendsForForm(friendsResult.friends);
        } else {
          toast({ title: "경고", description: `그룹 변경 시 친구 목록 로드 실패: ${friendsResult.error}`, variant: "default" });
          setFriendsForForm([]);
        }
      };
      fetchFriendsForSelectedGroup();
    } else if (!selectedGroupIdInForm) {
      setFriendsForForm([]);
    }
  }, [selectedGroupIdInForm, appUser?.id, toast]);

  if (authLoading || isLoadingPageData) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <Loader2 className="h-8 w-8 animate-spin mr-2" />
        페이지 데이터를 로딩 중입니다...
      </div>
    );
  }

  if (!meetingToEdit) {
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">모임을 찾을 수 없습니다.</h1>
        <p className="text-muted-foreground mb-6">수정하려는 모임이 존재하지 않거나 삭제되었을 수 있습니다.</p>
        <Button asChild>
          <Link href="/meetings">모임 목록으로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  if (!hasEditPermission) {
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold text-red-600 mb-4">접근 권한 없음</h1>
        <p className="text-muted-foreground">이 모임을 수정할 권한이 없습니다.</p>
        <Button asChild className="mt-4">
          <Link href="/meetings">모임 목록으로 돌아가기</Link>
        </Button>
      </div>
    );
  }
  
  if (!appUser?.id) { // Should not happen if authLoading is false and appUser is still null
     return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <Loader2 className="h-8 w-8 animate-spin mr-2" />
        사용자 정보를 확인 중입니다...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">모임 수정</CardTitle>
          <CardDescription>모임의 세부 정보를 수정하세요. {meetingToEdit.isSettled && <span className="font-bold text-destructive">(정산 완료된 모임 - 일부 항목 수정 불가)</span>}</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateMeetingForm
            currentUserId={appUser.id}
            isEditMode={true}
            initialData={meetingToEdit}
            friends={friendsForForm}
            isLoadingFriends={isLoadingPageData && !!selectedGroupIdInForm}
            groups={groupsForForm}
            selectedGroupId={selectedGroupIdInForm}
            onGroupChange={(newGroupId) => {
              setSelectedGroupIdInForm(newGroupId);
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
