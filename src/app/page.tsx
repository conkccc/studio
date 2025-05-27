
'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UsersRound, CalendarCheck, PiggyBank, Brain, ArrowRight, LineChart } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react'; 
import { getReserveFundBalance } from '@/lib/data-store'; 

export default function DashboardPage() {
  const { currentUser, isAdmin, loading } = useAuth();
  const [reserveBalance, setReserveBalance] = useState<number | null>(null);

  useEffect(() => {
    // Firestore를 사용하므로, 관리자일 때만 잔액을 가져오도록 수정
    if (!loading && currentUser && isAdmin) {
      const fetchBalance = async () => {
        try {
          const balance = await getReserveFundBalance();
          setReserveBalance(balance);
        } catch (error) {
          console.error("Failed to fetch reserve fund balance:", error);
          setReserveBalance(0); 
        }
      };
      fetchBalance();
    } else if (!currentUser || !isAdmin) {
      setReserveBalance(null); // 로그아웃되거나 관리자가 아니면 잔액 정보 초기화
    }
  }, [currentUser, isAdmin, loading]);


  const quickLinks = [
    { href: '/friends', label: '친구 관리', icon: UsersRound, description: '친구 목록을 보고 새 친구를 추가하세요.', adminOnly: true },
    { href: '/meetings', label: '모임 관리', icon: CalendarCheck, description: '모임을 만들고 지난 모임을 확인하세요.', adminOnly: false }, // 모임 관리는 이제 공개
    { href: '/reserve-fund', label: '회비 현황', icon: PiggyBank, description: '회비 잔액과 사용 내역을 보세요.', adminOnly: true },
    { href: '/ai-analysis', label: 'AI 비용 분석', icon: Brain, description: 'AI로 지출을 분석하고 절약법을 찾으세요.', adminOnly: false }, // AI 분석도 공개
  ];

  if (loading) {
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
        <p className="text-lg text-muted-foreground mb-6">로그인하여 친구들과의 정산을 시작하세요.</p>
        <Button asChild>
          <Link href="/login">로그인 페이지로 이동</Link>
        </Button>
      </div>
    );
  }

  if (!isAdmin) {
     return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-3xl font-bold mb-4">접근 권한 없음</h1>
        <p className="text-lg text-muted-foreground mb-6">
          이 애플리케이션의 관리자 기능은 지정된 관리자만 사용할 수 있습니다.
          <br />
          모임 목록 및 AI 비용 분석 도구는 로그인 없이도 사용 가능합니다.
        </p>
         <Button onClick={async () => {
            const { signOut } = await import('firebase/auth');
            const { auth } = await import('@/lib/firebase'); // auth 임포트 확인
            await signOut(auth);
            // AuthContext will handle redirect via onAuthStateChanged
        }}>로그아웃</Button>
      </div>
    );
  }

  // 관리자로 로그인한 경우
  return (
    <div className="container mx-auto py-8">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-primary mb-3">N빵친구 (관리자 대시보드)</h1>
        <p className="text-xl text-muted-foreground">친구들과의 정산을 스마트하게 관리하세요!</p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mb-12">
        {quickLinks.filter(link => !link.adminOnly || isAdmin).map((link) => (
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
              최근 활동 요약 (예시)
            </CardTitle>
            <CardDescription>최근 모임 및 지출에 대한 간략한 개요입니다.</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-2">지난 모임 정산 현황</h3>
              <p className="text-sm text-muted-foreground">지난 주 모임 '한강 피크닉'에서 총 50,000원 지출, 1인당 12,500원 정산 완료.</p>
               <Image 
                src="https://placehold.co/600x300.png" 
                alt="Sample Chart Placeholder" 
                width={600} 
                height={300} 
                className="mt-4 rounded-lg shadow-sm"
                data-ai-hint="bar chart finance"
              />
            </div>
            <div>
              <h3 className="font-semibold mb-2">회비 잔액</h3>
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
