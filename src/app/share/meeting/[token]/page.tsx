
import { getMeetingByShareToken, getExpensesByMeetingId, getFriends } from '@/lib/data-store';
import { MeetingDetailsClient } from '@/components/meetings/MeetingDetailsClient';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SharedMeetingPageProps {
  params: { token: string };
}

export default async function SharedMeetingPage({ params }: SharedMeetingPageProps) {
  const { token } = params;

  if (!token) {
    return (
      <div className="container mx-auto py-8 text-center">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              잘못된 접근
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">공유 토큰이 제공되지 않았습니다.</p>
            <Button asChild className="mt-6">
              <Link href="/"><ArrowLeft className="mr-2 h-4 w-4"/> 홈으로 돌아가기</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const meeting = await getMeetingByShareToken(token);

  if (!meeting) {
    return (
      <div className="container mx-auto py-8 text-center">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              링크 오류 또는 만료
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">요청하신 모임 공유 링크가 유효하지 않거나 만료되었습니다.</p>
             <Button asChild className="mt-6">
              <Link href="/"><ArrowLeft className="mr-2 h-4 w-4"/> 홈으로 돌아가기</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fetch additional data needed by MeetingDetailsClient
  // These calls should ideally be efficient and not fetch unnecessary data.
  const expenses = await getExpensesByMeetingId(meeting.id);
  const allFriends = await getFriends(); // For mapping participant IDs to names

  return (
    <div className="container mx-auto py-8">
      <MeetingDetailsClient
        initialMeeting={meeting}
        initialExpenses={expenses}
        allFriends={allFriends}
        isReadOnlyShare={true} // Explicitly set to true for shared page
      />
    </div>
  );
}
