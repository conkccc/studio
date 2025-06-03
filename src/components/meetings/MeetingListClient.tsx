'use client';

import React, { useState, useMemo } from 'react'; // Added useState, useMemo
import type { Meeting, Friend } from '@/lib/types';
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
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MeetingListClientProps {
  initialMeetings: Meeting[];
  allFriends: Friend[];
  availableYears: number[];
  selectedYear?: number;
  currentPage: number;
  totalPages: number;
  groups: { id: string; name: string }[];
  selectedGroupId: string | null;
  onGroupChange: (groupId: string | null) => void;
}

export function MeetingListClient({ 
  initialMeetings, 
  allFriends, 
  availableYears,
  selectedYear,
  currentPage,
  totalPages,
  groups,
  selectedGroupId,
  onGroupChange
}: MeetingListClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filterType, setFilterType] = useState<'all' | 'regular' | 'temporary'>('all');

  const handleYearChange = (year: string) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    if (year === "all" || !year) {
      current.delete("year");
    } else {
      current.set("year", year);
    }
    current.delete("page"); // Reset page when year changes
    const query = current.toString();
    router.push(`${pathname}${query ? `?${query}` : ""}`);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    current.set("page", newPage.toString());
    const query = current.toString();
    router.push(`${pathname}${query ? `?${query}` : ""}`);
  };
  
  const currentDisplayYear = selectedYear ? selectedYear.toString() : "all";

  const filteredMeetings = useMemo(() => {
    let meetingsToFilter = initialMeetings;
    if (selectedGroupId) {
      meetingsToFilter = meetingsToFilter.filter(meeting => meeting.groupId === selectedGroupId);
    }

    if (filterType === 'regular') {
      return meetingsToFilter.filter(meeting => !meeting.isTemporary);
    }
    if (filterType === 'temporary') {
      return meetingsToFilter.filter(meeting => meeting.isTemporary);
    }
    return meetingsToFilter; // 'all' or default
  }, [initialMeetings, filterType, selectedGroupId]);

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <CardTitle>모임 목록 {selectedYear && `(${selectedYear}년)`}</CardTitle>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <div className="w-full sm:w-auto sm:min-w-[180px]">
            <Select onValueChange={handleYearChange} defaultValue={currentDisplayYear}>
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
          <div className="w-full sm:w-auto sm:min-w-[180px]">
            <Select
              onValueChange={val => onGroupChange(val === 'all' ? null : val)}
              value={selectedGroupId || 'all'}
            >
              <SelectTrigger id="group-filter" aria-label="그룹 필터">
                <SelectValue placeholder="전체 그룹" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 그룹</SelectItem>
                {groups.map(group => (
                  <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-auto sm:min-w-[180px]"> {/* New Select for Meeting Type */}
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
        {filteredMeetings.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4"> {/* Added pt-4 for spacing after header filters */}
              {filteredMeetings.map((meeting) => (
                <MeetingCard key={meeting.id} meeting={meeting} allFriends={allFriends} />
              ))}
            </div>
            {totalPages > 1 && ( // Pagination should ideally also consider the filtered list length if done client-side, or be handled by server if filtering affects total pages.
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
                {/* Consider a more advanced pagination component for many pages */}
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNumber) => (
                   (pageNumber === currentPage || 
                    pageNumber === 1 || 
                    pageNumber === totalPages || 
                    (pageNumber >= currentPage -1 && pageNumber <= currentPage + 1) ||
                    (currentPage <=3 && pageNumber <=5) ||
                    (currentPage >= totalPages -2 && pageNumber >= totalPages -4)
                   ) && (
                    <Button
                        key={pageNumber}
                        variant={currentPage === pageNumber ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePageChange(pageNumber)}
                        className={
                          ( (currentPage > 3 && pageNumber === 1) || (currentPage < totalPages - 2 && pageNumber === totalPages) ) 
                          ? "hidden sm:inline-flex" 
                          : "inline-flex"
                        } 
                      >
                        {pageNumber}
                    </Button>
                   )
                ))}
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
              {selectedYear ? `${selectedYear}년에는 모임이 없습니다.` : '아직 등록된 모임이 없습니다.'}
            </p>
            <p>새로운 모임을 만들어 친구들과의 추억을 기록해보세요!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
