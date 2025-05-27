
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

  const [allRawMeetings, setAllRawMeetings] = useState<Meeting[]>([]);
  const [allFriends, setAllFriends] = useState<Friend[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined);
  const [dataLoading, setDataLoading] = useState(true);

  const currentPage = useMemo(() => {
    const page = parseInt(pageParam || '1', 10);
    return isNaN(page) || page < 1 ? 1 : page;
  }, [pageParam]);

  useEffect(() => {
    setSelectedYear(yearParam ? parseInt(yearParam) : undefined);
  }, [yearParam]);

  useEffect(() => {
    const fetchData = async () => {
      setDataLoading(true);
      try {
        const [fetchedMeetings, fetchedFriends] = await Promise.all([
          getMeetings(), // Fetches all meetings
          getFriends()
        ]);
        
        setAllRawMeetings(fetchedMeetings);
        setAllFriends(fetchedFriends);

        const years = Array.from(new Set(fetchedMeetings.map(m => new Date(m.dateTime).getFullYear()))).sort((a, b) => b - a);
        setAvailableYears(years);

      } catch (error) {
        console.error("Failed to fetch meetings or friends:", error);
      } finally {
        setDataLoading(false);
      }
    };

    if (!authLoading) {
        fetchData();
    }
  }, [authLoading]);

  const filteredMeetings = useMemo(() => {
    return selectedYear
      ? allRawMeetings.filter(m => new Date(m.dateTime).getFullYear() === selectedYear)
      : allRawMeetings;
  }, [allRawMeetings, selectedYear]);

  const paginatedMeetings = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredMeetings.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredMeetings, currentPage]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredMeetings.length / ITEMS_PER_PAGE);
  }, [filteredMeetings.length]);


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
        initialMeetings={paginatedMeetings} 
        allFriends={allFriends}
        availableYears={availableYears}
        selectedYear={selectedYear}
        currentPage={currentPage}
        totalPages={totalPages}
      />
    </div>
  );
}
