import { getMeetingDetailsAction } from '@/lib/actions';
import { MeetingDetailsClient } from '@/features/meetings/MeetingDetailsClient';
import { notFound } from 'next/navigation';

export default async function MeetingDetailPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const result = await getMeetingDetailsAction(meetingId);
  if (!result.success || !result.meeting) notFound();
  return <MeetingDetailsClient initialMeeting={result.meeting} initialExpenses={result.expenses || []} allFriends={result.friends || []} />;
}
