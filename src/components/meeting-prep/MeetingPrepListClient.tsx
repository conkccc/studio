'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getMeetingPrepsAction } from '@/lib/actions';
import type { MeetingPrep } from '@/lib/types';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export function MeetingPrepListClient() {
  const { currentUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const [meetingPreps, setMeetingPreps] = useState<MeetingPrep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && currentUser) {
      const fetchMeetingPreps = async () => {
        setLoading(true);
        setError(null);
        try {
          const result = await getMeetingPrepsAction(currentUser.uid);
          if (result.success && result.meetingPreps) {
            setMeetingPreps(result.meetingPreps);
          } else {
            setError(result.error || '모임 준비 목록을 불러오는데 실패했습니다.');
          }
        } catch (err) {
          console.error('Failed to fetch meeting preps:', err);
          setError('모임 준비 목록을 불러오는 중 오류가 발생했습니다.');
        } finally {
          setLoading(false);
        }
      };
      fetchMeetingPreps();
    } else if (!authLoading && !currentUser) {
      setLoading(false);
      setError('로그인이 필요합니다.');
    }
  }, [authLoading, currentUser]);

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

  if (error) {
    return <div className="text-red-500">오류: {error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => router.push('/meeting-prep/new')}>
          <PlusCircle className="mr-2 h-4 w-4" /> 새 모임 준비
        </Button>
      </div>

      {meetingPreps.length === 0 ? (
        <p className="text-center text-muted-foreground">생성된 모임 준비가 없습니다. 새로운 모임 준비를 시작해보세요!</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {meetingPreps.map((prep) => (
            <Card key={prep.id} className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => router.push(`/meeting-prep/${prep.id}`)}>
              <CardHeader>
                <CardTitle>{prep.title}</CardTitle>
                <CardDescription>
                  {prep.memo && <p className="truncate">{prep.memo}</p>}
                  <p className="text-sm text-muted-foreground mt-1">
                    생성일: {format(prep.createdAt, 'yyyy년 MM월 dd일', { locale: ko })}
                  </p>
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
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}