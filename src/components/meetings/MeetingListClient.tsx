'use client';

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

interface MeetingListClientProps {
  initialMeetings: Meeting[];
  allFriends: Friend[];
  availableYears: number[];
  selectedYear?: number;
}

export function MeetingListClient({ 
  initialMeetings, 
  allFriends, 
  availableYears,
  selectedYear
}: MeetingListClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleYearChange = (year: string) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    if (year === "all" || !year) {
      current.delete("year");
    } else {
      current.set("year", year);
    }
    const query = current.toString();
    router.push(`${pathname}${query ? `?${query}` : ""}`);
  };
  
  const currentDisplayYear = selectedYear ? selectedYear.toString() : "all";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>모임 목록 {selectedYear && `(${selectedYear}년)`}</CardTitle>
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
      </CardHeader>
      <CardContent>
        {initialMeetings.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {initialMeetings.map((meeting) => (
              <MeetingCard key={meeting.id} meeting={meeting} allFriends={allFriends} />
            ))}
          </div>
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
