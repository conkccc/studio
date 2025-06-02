'use client';

import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { getMeetings, getFriends, getFriendGroupsByUser } from '@/lib/data-store';
import { MeetingListClient } from '@/components/meetings/MeetingListClient';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { Meeting, Friend, FriendGroup } from '@/lib/types';
import { useSearchParams } from 'next/navigation';

const ITEMS_PER_PAGE = 10;

export default function MeetingsPage() {
  const { currentUser, isAdmin, userRole, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const yearParam = searchParams.get('year');
  const pageParam = searchParams.get('page');

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [allFriends, setAllFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [totalMeetingCount, setTotalMeetingCount] = useState(0);

  const currentPage = useMemo(() => {
    const page = parseInt(pageParam || '1', 10);
    return isNaN(page) || page < 1 ? 1 : page;
  }, [pageParam]);

  useEffect(() => {
    if (yearParam === null || yearParam === "all") {
      // 기본값: 현재 연도
      setSelectedYear(new Date().getFullYear());
    } else {
      const parsedYear = parseInt(yearParam, 10);
      if (!isNaN(parsedYear)) {
        setSelectedYear(parsedYear);
      } else {
        setSelectedYear(new Date().getFullYear());
      }
    }
  }, [yearParam]);

  useEffect(() => {
    if (authLoading) {
      setDataLoading(true);
      return;
    }
    if (!(isAdmin || userRole === 'user')) { // 권한 없으면 데이터 패치 X
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
  }, [authLoading, isAdmin, userRole, currentUser, currentPage, selectedYear, allFriends.length]);

  useEffect(() => {
    if (!currentUser) return;
    getFriendGroupsByUser(currentUser.uid).then(setGroups);
  }, [currentUser]);

  const totalPages = useMemo(() => {
    return Math.ceil(totalMeetingCount / ITEMS_PER_PAGE);
  }, [totalMeetingCount]);

  if (authLoading || ((isAdmin || userRole === 'user') && dataLoading)) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">모임 목록 로딩 중...</p>
      </div>
    );
  }

  if (!(isAdmin || userRole === 'user')) {
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">접근 권한 없음</h1>
        <p className="text-muted-foreground mb-6">이 페이지는 관리자 또는 사용자만 접근할 수 있습니다.</p>
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
        <div className="flex flex-col sm:flex-row gap-2 items-center">
          <select
            className="block w-full appearance-none rounded-md border border-input bg-background px-4 py-2 pr-10 text-base shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 transition disabled:opacity-50"
            value={selectedGroupId || ''}
            onChange={e => setSelectedGroupId(e.target.value)}
          >
            <option value="">전체 그룹</option>
            {groups.map(group => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
          {isAdmin && (
            <Link href="/meetings/new" passHref legacyBehavior={false}>
              <Button>
                <PlusCircle className="mr-2 h-5 w-5" />
                새 모임 만들기
              </Button>
            </Link>
          )}
        </div>
      </div>
      {/* 그룹 필터 적용: selectedGroupId가 있으면 해당 그룹만, 없으면 전체 */}
      {dataLoading ? ( 
         <div className="flex justify-center items-center min-h-[200px]">
            <p className="text-muted-foreground">모임 정보 로딩 중...</p>
         </div>
      ) : (
        <MeetingListClient 
          initialMeetings={selectedGroupId ? meetings.filter(m => m.groupId === selectedGroupId) : meetings}
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
