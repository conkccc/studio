
'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UsersRound, CalendarCheck, PiggyBank, ArrowRight, LineChart } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { getReserveFundBalance, getMeetings, getExpensesByMeetingId } from '@/lib/data-store'; // Now async
import type { Meeting, Expense } from '@/lib/types';

export default function DashboardPage() {
  const { currentUser, isAdmin, loading } = useAuth();
  const [reserveBalance, setReserveBalance] = useState<number | null>(null);
  const [recentMeetingSummary, setRecentMeetingSummary] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient && !loading && currentUser && isAdmin) {
      const fetchDashboardData = async () => {
        try {
          // Fetch reserve balance
          const balance = await getReserveFundBalance();
          setReserveBalance(balance);

          // Fetch recent meeting summary
          const recentMeetings = await getMeetings({ limit: 5 }); // Fetch only the 5 most recent meetings
          if (recentMeetings.length > 0) {
            const latestMeeting = recentMeetings[0];
            const expenses = await getExpensesByMeetingId(latestMeeting.id); // Still need expenses for the latest meeting
            const totalSpent = expenses.reduce((sum, exp) => sum + exp.totalAmount, 0);
            const perPersonCost = latestMeeting.participantIds.length > 0 ? totalSpent / latestMeeting.participantIds.length : 0;
            
            let summary = `최근 모임'${latestMeeting.name}'에서 ${latestMeeting.participantIds.length}명이 총 ${totalSpent.toLocaleString()}원 지출, 1인당 ${perPersonCost.toLocaleString(undefined, {maximumFractionDigits: 0})}원`;
            if (latestMeeting.isSettled) {
              summary += " 정산 완료.";
            } else if (expenses.length > 0) {
              summary += " 정산 필요.";
            } else {
              summary += " (지출 내역 없음).";
            }
            setRecentMeetingSummary(summary);
          } else {
            setRecentMeetingSummary("등록된 모임 내역이 없습니다.");
          }
        } catch (error) {
          console.error("Failed to fetch dashboard data:", error);
          setReserveBalance(0);
          setRecentMeetingSummary("요약 정보를 가져오는 데 실패했습니다.");
        }
      };
      fetchDashboardData();
    } else if (isClient && (!currentUser || !isAdmin)) {
      setReserveBalance(null);
      setRecentMeetingSummary(null);
    }
  }, [currentUser, isAdmin, loading, isClient]);


  const quickLinks = [
    { href: '/friends', label: '친구 관리', icon: UsersRound, description: '친구 목록을 보고 새 친구를 추가하세요.', adminOnly: true },
    { href: '/meetings', label: '모임 관리', icon: CalendarCheck, description: '모임을 만들고 지난 모임을 확인하세요.', adminOnly: false },
    { href: '/reserve-fund', label: '회비 현황', icon: PiggyBank, description: '회비 잔액과 사용 내역을 보세요.', adminOnly: true },
  ];

  if (loading || !isClient) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">대시보드 로딩 중...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-3xl font-bold mb-4">N빵친구에 오신 것을 환영합니다!</h1>
        <p className="text-lg text-muted-foreground mb-6">모임 정산을 관리하려면 로그인해주세요(관리자만 가능).</p>
        <Button asChild>
          <Link href="/login">로그인 페이지로 이동</Link>
        </Button>
      </div>
    );
  }

  if (!isAdmin) {
     return (
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-4 text-center">환영합니다, {currentUser.displayName || currentUser.email}!</h1>
        <p className="text-lg text-muted-foreground mb-6 text-center">
          모임 목록을 확인하거나 지난 모임의 정산 내역을 볼 수 있습니다.
        </p>
         <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {quickLinks.filter(link => !link.adminOnly).map((link) => (
            <Card key={link.href} className="hover:shadow-lg transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <link.icon className="w-6 h-6 text-primary" />
                  {link.label}
                </CardTitle>
                <CardDescription>{link.description}</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button asChild variant="outline" className="w-full">
                  <Link href={link.href}>
                    바로가기 <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </section>
        <div className="text-center mt-8">
            <p className="text-muted-foreground">친구 관리, 회비 관리 등의 관리자 기능은 지정된 관리자만 사용할 수 있습니다.</p>
        </div>
      </div>
    );
  }

  // Admin view
  return (
    <div className="container mx-auto py-8">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-primary mb-3">N빵친구 (관리자 대시보드)</h1>
        <p className="text-xl text-muted-foreground">친구들과의 정산을 스마트하게 관리하세요!</p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mb-12">
        {quickLinks.map((link) => ( // Admin sees all links
          <Card key={link.href} className="hover:shadow-lg transition-shadow duration-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <link.icon className="w-6 h-6 text-primary" />
                {link.label}
              </CardTitle>
              <CardDescription>{link.description}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild variant="outline" className="w-full">
                <Link href={link.href}>
                  바로가기 <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </section>
      
      <section className="mb-12">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChart className="w-6 h-6 text-primary" />
              최근 활동 요약
            </CardTitle>
            <CardDescription>최근 모임 및 회비 잔액에 대한 간략한 개요입니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4"> {/* Changed from grid to space-y for vertical stacking */}
            <div>
              <h3 className="font-semibold mb-2 text-lg">지난 모임 정산 현황</h3>
              <p className="text-sm text-muted-foreground">
                {recentMeetingSummary === null ? "요약 로딩 중..." : recentMeetingSummary}
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2 text-lg">회비 잔액</h3>
              {reserveBalance !== null ? (
                <p className="text-3xl font-bold text-primary">₩{reserveBalance.toLocaleString()}</p>
              ) : (
                <p className="text-3xl font-bold text-primary">잔액 로딩 중...</p>
              )}
              <p className="text-sm text-muted-foreground">다음 모임을 위해 충분한 잔액이 남아있습니다.</p>
              {isAdmin && (
                <Button asChild variant="secondary" className="mt-4">
                  <Link href="/reserve-fund">회비 내역 보기</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <footer className="text-center text-muted-foreground text-sm mt-12">
        <p>&copy; {new Date().getFullYear()} N빵친구. 모든 권리 보유.</p>
      </footer>
    </div>
  );
}
