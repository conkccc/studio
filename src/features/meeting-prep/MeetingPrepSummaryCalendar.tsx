'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { format, getDaysInMonth, startOfMonth, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
  const [selectedDateDetails, setSelectedDateDetails] = React.useState<{
    date: Date;
    summary?: DateSummaryEntry;
  } | null>(null);

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

  const renderDateDetails = (summary?: DateSummaryEntry) => {
    if (!summary) {
      return <p>데이터 없음</p>;
    }

    return (
      <div className="space-y-2 text-sm">
        <p>
          <span className="font-medium">참석 가능 ({summary.availableCount}명): </span>
          {summary.availableFriends.length > 0 ? summary.availableFriends.join(', ') : '없음'}
        </p>
        <p>
          <span className="font-medium">참석 불가능 ({summary.unavailableFriends.length}명): </span>
          {summary.unavailableFriends.length > 0 ? summary.unavailableFriends.join(', ') : '없음'}
        </p>
      </div>
    );
  };

  return (
    <>
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
                        <div className="flex h-full flex-col items-center justify-center">
                          <span className="text-xs font-bold">{day}</span>
                          <span className="text-xs">{summary.availableCount}/{totalParticipants}</span>
                        </div>
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center">
                          <span className="text-xs font-bold">{day}</span>
                          <span className="text-xs text-muted-foreground">N/A</span>
                        </div>
                      );

                      const tooltipContent = (
                        <div className="max-w-64">
                          <p className="mb-2 font-bold">{format(date, 'yyyy년 MM월 dd일 (EEE)', { locale: ko })}</p>
                          {renderDateDetails(summary)}
                        </div>
                      );

                      return (
                        <TooltipProvider key={dateString}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label={`${format(date, 'yyyy년 MM월 dd일 (EEE)', { locale: ko })} 참석 가능 상세 보기`}
                                className={cn(
                                  "flex h-10 w-10 items-center justify-center rounded-md text-center cursor-pointer transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                  summary ? getColorClass(summary.availableCount) : "bg-gray-100",
                                  isToday && "border-2 border-blue-500",
                                  date.getDay() === 0 && "text-red-700", // Sunday
                                  date.getDay() === 6 && "text-blue-700" // Saturday
                                )}
                                onClick={() => setSelectedDateDetails({ date, summary })}
                              >
                                {cellContent}
                              </button>
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
      <Dialog open={!!selectedDateDetails} onOpenChange={(open) => !open && setSelectedDateDetails(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedDateDetails
                ? format(selectedDateDetails.date, 'yyyy년 MM월 dd일 (EEE)', { locale: ko })
                : '날짜 상세'}
            </DialogTitle>
          </DialogHeader>
          {renderDateDetails(selectedDateDetails?.summary)}
        </DialogContent>
      </Dialog>
    </>
  );
}
