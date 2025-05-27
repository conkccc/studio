
'use client';

import { useEffect, useState } from 'react';
import { getMeetingById, getFriends } from '@/lib/data-store'; // Now async
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
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const meetingId = typeof params.meetingId === 'string' ? params.meetingId : undefined;

  const [meeting, setMeeting] = useState<Meeting | null | undefined>(undefined);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && currentUser && isAdmin && meetingId) {
      const fetchData = async () => {
        try {
          const [fetchedMeeting, fetchedFriends] = await Promise.all([
            getMeetingById(meetingId),
            getFriends()
          ]);
          
          if (!fetchedMeeting) {
            setMeeting(null); // Not found
          } else {
            setMeeting(fetchedMeeting);
          }
          setFriends(fetchedFriends);
        } catch (error) {
          console.error("Failed to fetch data for edit meeting:", error);
          setMeeting(null); // Error case
        } finally {
          setDataLoading(false);
        }
      };
      fetchData();
    } else if (!authLoading && (!currentUser || !isAdmin)) {
      setDataLoading(false);
    } else if (!meetingId) {
        setMeeting(null); // No meetingId
        setDataLoading(false);
    }
  }, [currentUser, isAdmin, authLoading, meetingId]);

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
        <p className="text-muted-foreground mb-6">모임을 수정하려면 로그인이 필요합니다.</p>
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
        <p className="text-muted-foreground">모임 수정은 관리자만 가능합니다.</p>
         <Button asChild className="mt-4">
          <Link href="/">대시보드로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  if (meeting === null) { // Explicitly null for not found
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
  
  if (!meeting) { // Still loading or error before meeting is set
    return <div className="text-center py-10">로딩 중...</div>;
  }
  
  const currentUserId = currentUser?.uid || (friends.length > 0 ? friends[0].id : 'mock-user-id');

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">모임 수정</CardTitle>
          <CardDescription>모임의 세부 정보를 수정하세요.</CardDescription>
        </CardHeader>
        <CardContent>
           <CreateMeetingForm
            initialData={meeting}
            friends={friends}
            currentUserId={currentUserId}
            isEditMode={true}
          />
        </CardContent>
      </Card>
    </div>
  );
}
