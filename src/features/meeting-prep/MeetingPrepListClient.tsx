'use client';

import React from 'react';
import { useAppData } from '@/hooks/use-app-data';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export function MeetingPrepListClient() {
  const { currentUser, loading: authLoading } = useAuth();
  const preps = useAppData('preps');
  const meetingPreps = preps.data?.meetingPreps || [];
  const loading = authLoading || preps.isLoading;
  const error = preps.error?.message || (!authLoading && !currentUser ? '로그인이 필요합니다.' : undefined);

  const formatSelectedMonths = (months: string[]) => {
    if (!months || months.length === 0) return '없음';

    const groupedByYear: { [year: string]: string[] } = {};
    months.forEach(monthStr => {
      const [year, month] = monthStr.split('-');
      if (!groupedByYear[year]) {
        groupedByYear[year] = [];
      }
      groupedByYear[year].push(month);
    });

    return Object.entries(groupedByYear).map(([year, monthNumbers]) => {
      const formattedMonths = monthNumbers.map(m => `${parseInt(m, 10)}월`).join(', ');
      return `${year}년 - ${formattedMonths}`;
    }).join('; ');
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error && !preps.data) {
    return <div role="alert" className="space-y-3 py-8 text-center"><p>{error}</p><Button variant="outline" onClick={() => void preps.refetch()}>다시 시도</Button></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button asChild><Link href="/meeting-prep/new"><PlusCircle className="mr-2 h-4 w-4" />새 모임 준비</Link></Button>
      </div>

      {meetingPreps.length === 0 ? (
        <p className="text-center text-muted-foreground">생성된 모임 준비가 없습니다. 새로운 모임 준비를 시작해보세요!</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {meetingPreps.map((prep) => (
            <Link key={prep.id} href={`/meeting-prep/${prep.id}`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><Card className="h-full hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle>{prep.title}</CardTitle>
                <CardDescription>
                  {prep.memo && <span className="block truncate">{prep.memo}</span>}
                  <span className="block text-sm text-muted-foreground mt-1">
                    생성일: {format(prep.createdAt, 'yyyy년 MM월 dd일', { locale: ko })}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  참여자: {prep.participantFriends && prep.participantFriends.length > 0
                    ? `${prep.participantFriends.length}명 (${prep.participantFriends.map(f => f.name).join(', ')})`
                    : '없음'}
                </p>
                <p className="text-sm text-muted-foreground">
                  선택 월: {formatSelectedMonths(prep.selectedMonths)}
                </p>
              </CardContent>
            </Card></Link>
          ))}
        </div>
      )}
    </div>
  );
}
