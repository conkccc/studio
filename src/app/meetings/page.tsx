
'use client';

import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { getMeetings, getFriends } from '@/lib/data-store';
import { MeetingListClient } from '@/components/meetings/MeetingListClient';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { Meeting, Friend } from '@/lib/types';
import { useSearchParams } from 'next/navigation';

const ITEMS_PER_PAGE = 10;

export default function MeetingsPage() {
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const yearParam = searchParams.get('year');
  const pageParam = searchParams.get('page');

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [allFriends, setAllFriends] = useState<Friend[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [totalMeetingCount, setTotalMeetingCount] = useState(0);

  const currentPage = useMemo(() => {
    const page = parseInt(pageParam || '1', 10);
    return isNaN(page) || page < 1 ? 1 : page;
  }, [pageParam]);

  useEffect(() => {
    setSelectedYear(yearParam ? parseInt(yearParam) : undefined);
  }, [yearParam]);

 useEffect(() => {
    const fetchData = async () => {
      if (authLoading && !currentUser) { // Wait for auth to load, but proceed if user is not logged in (for public view)
        setMeetingsLoading(false); // Stop loading if auth hasn't determined user yet but we might show public content
        return;
      }
      if(!authLoading && !currentUser && !isAdmin) {
        // Non-admin, non-logged in users can see meetings, but no special fetching logic based on user role here yet
        // This is more for a scenario where getMeetings might differ for admin vs public. For now, it's the same.
      }


      setMeetingsLoading(true);
      try {
        // Firestore version of getMeetings returns an object { meetings, totalCount, availableYears }
        const fetchedMeetingsData = await getMeetings({
          page: currentPage,
          limit: ITEMS_PER_PAGE,
          year: selectedYear,
        });

        setMeetings(fetchedMeetingsData.meetings);
        setTotalMeetingCount(fetchedMeetingsData.totalCount);
        setAvailableYears(fetchedMeetingsData.availableYears);

        if (allFriends.length === 0) { // Fetch friends only if not already fetched
             const fetchedFriends = await getFriends();
             setAllFriends(fetchedFriends);
        }
      } catch (error) {
        console.error("Failed to fetch meetings:", error);
        // Optionally set an error state here
      } finally {
        setMeetingsLoading(false);
      }
    };

    fetchData();

  }, [authLoading, currentUser, isAdmin, currentPage, selectedYear, allFriends.length]); // Added isAdmin and currentUser as dependencies

  const totalPages = useMemo(() => {
    return Math.ceil(totalMeetingCount / ITEMS_PER_PAGE);
  }, [totalMeetingCount]);

  const dataLoading = authLoading || meetingsLoading;

  if (dataLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">모임 목록 로딩 중...</p>
      </div>
    );
  }
  
  // This check might be redundant if getMeetings always fetches friends or if friends are fetched once.
  // However, keeping it as a safeguard if allFriends fetching is conditional.
  if (meetings.length > 0 && allFriends.length === 0 && !authLoading && !meetingsLoading ) {
      // This state implies meetings are loaded but friends are not, which is unusual if friends are needed for MeetingCard
      // This might indicate a state where `getFriends` failed or hasn't completed for some reason
       return (
         <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
           <p className="text-xl text-muted-foreground">친구 정보 로딩 중...</p>
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
        currentPage={currentPage}
        totalPages={totalPages}
      />
    </div>
  );
}
