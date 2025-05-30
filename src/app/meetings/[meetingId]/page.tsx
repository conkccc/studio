
'use client';

import { useEffect, useState } from 'react';
import { getMeetingById, getExpensesByMeetingId, getFriends } from '@/lib/data-store';
import { MeetingDetailsClient } from '@/components/meetings/MeetingDetailsClient';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { Meeting, Expense, Friend } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentUser, isAdmin, userRole, loading: authLoading } = useAuth();

  const meetingId = typeof params.meetingId === 'string' ? params.meetingId : undefined;

  const [meeting, setMeeting] = useState<Meeting | null | undefined>(undefined);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allFriends, setAllFriends] = useState<Friend[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (authLoading && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") {
      setDataLoading(true);
      return;
    }
    if (!meetingId) {
        setMeeting(null); // No meetingId, treat as not found
        setDataLoading(false);
        return;
    }
    // Allow data fetching if dev mode skip auth, or not auth loading and (user has role or no current user for public view)
    const canFetch = process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH === "true" || 
                     (!authLoading && (userRole !== null || !currentUser));
    
    if (!canFetch) {
      setDataLoading(false);
      // Potentially set meeting to null or keep undefined to show appropriate message
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
        // If restricted, these fetches would also need role checks or rely on Firestore rules.
        const [fetchedExpenses, fetchedFriends] = await Promise.all([
          getExpensesByMeetingId(meetingId),
          getFriends(), // getFriends might be restricted to admin/user by Firestore rules
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
  }, [meetingId, authLoading, currentUser, userRole]); // Removed isAdmin from deps as data fetching might be public


  if ((authLoading && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") || dataLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">모임 상세 정보 로딩 중...</p>
      </div>
    );
  }
  
  // This check is for after loading completes
  if (userRole === 'none' && currentUser && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") {
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">접근 권한 없음</h1>
        <p className="text-muted-foreground mb-6">이 모임의 상세 정보를 보려면 역할 할당이 필요합니다. 관리자에게 문의하세요.</p>
        <Button asChild>
          <Link href="/">대시보드로 돌아가기</Link>
        </Button>
      </div>
    );
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
  
  if (!meeting && !dataLoading) { // If meeting is undefined after loading (should be caught by null check above)
    return <div className="text-center py-10">모임 정보를 불러올 수 없습니다.</div>;
  }


  return (
    <div className="space-y-6">
      {/* "All Meetings" button is now inside MeetingDetailsClient and conditional */}
      <MeetingDetailsClient
        initialMeeting={meeting!} // Assert meeting is not null/undefined here
        initialExpenses={expenses}
        allFriends={allFriends}
      />
    </div>
  );
}
