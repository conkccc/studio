import Link from 'next/link';
import { MeetingDetailsClient } from '@/features/meetings/MeetingDetailsClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getMeetingByShareToken, getExpensesByMeetingId, getMeetingFriends, getUserById } from '@/lib/data-store';
import { meetingForDisplay } from '@/lib/participant-names';

export const dynamic = 'force-dynamic';

export default async function SharedMeetingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const meeting = await getMeetingByShareToken(token);
  if (!meeting) return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-xl">
        <CardHeader><CardTitle>유효하지 않거나 만료된 공유 링크입니다.</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">모임 생성자에게 새 공유 링크를 요청해주세요.</p>
          <Button asChild variant="outline"><Link href="/login">로그인</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
  const [expenses, creator] = await Promise.all([getExpensesByMeetingId(meeting.id), getUserById(meeting.creatorId)]);
  const friends = await getMeetingFriends(meeting, expenses);
  return <MeetingDetailsClient initialMeeting={{ ...meetingForDisplay(meeting, friends), creatorId: 'shared', creatorName: meeting.creatorName || creator?.name || '사용자', shareToken: null,
    participantSnapshot: meeting.participantSnapshot?.map(person => ({ id: person.id, name: person.name })),
    settlementSnapshot: meeting.settlementSnapshot ? { ...meeting.settlementSnapshot,
      participants: meeting.settlementSnapshot.participants.map(person => ({ ...person, description: '' })) } : undefined }}
    initialExpenses={expenses} allFriends={friends.map(friend => ({ ...friend, description: undefined }))} isReadOnlyShare />;
}
