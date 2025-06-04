// Make this a Server Component
// 'use client'; // Remove this

// import { use, useEffect, useState } from 'react'; // Remove client-side hooks
import {
  getMeetingByIdAction,
  getAllUsersAction,
  getExpensesByMeetingIdAction,
  getAllFriendsAction
} from '@/lib/actions'; // Adjusted imports
import { MeetingDetailsClient } from '@/components/meetings/MeetingDetailsClient';
import { Button } from '@/components/ui/button';
import Link from 'next/link'; // Keep for UI elements like buttons if needed, or move to client component
// import { useRouter } from 'next/navigation'; // Remove if not used for navigation in server component
import type { Meeting, Expense, Friend, User } from '@/lib/types'; // Keep types
// import { useAuth } from '@/contexts/AuthContext'; // Remove client-side auth hook

import { notFound } from 'next/navigation'; // For handling not found cases

export default async function MeetingDetailPage(props: { params: Promise<{ meetingId: string }> }) {
  const params = await props.params;
  const meetingId = params.meetingId;

  // Fetch data in parallel
  const [meetingResult, usersResult, expensesResult, friendsResult] = await Promise.all([
    getMeetingByIdAction(meetingId),
    getAllUsersAction(),
    getExpensesByMeetingIdAction(meetingId),
    getAllFriendsAction()
  ]);

  if (!meetingResult.success || !meetingResult.meeting) {
    notFound(); // Or return a custom "Not Found" component/page
  }

  const meeting = meetingResult.meeting;
  const allUsers = usersResult.success ? usersResult.users : [];
  const initialExpenses = expensesResult.success ? expensesResult.expenses : [];
  const allFriends = friendsResult.success ? friendsResult.friends : [];
  
  // Auth context is not directly available in Server Components in the same way.
  // If MeetingDetailsClient needs appUser for its internal logic (e.g. "is this user the creator?"),
  // we might need to pass appUser.id or relevant parts of appUser from a server session if available,
  // or MeetingDetailsClient continues to use its own useAuth hook.
  // For "만든이" display, allUsers is now the primary source.

  return (
    <div className="space-y-6">
      <MeetingDetailsClient
        initialMeeting={meeting} // Pass the fetched meeting
        initialExpenses={initialExpenses} // Pass fetched expenses
        allFriends={allFriends} // Pass fetched friends
        allUsers={allUsers} // Pass allUsers
      />

      {/* Button for external link can remain here or be part of MeetingDetailsClient */}
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
