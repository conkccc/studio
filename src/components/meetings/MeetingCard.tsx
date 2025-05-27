
'use client';
import Link from 'next/link';
import type { Meeting, Friend } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarDays, MapPin, Users, ArrowRight } from 'lucide-react';
import { format, differenceInCalendarDays, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';

interface MeetingCardProps {
  meeting: Meeting;
  allFriends: Friend[];
}

export function MeetingCard({ meeting, allFriends }: MeetingCardProps) {
  const participants = meeting.participantIds
    .map(id => allFriends.find(f => f.id === id)?.nickname)
    .filter(Boolean); // Filter out undefined if a friend was deleted

  const creator = allFriends.find(f => f.id === meeting.creatorId)?.nickname || '알 수 없음';

  const formatDate = () => {
    // Assuming meeting.dateTime is already a Date object from data-store
    const startTime = meeting.dateTime;

    // Check if meeting.endTime is a valid Date object
    if (meeting.endTime && meeting.endTime instanceof Date && isValid(meeting.endTime)) {
      const endTime = meeting.endTime;
      // Ensure startTime is also valid before calculating duration
      if (startTime instanceof Date && isValid(startTime)) {
        const duration = differenceInCalendarDays(endTime, startTime);
        // Ensure duration is not negative if endTime is somehow before startTime, though schema should prevent this.
        // If duration is 0, it's a 1-day event. If 1, it's a 2-day event.
        return `${format(startTime, 'yyyy년 M월 d일 HH:mm', { locale: ko })} (${Math.max(0, duration) + 1}일)`;
      }
    }
    // Fallback for invalid startTime or if endTime is not present/valid
    if (startTime instanceof Date && isValid(startTime)) {
      return format(startTime, 'yyyy년 M월 d일 HH:mm', { locale: ko });
    }
    return '날짜 정보 없음';
  };

  return (
    <Card className="flex flex-col h-full hover:shadow-lg transition-shadow duration-300">
      <CardHeader>
        <CardTitle className="text-lg">{meeting.name}</CardTitle>
        <CardDescription>
          만든이: {creator}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow space-y-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          <span>
            {formatDate()}
          </span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <MapPin className="h-4 w-4" />
          <span>{meeting.locationName}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>참여자: {participants.join(', ')} ({participants.length}명)</span>
        </div>
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" className="w-full">
          <Link href={`/meetings/${meeting.id}`}>
            상세보기 <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
