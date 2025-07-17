'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { format, getDaysInMonth, startOfMonth, parseISO, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DateSummaryEntry {
  availableCount: number;
  availableFriends: string[];
  unavailableFriends: string[];
}

interface MeetingPrepSummaryCalendarProps {
  selectedMonths: string[];
  dateSummary: Record<string, DateSummaryEntry>;
  totalParticipants: number;
}

export function MeetingPrepSummaryCalendar({
  selectedMonths,
  dateSummary,
  totalParticipants,
}: MeetingPrepSummaryCalendarProps) {
  const monthsToDisplay = selectedMonths.map(monthStr => {
    const [year, month] = monthStr.split('-').map(Number);
    return startOfMonth(new Date(year, month - 1));
  }).sort((a, b) => a.getTime() - b.getTime());

  const getColorClass = (availableCount: number) => {
    if (totalParticipants === 0) return "bg-gray-200";
    const percentage = availableCount / totalParticipants;
    if (percentage === 1) return "bg-green-500 text-white"; // All available
    if (percentage >= 0.75) return "bg-green-400";
    if (percentage >= 0.5) return "bg-yellow-400";
    if (percentage >= 0.25) return "bg-orange-400";
    return "bg-red-400"; // Few available
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>참석 가능 날짜 요약</CardTitle>
        <CardDescription>모든 참여자의 응답을 기반으로 한 날짜별 요약입니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {monthsToDisplay.map((monthStart, monthIndex) => {
            const daysInMonth = getDaysInMonth(monthStart);
            const firstDayOfMonth = monthStart.getDay(); // 0 = Sunday, 1 = Monday, etc.
            const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

            return (
              <Card key={monthIndex} className="p-4">
                <CardTitle className="text-center mb-4">{format(monthStart, 'yyyy년 MM월', { locale: ko })}</CardTitle>
                <div className="grid grid-cols-7 gap-1 text-center text-sm font-medium mb-2">
                  <div className="text-red-500">일</div>
                  <div>월</div>
                  <div>화</div>
                  <div>수</div>
                  <div>목</div>
                  <div>금</div>
                  <div className="text-blue-500">토</div>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: firstDayOfMonth }, (_, i) => (
                    <div key={`empty-${i}`} className="h-10 w-10"></div>
                  ))}
                  {days.map(day => {
                    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
                    const dateString = format(date, 'yyyy-MM-dd');
                    const summary = dateSummary[dateString];
                    const isToday = isSameDay(date, new Date());

                    const cellContent = summary ? (
                      <div className="flex flex-col items-center justify-center h-full">
                        <span className="text-xs font-bold">{day}</span>
                        <span className="text-xs">{summary.availableCount}/{totalParticipants}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full">
                        <span className="text-xs font-bold">{day}</span>
                        <span className="text-xs text-muted-foreground">N/A</span>
                      </div>
                    );

                    const tooltipContent = summary ? (
                      <div className="text-sm">
                        <p className="font-bold mb-1">{format(date, 'yyyy년 MM월 dd일 (EEE)', { locale: ko })}</p>
                        <p>참석 가능 ({summary.availableCount}명): {summary.availableFriends.length > 0 ? summary.availableFriends.join(', ') : '없음'}</p>
                        <p>참석 불가능 ({summary.unavailableFriends.length}명): {summary.unavailableFriends.length > 0 ? summary.unavailableFriends.join(', ') : '없음'}</p>
                      </div>
                    ) : (
                      <p>데이터 없음</p>
                    );

                    return (
                      <TooltipProvider key={dateString}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "h-10 w-10 rounded-md flex items-center justify-center text-center cursor-default",
                                summary ? getColorClass(summary.availableCount) : "bg-gray-100",
                                isToday && "border-2 border-blue-500",
                                date.getDay() === 0 && "text-red-700", // Sunday
                                date.getDay() === 6 && "text-blue-700" // Saturday
                              )}
                            >
                              {cellContent}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {tooltipContent}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
