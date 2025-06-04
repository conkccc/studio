'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UsersRound, CalendarCheck, PiggyBank, ArrowRight, LineChart, Briefcase, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { getReserveFundBalance } from '@/lib/data-store';
import { getMeetingsForUserAction } from '@/lib/actions';
import type { Meeting } from '@/lib/types';

const MAX_RECENT_MEETINGS_DISPLAY = 3;

export default function DashboardPage() {
  const { appUser, isAdmin, userRole, loading: authLoading } = useAuth();
  const [reserveBalance, setReserveBalance] = useState<number | null>(null);
  const [recentMeetings, setRecentMeetings] = useState<Meeting[]>([]);
  const [isLoadingDashboardData, setIsLoadingDashboardData] = useState(true);

  useEffect(() => {
    if (authLoading) {
      setIsLoadingDashboardData(true);
      return;
    }

    const fetchDashboardData = async () => {
      if (!appUser?.id) {
        setIsLoadingDashboardData(false);
        setRecentMeetings([]);
        setReserveBalance(null);
        return;
      }

      setIsLoadingDashboardData(true);
      try {
        const meetingsResult = await getMeetingsForUserAction({
          requestingUserId: appUser.id,
          page: 1,
          limitParam: MAX_RECENT_MEETINGS_DISPLAY,
        });

        if (meetingsResult.success && meetingsResult.meetings && meetingsResult.meetings.length > 0) {
          setRecentMeetings(meetingsResult.meetings);

          const latestMeetingForBalance = meetingsResult.meetings[0];
          if (latestMeetingForBalance && latestMeetingForBalance.groupId) {
            const groupReserveBalance = await getReserveFundBalance(latestMeetingForBalance.groupId);
            setReserveBalance(groupReserveBalance);
          } else {
            setReserveBalance(null);
          }
        } else {
          setRecentMeetings([]);
          setReserveBalance(null);
          if (!meetingsResult.success) {
            console.error("Failed to fetch recent meetings for dashboard:", meetingsResult.error);
          }
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
        setRecentMeetings([]);
        setReserveBalance(null);
      } finally {
        setIsLoadingDashboardData(false);
      }
    };

    fetchDashboardData();
  }, [authLoading, appUser]);

  const quickLinks = [
    { href: '/friends', label: '친구 및 그룹 관리', icon: UsersRound, description: '친구 및 그룹 목록을 보고 관리하세요.', roles: ['admin', 'user', 'viewer'] },
    { href: '/meetings', label: '모임 관리', icon: CalendarCheck, description: '모임을 만들고 지난 모임을 확인하세요.', roles: ['admin', 'user', 'viewer'] },
    { href: '/reserve-fund', label: '회비 현황', icon: PiggyBank, description: '회비 잔액과 사용 내역을 보세요.', roles: ['admin', 'user', 'viewer'] },
    { href: '/users', label: '사용자 관리', icon: Briefcase, description: '사용자 역할을 관리합니다.', roles: ['admin'] },
  ];

  if (authLoading || (!appUser && isLoadingDashboardData)) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">대시보드 로딩 중...</p>
      </div>
    );
  }

  const visibleQuickLinks = quickLinks.filter(link => {
    if (!appUser) return false;
    return link.roles.includes(appUser.role);
  });

  const renderMeetingSummary = (meeting: Meeting): string => {
    return `모임 '${meeting.name}' (${new Date(meeting.dateTime).toLocaleDateString()}) ${meeting.isSettled ? '(정산 완료)' : '(정산 필요)'}`;
  };

  return (
    <div className="container mx-auto py-8" style={{ maxWidth: '1000px' }}>
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-primary mb-3">N빵친구 {appUser?.role === 'admin' ? '(관리자 대시보드)' : appUser?.role === 'user' ? '(사용자 대시보드)' : appUser?.role === 'viewer' ? '(뷰어 대시보드)' : ''}</h1>
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
      
      {appUser && appUser.role !== 'none' && (
        <section className="mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LineChart className="w-6 h-6 text-primary" />
                최근 활동 요약
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2 text-lg">최근 모임</h3>
                {isLoadingDashboardData ? (
                  <p className="text-sm text-muted-foreground">요약 로딩 중...</p>
                ) : recentMeetings.length > 0 ? (
                  <ul className="space-y-1 list-disc list-inside">
                    {recentMeetings.map(meeting => (
                      <li key={meeting.id} className="text-sm text-muted-foreground">
                        {renderMeetingSummary(meeting)}
                        <Link href={`/meetings/${meeting.id}`} className="ml-2 text-xs text-primary hover:underline">
                          [자세히 보기]
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground flex items-center">
                    <Info className="w-4 h-4 mr-2 text-blue-500"/>
                    최근 모임 내역이 없습니다. 새 모임을 만들어보세요!
                  </p>
                )}
              </div>

              {isAdmin && reserveBalance !== null && (
                 <div>
                  <h3 className="font-semibold mb-1 text-lg">특정 그룹 회비 잔액 (예시)</h3>
                  <p className="text-2xl font-bold text-primary">
                     {isLoadingDashboardData ? "잔액 로딩 중..." : `₩${reserveBalance.toLocaleString()}`}
                  </p>
                   <Button asChild variant="secondary" size="sm" className="mt-2">
                    <Link href="/reserve-fund">전체 회비 내역 보기</Link>
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
