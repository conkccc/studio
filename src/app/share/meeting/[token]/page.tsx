"use client";
import { useEffect, useState } from 'react';
import { getMeetingByShareToken, getExpensesByMeetingId, getFriends } from '@/lib/data-store';
import { getAllUsersAction } from '@/lib/actions';
import { MeetingDetailsClient } from '@/components/meetings/MeetingDetailsClient';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Meeting, Expense, Friend, User } from '@/lib/types';
import { use } from 'react';

interface SharedMeetingPageProps {
  params: Promise<{ token: string }>;
}

export default function SharedMeetingPage(props: SharedMeetingPageProps) {
  const params = use(props.params);
  const token = params.token;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allFriends, setAllFriends] = useState<Friend[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setMeeting(null);
      return;
    }
    const fetchData = async () => {
      setLoading(true);
      const m = await getMeetingByShareToken(token);
      if (!m) {
        setMeeting(null);
        setLoading(false);
        return;
      }
      setMeeting(m);
      const [e, f, usersResult] = await Promise.all([
        getExpensesByMeetingId(m.id),
        getFriends(),
        getAllUsersAction()
      ]);
      setExpenses(e);
      setAllFriends(f);
      setAllUsers(usersResult.success ? usersResult.users : []);
      setLoading(false);
    };
    fetchData();
  }, [token]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">공유 모임 정보 로딩 중...</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="container mx-auto py-8 text-center">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              잘못된 접근
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">공유 토큰이 제공되지 않았습니다.</p>
            <Button asChild className="mt-6">
              <Link href="/"><ArrowLeft className="mr-2 h-4 w-4"/> 홈으로 돌아가기</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="container mx-auto py-8 text-center">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              링크 오류 또는 만료
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">요청하신 모임 공유 링크가 유효하지 않거나 만료되었습니다.</p>
             <Button asChild className="mt-6">
              <Link href="/"><ArrowLeft className="mr-2 h-4 w-4"/> 홈으로 돌아가기</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <MeetingDetailsClient
        initialMeeting={meeting}
        initialExpenses={expenses}
        allFriends={allFriends}
        allUsers={allUsers}
        isReadOnlyShare={true}
      />
    </div>
  );
}
