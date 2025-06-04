import {
  getMeetingByIdAction,
  getAllUsersAction,
  getExpensesByMeetingIdAction,
  getAllFriendsAction
} from '@/lib/actions';
import { MeetingDetailsClient } from '@/components/meetings/MeetingDetailsClient';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { Meeting, Expense, Friend, User } from '@/lib/types';
import { notFound } from 'next/navigation';

export default async function MeetingDetailPage({ params: paramsPromise }: { params: Promise<{ meetingId: string }> }) {
  const params = await paramsPromise;
  const meetingId = params.meetingId;

  const [meetingResult, usersResult, expensesResult, friendsResult] = await Promise.all([
    getMeetingByIdAction(meetingId),
    getAllUsersAction(),
    getExpensesByMeetingIdAction(meetingId),
    getAllFriendsAction()
  ]);

  if (!meetingResult.success || !meetingResult.meeting) {
    notFound();
  }

  const meeting = meetingResult.meeting;
  const allUsers = usersResult.success && usersResult.users ? usersResult.users : [];
  const initialExpenses = expensesResult.success && expensesResult.expenses ? expensesResult.expenses : [];
  const allFriends = friendsResult.success && friendsResult.friends ? friendsResult.friends : [];
  
  // MeetingDetailsClient는 클라이언트 컴포넌트이며, 내부에서 useAuth를 통해 appUser/currentUser 정보를 가져와 사용합니다.
  // 서버 컴포넌트인 이 페이지에서는 인증 정보를 직접 MeetingDetailsClient에 prop으로 내릴 필요는 없습니다.
  // (단, MeetingDetailsClient가 서버에서만 알 수 있는 추가적인 사용자 관련 정보가 필요하다면 여기서 전달해야 함)

  return (
    <div className="space-y-6">
      <MeetingDetailsClient
        initialMeeting={meeting}
        initialExpenses={initialExpenses}
        allFriends={allFriends}
        allUsers={allUsers}
      />

      {meeting.locationName && (meeting.locationCoordinates || meeting.locationLink) && (
         <div className="flex justify-center gap-4 mt-8">
            {meeting.locationLink && (
            <Button asChild>
                <a href={meeting.locationLink} target="_blank" rel="noopener noreferrer">
                외부 지도 (제공됨)
                </a>
            </Button>
            )}
            {!meeting.locationLink && meeting.locationName && (
                 <Button asChild variant="outline">
                    <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(meeting.locationName)}${meeting.locationCoordinates ? `&ll=${meeting.locationCoordinates.lat},${meeting.locationCoordinates.lng}` : ''}`}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Google Maps에서 검색
                    </a>
                </Button>
            )}
         </div>
      )}
    </div>
  );
}
