import Link from 'next/link';
import { getMeetings, getFriends } from '@/lib/data-store';
import { MeetingListClient } from '@/components/meetings/MeetingListClient';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams?: { year?: string };
}) {
  const allMeetings = await getMeetings();
  const friends = await getFriends();
  
  const currentYear = new Date().getFullYear();
  const selectedYear = searchParams?.year ? parseInt(searchParams.year) : undefined;

  const meetingsToDisplay = selectedYear
    ? allMeetings.filter(m => m.dateTime.getFullYear() === selectedYear)
    : allMeetings;
  
  const yearsWithMeetings = Array.from(new Set(allMeetings.map(m => m.dateTime.getFullYear()))).sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">모임 관리</h1>
          <p className="text-muted-foreground">
            지난 모임을 확인하고 새로운 모임을 만드세요.
          </p>
        </div>
        <Link href="/meetings/new" passHref legacyBehavior>
          <Button>
            <PlusCircle className="mr-2 h-5 w-5" />
            새 모임 만들기
          </Button>
        </Link>
      </div>
      
      <MeetingListClient 
        initialMeetings={meetingsToDisplay} 
        allFriends={friends}
        availableYears={yearsWithMeetings}
        selectedYear={selectedYear}
      />
    </div>
  );
}
