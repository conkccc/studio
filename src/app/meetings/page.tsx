
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getMeetings, getFriends } from '@/lib/data-store'; // Now async
import { MeetingListClient } from '@/components/meetings/MeetingListClient';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { Meeting, Friend } from '@/lib/types';
import { useSearchParams } from 'next/navigation';


export default function MeetingsPage() {
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const yearParam = searchParams.get('year');

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [allFriends, setAllFriends] = useState<Friend[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    const currentYear = new Date().getFullYear();
    setSelectedYear(yearParam ? parseInt(yearParam) : undefined);
  }, [yearParam]);

  useEffect(() => {
    const fetchData = async () => {
      setDataLoading(true);
      try {
        const [fetchedMeetings, fetchedFriends] = await Promise.all([
          getMeetings(),
          getFriends()
        ]);
        
        const years = Array.from(new Set(fetchedMeetings.map(m => m.dateTime.getFullYear()))).sort((a, b) => b - a);
        setAvailableYears(years);
        
        const meetingsToDisplay = selectedYear
          ? fetchedMeetings.filter(m => m.dateTime.getFullYear() === selectedYear)
          : fetchedMeetings;

        setMeetings(meetingsToDisplay);
        setAllFriends(fetchedFriends);

      } catch (error) {
        console.error("Failed to fetch meetings or friends:", error);
      } finally {
        setDataLoading(false);
      }
    };

    if (!authLoading) { // Fetch data only after auth state is resolved
        fetchData();
    }
  }, [authLoading, selectedYear]); // Re-fetch if selectedYear changes

  if (authLoading || dataLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">모임 목록 로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">모임 관리</h1>
          <p className="text-muted-foreground">
            지난 모임을 확인하고 새로운 모임을 만드세요.
          </p>
        </div>
        {isAdmin && (
          <Link href="/meetings/new" passHref legacyBehavior={false}>
            <Button>
              <PlusCircle className="mr-2 h-5 w-5" />
              새 모임 만들기
            </Button>
          </Link>
        )}
      </div>
      
      <MeetingListClient 
        initialMeetings={meetings} 
        allFriends={allFriends}
        availableYears={availableYears}
        selectedYear={selectedYear}
      />
    </div>
  );
}
