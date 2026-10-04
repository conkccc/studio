'use client';

import Link from 'next/link';
import type { Meeting, Friend } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, MapPin, Users, ArrowRight } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';

export function MeetingCard({ meeting, allFriends = [] }: { meeting: Meeting; allFriends?: Friend[] }) {
  const { appUser } = useAuth();
  const participants = meeting.isTemporary
    ? meeting.temporaryParticipants?.map(participant => participant.name) || []
    : meeting.participantIds.map(id => allFriends.find(friend => friend.id === id)?.name || meeting.participantNames?.[id]).filter(Boolean);
  const count = meeting.isTemporary ? meeting.temporaryParticipants?.length || 0 : meeting.participantIds.length;
  const creator = meeting.creatorName || (appUser?.id === meeting.creatorId ? appUser.name : undefined) || '모임 작성자';
  const date = new Date(meeting.dateTime);

  return <Link href={`/meetings/${meeting.id}`} className="group block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
    <Card className="flex h-full flex-col transition-shadow group-hover:shadow-md">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-2"><CardTitle className="break-words text-lg">{meeting.name}</CardTitle><Badge variant={meeting.isSettled ? 'secondary' : 'outline'} className="shrink-0">{meeting.isSettled ? '정산 확정' : '정산 미확정'}</Badge></div>
        <CardDescription>만든이: {creator}{appUser?.id === meeting.creatorId ? ' (나)' : ''}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0" /><span>{isValid(date) ? format(date, 'yyyy년 M월 d일 (EEE) HH:mm', { locale: ko }) : '날짜 정보 없음'}</span></div>
        <div className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0" /><span className="truncate">{meeting.locationName || '장소 미정'}</span></div>
        <div className="flex items-start gap-2"><Users className="h-4 w-4 shrink-0" /><span className="line-clamp-2">{count}명{participants.length ? ` · ${participants.join(', ')}` : ''}</span></div>
        <div className="mt-auto flex items-center justify-end pt-2 text-primary">정산 내역 보기<ArrowRight className="ml-2 h-4 w-4" /></div>
      </CardContent>
    </Card>
  </Link>;
}
