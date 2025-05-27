
'use client';
import Link from 'next/link';
import type { Meeting, Friend } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarDays, MapPin, Users, ArrowRight, Info } from 'lucide-react';
import { format, differenceInCalendarDays, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { useMemo } from 'react';

interface MeetingCardProps {
  meeting: Meeting;
  allFriends: Friend[];
}

export function MeetingCard({ meeting, allFriends }: MeetingCardProps) {
  const { currentUser, isAdmin } = useAuth();

  const participants = meeting.participantIds
    .map(id => allFriends.find(f => f.id === id)?.nickname)
    .filter(Boolean); 

  const creatorName = useMemo(() => {
    if (currentUser && meeting.creatorId === currentUser.uid && isAdmin) {
      return '관리자 (나)';
    }
    const creatorFriend = allFriends.find(f => f.id === meeting.creatorId);
    return creatorFriend?.nickname || '알 수 없음';
  }, [meeting.creatorId, allFriends, currentUser, isAdmin]);


  const formatDate = () => {
    const startTime = meeting.dateTime; // Already a Date object
    if (meeting.endTime && isValid(meeting.endTime)) { // Ensure endTime is valid
      const endTime = meeting.endTime; // Already a Date object
      const duration = differenceInCalendarDays(endTime, startTime);
      return `${format(startTime, 'yyyy년 M월 d일 HH:mm', { locale: ko })} (${Math.max(0, duration) + 1}일)`;
    }
    if (isValid(startTime)) {
      return format(startTime, 'yyyy년 M월 d일 HH:mm', { locale: ko });
    }
    return '날짜 정보 없음';
  };

  return (
    <Card className="flex flex-col h-full hover:shadow-lg transition-shadow duration-300">
      <CardHeader>
        <CardTitle className="text-lg">{meeting.name}</CardTitle>
        <CardDescription>
          만든이: {creatorName}
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
