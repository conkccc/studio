import Link from 'next/link';
import { MeetingDetailsClient } from '@/features/meetings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Expense, Friend, Meeting, User } from '@/lib/types';
import { getMeetingByShareToken, getExpensesByMeetingId, getFriends, getUsers } from '@/lib/data-store';

interface SharedMeetingPageProps {
  params: Promise<{ token: string }>;
}

export default async function SharedMeetingPage({ params }: SharedMeetingPageProps) {
  const { token } = await params;

  let meeting: Meeting | null = null;
  let expenses: Expense[] = [];
  let allFriends: Friend[] = [];
  let allUsers: User[] = [];

  if (token) {
    meeting = (await getMeetingByShareToken(token)) ?? null;
    if (meeting) {
      [expenses, allFriends, allUsers] = await Promise.all([
        getExpensesByMeetingId(meeting.id),
        getFriends(),
        getUsers(),
      ]);
    }
  }

  if (!meeting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-6rem)] p-4">
        <Card className="max-w-xl w-full">
          <CardHeader>
            <CardTitle>유효하지 않거나 만료된 공유 링크입니다.</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">링크를 다시 확인하거나 모임 생성자에게 문의해주세요.</p>
            <Button asChild variant="outline">
              <Link href="/login">로그인으로 돌아가기</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <MeetingDetailsClient
      initialMeeting={meeting}
      initialExpenses={expenses}
      allFriends={allFriends}
      allUsers={allUsers}
      isReadOnlyShare
    />
  );
}
