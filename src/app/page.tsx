'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UsersRound, CalendarCheck, PiggyBank, ArrowRight, LineChart, Briefcase } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { getReserveFundBalance, getMeetings, getExpensesByMeetingId } from '@/lib/data-store';
import type { Meeting } from '@/lib/types';

export default function DashboardPage() {
  const { currentUser, appUser, isAdmin, userRole, loading: authLoading } = useAuth();
  const [reserveBalance, setReserveBalance] = useState<number | null>(null);
  const [recentMeetingSummary, setRecentMeetingSummary] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true); // Separate loading state for dashboard data

  useEffect(() => {
    if (authLoading) {
      setDataLoading(true); // If auth is loading, dashboard data also waits
      return;
    }
    const fetchDashboardData = async () => {
      if (currentUser && (isAdmin || userRole === 'user')) {
        setDataLoading(true);
        try {
          const balancePromise = isAdmin ? getReserveFundBalance() : Promise.resolve(0); // Only admin fetches balance
          const meetingsPromise = getMeetings({ limitParam: 1 }); // Fetch most recent meeting for all roles (user/admin)
          const [balance, recentMeetingsData] = await Promise.all([balancePromise, meetingsPromise]);
          if (isAdmin) {
            setReserveBalance(balance);
          }
          if (recentMeetingsData.meetings.length > 0) {
            const latestMeeting = recentMeetingsData.meetings[0];
            const expenses = await getExpensesByMeetingId(latestMeeting.id);
            const totalSpent = expenses.reduce((sum, exp) => sum + exp.totalAmount, 0);
            const perPersonCost = latestMeeting.participantIds.length > 0 
              ? totalSpent / latestMeeting.participantIds.length 
              : 0;
            let summary = `최근 모임 '${latestMeeting.name}'에서 ${latestMeeting.participantIds.length}명 이 총 ${totalSpent.toLocaleString()}원 지출, 1인당 ${perPersonCost.toLocaleString(undefined, {maximumFractionDigits: 0})}원`;
            if (latestMeeting.isSettled) {
              summary += " 정산 완료.";
            } else if (expenses.length > 0) {
              summary += " 정산 필요.";
            } else {
              summary += " (지출 내역 없음).";
            }
            setRecentMeetingSummary(summary);
          } else {
            setRecentMeetingSummary("최근 모임 내역이 없습니다.");
          }
        } catch (error) {
          console.error("Failed to fetch dashboard data:", error);
          if (isAdmin) setReserveBalance(0);
          setRecentMeetingSummary("요약 정보를 가져오는 데 실패했습니다.");
        } finally {
          setDataLoading(false);
        }
      } else {
        setReserveBalance(null);
        setRecentMeetingSummary(null);
        setDataLoading(false);
      }
    };
    fetchDashboardData();
  }, [authLoading, currentUser, isAdmin, userRole]);

  const quickLinks = [
    { href: '/friends', label: '친구 관리', icon: UsersRound, description: '친구 목록을 보고 새 친구를 추가하세요.', adminOnly: true },
    { href: '/meetings', label: '모임 관리', icon: CalendarCheck, description: '모임을 만들고 지난 모임을 확인하세요.', userOrAdmin: true },
    { href: '/reserve-fund', label: '회비 현황', icon: PiggyBank, description: '회비 잔액과 사용 내역을 보세요.', adminOnly: true },
    { href: '/users', label: '사용자 관리', icon: Briefcase, description: '사용자 역할을 관리합니다.', adminOnly: true },
  ];

  if (authLoading || (isAdmin || userRole === 'user') && dataLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">대시보드 로딩 중...</p>
      </div>
    );
  }

  const visibleQuickLinks = quickLinks.filter(link => {
    if (userRole === null) return false; 
    if (link.adminOnly) return isAdmin;
    if (link.userOrAdmin) return isAdmin || userRole === 'user';
    return true;
  });

  return (
    <div className="container mx-auto py-8" style={{ maxWidth: '1000px' }}>
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-primary mb-3">N빵친구 {isAdmin ? '(관리자 대시보드)' : userRole === 'user' ? '(사용자 대시보드)' : ''}</h1>
        <p className="text-xl text-muted-foreground">친구들과의 정산을 스마트하게 관리하세요!</p>
      </header>

      {visibleQuickLinks.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mb-12">
          {visibleQuickLinks.map((link) => (
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
      )}
      
      {(isAdmin || userRole === 'user') && (
        <section className="mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LineChart className="w-6 h-6 text-primary" />
                최근 활동 요약
              </CardTitle>
              <CardDescription>최근 모임 및 회비 잔액에 대한 간략한 개요입니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2 text-lg">지난 모임 정산 현황</h3>
                <p className="text-sm text-muted-foreground">
                  {dataLoading ? "요약 로딩 중..." : recentMeetingSummary || "최근 모임 내역이 없습니다."}
                </p>
              </div>
              {isAdmin && (
                <div>
                  <h3 className="font-semibold mb-2 text-lg">회비 잔액</h3>
                  {dataLoading ? (
                    <p className="text-3xl font-bold text-primary">잔액 로딩 중...</p>
                  ) : reserveBalance !== null ? (
                    <p className="text-3xl font-bold text-primary">₩{reserveBalance.toLocaleString()}</p>
                  ) : (
                    <p className="text-3xl font-bold text-primary">잔액 정보를 불러올 수 없습니다.</p>
                  )}
                  <p className="text-sm text-muted-foreground">다음 모임을 위해 충분한 잔액이 남아있습니다.</p>
                  <Button asChild variant="secondary" className="mt-4">
                    <Link href="/reserve-fund">회비 내역 보기</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <footer className="text-center text-muted-foreground text-sm mt-12">
        <p>&copy; {new Date().getFullYear()} N빵친구. 모든 권리 보유.</p>
      </footer>
    </div>
  );
}
