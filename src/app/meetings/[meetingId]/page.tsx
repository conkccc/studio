'use client';

import { use, useEffect, useState } from 'react';
import { getMeetingById, getExpensesByMeetingId, getFriends } from '@/lib/data-store';
import { MeetingDetailsClient } from '@/components/meetings/MeetingDetailsClient';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Meeting, Expense, Friend } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';

export default function MeetingDetailPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { currentUser, userRole, loading: authLoading } = useAuth();
  // Next.js 14: params는 Promise이므로 use()로 언래핑
  const { meetingId } = use(params);

  const [meeting, setMeeting] = useState<Meeting | null | undefined>(undefined);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allFriends, setAllFriends] = useState<Friend[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (authLoading && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") {
      setDataLoading(true);
      return;
    }
    if (!meetingId) {
        setMeeting(null);
        setDataLoading(false);
        return;
    }

    const canFetchPublicData = process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH === "true" || !authLoading;
    const canFetchUserData = currentUser && (userRole === 'admin' || userRole === 'user');

    if (!canFetchPublicData && !canFetchUserData) {
      setDataLoading(false);
      setMeeting(undefined); // Or null to indicate no access or data
      return;
    }

    const fetchData = async () => {
      setDataLoading(true);
      try {
        const fetchedMeeting = await getMeetingById(meetingId);
        if (!fetchedMeeting) {
          setMeeting(null);
          setDataLoading(false);
          return;
        }
        setMeeting(fetchedMeeting);

        // Fetch expenses and friends regardless of user role for public viewing capability
        // Firestore rules should be the primary gatekeeper for sensitive data.
        const [fetchedExpenses, fetchedFriends] = await Promise.all([
          getExpensesByMeetingId(meetingId),
          getFriends(), 
        ]);
        setExpenses(fetchedExpenses);
        setAllFriends(fetchedFriends);

      } catch (error) {
        console.error("Failed to fetch meeting details:", error);
        setMeeting(null);
      } finally {
        setDataLoading(false);
      }
    };
    fetchData();
  }, [meetingId, authLoading, currentUser, userRole]);


  if ((authLoading && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") || dataLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">모임 상세 정보 로딩 중...</p>
      </div>
    );
  }
  
  // Redirect to login if user is authenticated but has no role (and not in dev mode skipping auth)
  if (!authLoading && userRole === 'none' && currentUser && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") {
    router.push('/login');
  }
  
  if (meeting === null) {
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">모임을 찾을 수 없습니다.</h1>
        <p className="text-muted-foreground mb-6">요청하신 모임이 존재하지 않거나 삭제되었을 수 있습니다.</p>
        <Button asChild>
          <Link href="/meetings">모임 목록으로 돌아가기</Link>
        </Button>
      </div>
    );
  }
  
  if (!meeting && !dataLoading) { 
    return <div className="text-center py-10">모임 정보를 불러올 수 없습니다.</div>;
  }

  return (
    <div className="space-y-6">
      {meeting && (
        <MeetingDetailsClient
          initialMeeting={meeting}
          initialExpenses={expenses}
          allFriends={allFriends}
        />
      )}

      {/* Ensure the button container is explicitly displayed and visible */}
      <div className="flex justify-center gap-4 mt-8" style={{ display: 'flex', visibility: 'visible' }}>
        {meeting && meeting.locationLink && (
          <Button asChild>
            <a href={meeting.locationLink} target="_blank" rel="noopener noreferrer">
              외부 지도 보기
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
