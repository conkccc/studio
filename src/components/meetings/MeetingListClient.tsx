'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Meeting, Friend, User } from '@/lib/types';
import { MeetingCard } from './MeetingCard';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, PlusCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getMeetingsForUserAction, getAllUsersAction } from '@/lib/actions'; // Added getAllUsersAction
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link'; // For "새 모임 만들기" button

const MEETINGS_PER_PAGE = 9; // Example: 9 meetings per page for a 3-col layout

interface MeetingListClientProps {
  allFriends: Friend[]; // Keep allFriends as MeetingCard uses it for participants display
}

export function MeetingListClient({ allFriends }: MeetingListClientProps) {
  const { currentUser, loading: authLoading, appUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]); // State for all users
  const [isLoading, setIsLoading] = useState(true);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [totalPages, setTotalPages] = useState(0);

  const selectedYearParam = searchParams.get('year');
  const currentPageParam = searchParams.get('page');

  // Default activeYear to current year string if no year param; "all" remains an option for explicit selection
  const activeYear = useMemo(() => selectedYearParam || new Date().getFullYear().toString(), [selectedYearParam]);
  const currentPage = useMemo(() => parseInt(currentPageParam || "1", 10), [currentPageParam]);

  const [filterType, setFilterType] = useState<'all' | 'regular' | 'temporary'>('all');

  const fetchData = useCallback(async () => { // Renamed from fetchMeetings to fetchData
    if (authLoading || !currentUser?.uid) {
      setIsLoading(false);
      setMeetings([]);
      setAllUsers([]); // Clear allUsers as well
      setTotalPages(0);
      setAvailableYears([]);
      return;
    }
    setIsLoading(true);
    try {
      const yearToFetch = activeYear === "all" ? undefined : parseInt(activeYear, 10);

      // Fetch meetings and all users in parallel
      const [meetingsResult, usersResult] = await Promise.all([
        getMeetingsForUserAction({
          requestingUserId: currentUser.uid,
          year: yearToFetch,
          page: currentPage,
          limitParam: MEETINGS_PER_PAGE,
        }),
        getAllUsersAction() // Fetch all users
      ]);

      if (meetingsResult.success) {
        setMeetings(meetingsResult.meetings || []);
        setTotalPages(Math.ceil((meetingsResult.totalCount || 0) / MEETINGS_PER_PAGE));
        setAvailableYears(meetingsResult.availableYears || []);
      } else {
        toast({ title: "오류", description: meetingsResult.error || "모임 목록을 불러오는데 실패했습니다.", variant: "destructive" });
        setMeetings([]);
        setTotalPages(0);
      }

      if (usersResult.success) {
        setAllUsers(usersResult.users || []);
      } else {
        toast({ title: "오류", description: usersResult.error || "사용자 목록을 불러오는데 실패했습니다.", variant: "destructive" });
        setAllUsers([]);
      }

    } catch (e) {
      toast({ title: "오류", description: "데이터 로딩 중 예기치 않은 오류 발생.", variant: "destructive" });
      setMeetings([]);
      setAllUsers([]);
      setTotalPages(0);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, authLoading, activeYear, currentPage, toast]);

  useEffect(() => {
    fetchData(); // Call renamed function
  }, [fetchData]);

  const handleYearChange = (year: string) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    if (year === "all" || !year) {
      current.delete("year");
    } else {
      current.set("year", year);
    }
    current.set("page", "1"); // Reset page when year changes
    router.push(`${pathname}?${current.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    current.set("page", newPage.toString());
    router.push(`${pathname}?${current.toString()}`);
  };

  const clientFilteredMeetings = useMemo(() => {
    if (filterType === 'regular') {
      return meetings.filter(meeting => !meeting.isTemporary);
    }
    if (filterType === 'temporary') {
      return meetings.filter(meeting => meeting.isTemporary);
    }
    return meetings;
  }, [meetings, filterType]);

  // currentUser might be null here if still authLoading or logged out
  // appUser is used here for role check as it's our Firestore-backed user profile
  const canCreateMeeting = appUser && (appUser.role === 'user' || appUser.role === 'admin');

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <CardTitle>모임 목록 {activeYear !== "all" && `(${activeYear}년)`}</CardTitle>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {canCreateMeeting && (
            <Button asChild className="w-full sm:w-auto">
              <Link href="/meetings/new">
                <PlusCircle className="h-4 w-4 mr-2" /> 새 모임 만들기
              </Link>
            </Button>
          )}
           <div className="w-full sm:w-auto sm:min-w-[150px]">
            <Select onValueChange={handleYearChange} value={activeYear}>
              <SelectTrigger id="year-filter" aria-label="연도 필터">
                <SelectValue placeholder="연도 선택..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 연도</SelectItem>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}년</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-auto sm:min-w-[150px]">
            <Select value={filterType} onValueChange={(value: 'all' | 'regular' | 'temporary') => setFilterType(value)}>
              <SelectTrigger id="type-filter" aria-label="모임 종류 필터">
                <SelectValue placeholder="모임 종류 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 종류</SelectItem>
                <SelectItem value="regular">일반 모임</SelectItem>
                <SelectItem value="temporary">임시 모임</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
        ) : clientFilteredMeetings.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
              {clientFilteredMeetings.map((meeting) => (
                <MeetingCard key={meeting.id} meeting={meeting} allFriends={allFriends} allUsers={allUsers} />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center space-x-2 pt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  이전
                </Button>
                {/* Basic pagination display - can be enhanced */}
                <span className="text-sm text-muted-foreground">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  다음
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg mb-2">
              {activeYear !== "all" ? `${activeYear}년에는 해당하는 모임이 없습니다.` : '표시할 모임이 없습니다.'}
            </p>
            {canCreateMeeting && <p>새로운 모임을 만들어 친구들과의 추억을 기록해보세요!</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
