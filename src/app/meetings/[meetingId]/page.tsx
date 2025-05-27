
'use client';

import { useEffect, useState } from 'react';
import { getMeetingById, getExpensesByMeetingId, getFriends, getSpendingDataForMeeting } from '@/lib/data-store'; // Now async
import { MeetingDetailsClient } from '@/components/meetings/MeetingDetailsClient';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation'; // For client component
import type { Meeting, Expense, Friend } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentUser, isAdmin, loading: authLoading } = useAuth();

  const meetingId = typeof params.meetingId === 'string' ? params.meetingId : undefined;

  const [meeting, setMeeting] = useState<Meeting | null | undefined>(undefined); // undefined for loading, null for not found
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allFriends, setAllFriends] = useState<Friend[]>([]);
  const [spendingDataForAI, setSpendingDataForAI] = useState<string>("");
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (meetingId) {
      const fetchData = async () => {
        setDataLoading(true);
        try {
          const fetchedMeeting = await getMeetingById(meetingId);
          if (!fetchedMeeting) {
            setMeeting(null); // Not found
            setDataLoading(false);
            return;
          }
          setMeeting(fetchedMeeting);

          const [fetchedExpenses, fetchedFriends, fetchedSpendingData] = await Promise.all([
            getExpensesByMeetingId(meetingId),
            getFriends(),
            getSpendingDataForMeeting(meetingId)
          ]);
          setExpenses(fetchedExpenses);
          setAllFriends(fetchedFriends);
          setSpendingDataForAI(fetchedSpendingData);

        } catch (error) {
          console.error("Failed to fetch meeting details:", error);
          setMeeting(null); // Error case
        } finally {
          setDataLoading(false);
        }
      };
      fetchData();
    } else {
        // No meetingId, treat as not found or redirect
        setMeeting(null);
        setDataLoading(false);
    }
  }, [meetingId]);

  if (authLoading || dataLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">모임 상세 정보 로딩 중...</p>
      </div>
    );
  }

  if (meeting === null) { // Explicitly null for not found
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
  
  if (!meeting) { // Still loading or error before meeting is set
    return <div className="text-center py-10">로딩 중...</div>;
  }


  const currentUserId = currentUser?.uid || (allFriends.length > 0 ? allFriends[0].id : 'mock-user-id'); 

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" asChild>
          <Link href="/meetings">
            <ArrowLeft className="mr-2 h-4 w-4" />
            모든 모임 목록
          </Link>
        </Button>
      </div>
      <MeetingDetailsClient
        initialMeeting={meeting}
        initialExpenses={expenses}
        allFriends={allFriends}
        currentUserId={currentUserId} // This should ideally come from auth context
        spendingDataForAI={spendingDataForAI}
      />
    </div>
  );
}
