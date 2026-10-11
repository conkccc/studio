import { getMeetingDetailsAction } from '@/lib/actions';
import { MeetingDetailsClient } from '@/features/meetings/MeetingDetailsClient';
import { notFound } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { withRequestUser } from '@/lib/auth/request-user';

export default async function MeetingDetailPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  // Reuse the layout's request-cached session/profile for the action's access check.
  const user = await getAuthenticatedUser();
  const result = user
    ? await withRequestUser(user, () => getMeetingDetailsAction(meetingId))
    : await getMeetingDetailsAction(meetingId);
  if (!result.success || !result.meeting) notFound();
  return <MeetingDetailsClient initialMeeting={result.meeting} initialExpenses={result.expenses || []} allFriends={result.friends || []} />;
}
