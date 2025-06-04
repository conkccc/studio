import {
  getMeetingByIdAction,
  getAllUsersAction,
  getExpensesByMeetingIdAction,
  getAllFriendsAction
} from '@/lib/actions';
import { MeetingDetailsClient } from '@/components/meetings/MeetingDetailsClient';
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
  
  return (
    <div className="space-y-6">
      <MeetingDetailsClient
        initialMeeting={meeting}
        initialExpenses={initialExpenses}
        allFriends={allFriends}
        allUsers={allUsers}
      />
    </div>
  );
}
