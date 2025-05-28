
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

const ITEMS_PER_PAGE = 5;

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
      // Wait for auth to load, but proceed if user is not logged in (for public view)
      // Proceed if auth is done or if not logged in (public can see meetings)
      if (authLoading && currentUser) { 
        // If auth is still loading AND there's a current user, it might mean admin status isn't confirmed.
        // However, getMeetings itself doesn't differentiate by admin for fetching, only UI does.
        // So, we can proceed. If authLoading is true and currentUser is null, middleware handles redirect.
      }


      setMeetingsLoading(true);
      try {
        // Firestore version of getMeetings returns an object { meetings, totalCount, availableYears }
        const fetchedMeetingsData = await getMeetings({
          page: currentPage,
          limitParam: ITEMS_PER_PAGE, // Corrected parameter name
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

    // Only run fetchData if auth is not loading OR if there's no current user (public access)
    if (!authLoading || !currentUser) {
        fetchData();
    } else if (authLoading && !currentUser) {
        // If still loading auth and no user, likely to be redirected by middleware or show login prompt
        // We might not want to fetch data yet, or let public pages fetch regardless of user.
        // For now, if auth is loading AND there's no user, we also don't fetch to avoid premature calls.
        // But typically, public pages should fetch data regardless of auth state.
        // Let's adjust to fetch if not authLoading, OR if authLoading but it's for a public view (no user yet)
        // Simplified: If auth is done, fetch. Or if it's loading but for a public view, allow.
        // The condition "(!authLoading || !currentUser)" covers most cases.
        // If authLoading is true and currentUser is also true, implies admin check might be pending.
        // If authLoading is true and currentUser is false, implies public or about to be redirected.
        setMeetingsLoading(false); // Stop meetings loading if auth is determining user state for protected view.
    }


  }, [authLoading, currentUser, isAdmin, currentPage, selectedYear, allFriends.length]);

  const totalPages = useMemo(() => {
    return Math.ceil(totalMeetingCount / ITEMS_PER_PAGE);
  }, [totalMeetingCount]);

  const dataLoading = authLoading || meetingsLoading;

  if (dataLoading && currentUser) { // Only show full page loader if user is logged in and waiting for data
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">모임 목록 로딩 중...</p>
      </div>
    );
  }
  
  // Fallback for when data might be loading but for a public view, or quick flicker
  if (meetingsLoading && !currentUser && !authLoading){
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
        currentPage={currentPage}
        totalPages={totalPages}
      />
    </div>
  );
}

