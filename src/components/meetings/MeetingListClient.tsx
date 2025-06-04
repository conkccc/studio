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
import { getMeetingsForUserAction, getAllUsersAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

const MEETINGS_PER_PAGE = 9;

interface MeetingListClientProps {
  allFriends: Friend[];
}

export function MeetingListClient({ allFriends }: MeetingListClientProps) {
  const { currentUser, loading: authLoading, appUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [totalPages, setTotalPages] = useState(0);

  const selectedYearParam = searchParams.get('year');
  const currentPageParam = searchParams.get('page');

  const activeYear = useMemo(() => selectedYearParam || new Date().getFullYear().toString(), [selectedYearParam]);
  const currentPage = useMemo(() => parseInt(currentPageParam || "1", 10), [currentPageParam]);

  const [filterType, setFilterType] = useState<'all' | 'regular' | 'temporary'>('all');

  const fetchData = useCallback(async () => {
    if (authLoading || !currentUser?.uid) {
      setIsLoading(false);
      setMeetings([]);
      setAllUsers([]);
      setTotalPages(0);
      setAvailableYears([]);
      return;
    }
    setIsLoading(true);
    try {
      const yearToFetch = activeYear === "all" ? undefined : parseInt(activeYear, 10);

      const [meetingsResult, usersResult] = await Promise.all([
        getMeetingsForUserAction({
          requestingUserId: currentUser.uid,
          year: yearToFetch,
          page: currentPage,
          limitParam: MEETINGS_PER_PAGE,
        }),
        getAllUsersAction()
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
    fetchData();
  }, [fetchData]);

  const handleYearChange = (year: string) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    if (year === "all" || !year) {
      current.delete("year");
    } else {
      current.set("year", year);
    }
    current.set("page", "1");
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
