'use client';

import Link from 'next/link';
import { useAppData } from '@/hooks/use-app-data';
import { format, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CalendarCheck, CheckCircle2, Clock3, PlusCircle, ArrowRight, UsersRound, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { Meeting } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface DashboardData {
  pendingMeetings: Meeting[];
  upcomingMeetings: Meeting[];
  recentMeetings: Meeting[];
}
const emptyData: DashboardData = { pendingMeetings: [], upcomingMeetings: [], recentMeetings: [] };

function MeetingSection({ title, description, icon: Icon, meetings, empty, href }: {
  title: string; description: string; icon: typeof CalendarCheck; meetings: Meeting[]; empty: string; href: string;
}) {
  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Icon className="h-5 w-5 text-primary" />{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      {meetings.length ? <ul className="divide-y">{meetings.map(meeting => {
        const date = new Date(meeting.dateTime);
        return <li key={meeting.id}><Link href={`/meetings/${meeting.id}`} className="flex items-center justify-between gap-3 rounded-md py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:text-primary">
          <div className="min-w-0"><p className="truncate font-medium">{meeting.name}</p><p className="mt-1 text-xs text-muted-foreground">{isValid(date) ? format(date, 'M월 d일 (EEE) HH:mm', { locale: ko }) : '날짜 미정'}</p></div>
          <Badge variant={meeting.isSettled ? 'secondary' : 'outline'} className="shrink-0">{meeting.isSettled ? '완료' : '미정산'}</Badge>
        </Link></li>;
      })}</ul> : <p className="py-5 text-sm text-muted-foreground">{empty}</p>}
      <Button asChild variant="ghost" className="w-full"><Link href={href}>목록에서 보기<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
    </CardContent>
  </Card>;
}

export default function DashboardPage() {
  const { appUser, loading: authLoading } = useAuth();
  const dashboard = useAppData('dashboard');
  const data = dashboard.data || emptyData;
  const loading = dashboard.isLoading;
  const error = dashboard.error?.message;

  const canCreate = appUser && ['admin', 'user'].includes(appUser.role);
  return <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6 md:py-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div><p className="mb-1 text-sm text-muted-foreground">{appUser?.name ? `${appUser.name}님의 모임` : 'N빵친구'}</p><h1 className="text-3xl font-semibold tracking-tight">오늘 확인할 모임</h1><p className="mt-2 text-muted-foreground">다음 일정을 확인하고 지난 모임의 정산을 마무리하세요.</p></div>
      {canCreate && <Button asChild><Link href="/meetings/new"><PlusCircle className="mr-2 h-4 w-4" />새 모임 만들기</Link></Button>}
    </header>
    <nav aria-label="빠른 작업" className="flex flex-wrap gap-2">
      {canCreate && <Button asChild variant="outline"><Link href="/meeting-prep/new"><CalendarCheck className="mr-2 h-4 w-4" />모임 날짜 정하기</Link></Button>}
      <Button asChild variant="outline"><Link href="/friends"><UsersRound className="mr-2 h-4 w-4" />친구 및 그룹</Link></Button>
      <Button asChild variant="outline"><Link href="/meetings">모든 모임<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
    </nav>
    {loading || authLoading ? <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" />모임 요약을 불러오고 있습니다.</div>
      : error && !dashboard.data ? <Card><CardContent className="space-y-4 py-10 text-center" role="alert"><p>{error}</p><Button variant="outline" onClick={() => void dashboard.refetch()}>다시 시도</Button></CardContent></Card>
      : <div className="grid gap-4 lg:grid-cols-3">
        <MeetingSection title="정산할 모임" description="아직 정산을 확정하지 않은 지난 모임" icon={CheckCircle2} meetings={data.pendingMeetings} empty="마무리할 정산이 없습니다." href="/meetings?status=pending" />
        <MeetingSection title="다가오는 모임" description="장소와 참여자를 미리 확인하세요." icon={CalendarCheck} meetings={data.upcomingMeetings} empty="예정된 모임이 없습니다." href="/meetings" />
        <MeetingSection title="최근 모임" description="최근 모임의 지출과 정산 기록" icon={Clock3} meetings={data.recentMeetings} empty="기록된 모임이 없습니다." href="/meetings" />
      </div>}
  </div>;
}
