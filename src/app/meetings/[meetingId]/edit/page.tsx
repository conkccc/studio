
'use client';

import { useEffect, useState } from 'react';
import { getMeetingById, getFriends } from '@/lib/data-store';
import { CreateMeetingForm } from '@/components/meetings/CreateMeetingForm';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Meeting, Friend } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';

export default function EditMeetingPage() {
  const params = useParams();
  const router = useRouter();
  const { currentUser, isAdmin, userRole, loading: authLoading } = useAuth();
  const meetingId = typeof params.meetingId === 'string' ? params.meetingId : undefined;

  const [meeting, setMeeting] = useState<Meeting | null | undefined>(undefined);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (authLoading && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") {
      setDataLoading(true);
      return;
    }

    if (!currentUser || !isAdmin) { // Only admin can access edit page
      setDataLoading(false);
      setMeeting(undefined); // Or null to trigger not found/access denied more explicitly below
      setFriends([]);
      return;
    }

    if (!meetingId) {
        setMeeting(null); 
        setDataLoading(false);
        return;
    }
    
    const fetchData = async () => {
      setDataLoading(true);
      try {
        const [fetchedMeeting, fetchedFriends] = await Promise.all([
          getMeetingById(meetingId),
          getFriends() // Friends list for the form
        ]);
        
        if (!fetchedMeeting) {
          setMeeting(null);
        } else {
          // Ensure creatorId check for editing, though Firestore rules are primary
          if (fetchedMeeting.creatorId !== currentUser.uid && !isAdmin) {
            // This check is secondary; primary check is isAdmin above
            // and Firestore rules for the update action.
            // console.warn("User is not creator or admin, but somehow accessed edit page for this meeting.");
            // setMeeting(null); // Or redirect
          }
          setMeeting(fetchedMeeting);
        }
        setFriends(fetchedFriends);
      } catch (error) {
        console.error("Failed to fetch data for edit meeting:", error);
        setMeeting(null);
      } finally {
        setDataLoading(false);
      }
    };
    fetchData();

  }, [authLoading, currentUser, isAdmin, meetingId]);


  if (authLoading || (isAdmin && dataLoading && meetingId)) { // Show loader if auth loading OR if admin and data is loading for a valid meetingId
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">페이지 로딩 중...</p>
      </div>
    );
  }

  if (!currentUser && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") { // Should be caught by middleware
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">로그인 필요</h1>
        <p className="text-muted-foreground mb-6">모임을 수정하려면 로그인이 필요합니다.</p>
        <Button asChild>
          <Link href="/login">로그인 페이지로 이동</Link>
        </Button>
      </div>
    );
  }

  if (!isAdmin) { // Covers 'user' and 'none' roles
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">접근 권한 없음</h1>
        <p className="text-muted-foreground">모임 수정은 관리자만 가능합니다.</p>
         <Button asChild className="mt-4">
          <Link href="/">대시보드로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  if (meeting === null) { // Meeting not found
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
  
  if (!meeting && !dataLoading) { // Fallback if meeting is undefined after loading (error or no meetingId)
    return <div className="text-center py-10">모임 정보를 불러올 수 없습니다.</div>;
  }
  
  // Admin and meeting data is available (meeting is not null or undefined)
  // currentUser is also guaranteed by isAdmin check
  const currentUserIdForForm = currentUser!.uid;


  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">모임 수정</CardTitle>
          <CardDescription>모임의 세부 정보를 수정하세요.</CardDescription>
        </CardHeader>
        <CardContent>
           <CreateMeetingForm
            initialData={meeting!} // Assert meeting is not null/undefined
            friends={friends}
            currentUserId={currentUserIdForForm}
            isEditMode={true}
          />
        </CardContent>
      </Card>
    </div>
  );
}
