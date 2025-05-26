
import { getMeetingById, getExpensesByMeetingId, getFriends, getSpendingDataForMeeting } from '@/lib/data-store';
import { MeetingDetailsClient } from '@/components/meetings/MeetingDetailsClient';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"


export default async function MeetingDetailPage({ params }: { params: { meetingId: string } }) {
  const meetingId = params.meetingId;
  const meeting = await getMeetingById(meetingId);

  if (!meeting) {
    notFound();
  }

  const expenses = await getExpensesByMeetingId(meetingId);
  const allFriends = await getFriends();
  const spendingDataForAI = await getSpendingDataForMeeting(meetingId);

  // For simplicity, assume current user is the first friend or a mock ID.
  const currentUserId = allFriends.length > 0 ? allFriends[0].id : 'mock-user-id'; 

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
        currentUserId={currentUserId}
        spendingDataForAI={spendingDataForAI}
      />
    </div>
  );
}
