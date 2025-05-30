
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
  const { currentUser, isAdmin, userRole, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const yearParam = searchParams.get('year');
  const pageParam = searchParams.get('page');

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [allFriends, setAllFriends] = useState<Friend[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined);
  const [dataLoading, setDataLoading] = useState(true);
  const [totalMeetingCount, setTotalMeetingCount] = useState(0);

  const currentPage = useMemo(() => {
    const page = parseInt(pageParam || '1', 10);
    return isNaN(page) || page < 1 ? 1 : page;
  }, [pageParam]);

  useEffect(() => {
    if (yearParam === null || yearParam === "all") {
      setSelectedYear(undefined);
    } else {
      const parsedYear = parseInt(yearParam, 10);
      if (!isNaN(parsedYear)) {
        setSelectedYear(parsedYear);
      } else {
        setSelectedYear(undefined); 
      }
    }
  }, [yearParam]);

 useEffect(() => {
    if (authLoading && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") {
      setDataLoading(true);
      return;
    }

    const canFetchData = process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH === "true" || 
                         (!authLoading && (currentUser && (userRole === 'admin' || userRole === 'user')) || !currentUser) ; // Allow if dev mode, or (logged in and admin/user), or not logged in (public view)


    if (!canFetchData) {
      setDataLoading(false);
      setMeetings([]);
      setTotalMeetingCount(0);
      setAvailableYears([]);
      return;
    }
    
    const fetchData = async () => {
      setDataLoading(true);
      try {
        const fetchedMeetingsData = await getMeetings({
          page: currentPage,
          limitParam: ITEMS_PER_PAGE,
          year: selectedYear,
        });

        setMeetings(fetchedMeetingsData.meetings);
        setTotalMeetingCount(fetchedMeetingsData.totalCount);
        setAvailableYears(fetchedMeetingsData.availableYears);

        if (allFriends.length === 0 && currentUser && (isAdmin || userRole === 'user')) { 
             const fetchedFriends = await getFriends();
             setAllFriends(fetchedFriends);
        } else if (!currentUser && allFriends.length === 0) { // For public view, fetch friends if not already fetched
            const fetchedFriends = await getFriends(); // Assumes getFriends() is publicly accessible or handles auth internally
            setAllFriends(fetchedFriends);
        }
      } catch (error) {
        console.error("Failed to fetch meetings:", error);
        setMeetings([]);
        setTotalMeetingCount(0);
      } finally {
        setDataLoading(false);
      }
    };

    fetchData();

  }, [authLoading, currentUser, isAdmin, userRole, currentPage, selectedYear, allFriends.length]);

  const totalPages = useMemo(() => {
    return Math.ceil(totalMeetingCount / ITEMS_PER_PAGE);
  }, [totalMeetingCount]);


  if (authLoading && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">모임 목록 로딩 중...</p>
      </div>
    );
  }
  
  if (userRole === 'none' && currentUser && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") {
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">접근 권한 없음</h1>
        <p className="text-muted-foreground mb-6">모임 목록을 보려면 역할 할당이 필요합니다. 관리자에게 문의하세요.</p>
        <Button asChild>
          <Link href="/">대시보드로 돌아가기</Link>
        </Button>
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
      
      {dataLoading ? ( 
         <div className="flex justify-center items-center min-h-[200px]">
            <p className="text-muted-foreground">모임 정보 로딩 중...</p>
         </div>
      ) : (
        <MeetingListClient 
          initialMeetings={meetings}
          allFriends={allFriends}
          availableYears={availableYears}
          selectedYear={selectedYear}
          currentPage={currentPage}
          totalPages={totalPages}
        />
      )}
    </div>
  );
}
