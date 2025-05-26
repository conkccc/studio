import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UsersRound, CalendarCheck, PiggyBank, Brain, ArrowRight, LineChart } from 'lucide-react';
import Image from 'next/image';

export default function DashboardPage() {
  const quickLinks = [
    { href: '/friends', label: '친구 관리', icon: UsersRound, description: '친구 목록을 보고 새 친구를 추가하세요.' },
    { href: '/meetings', label: '모임 관리', icon: CalendarCheck, description: '모임을 만들고 지난 모임을 확인하세요.' },
    { href: '/reserve-fund', label: '회비 현황', icon: PiggyBank, description: '회비 잔액과 사용 내역을 보세요.' },
    { href: '/ai-analysis', label: 'AI 비용 분석', icon: Brain, description: 'AI로 지출을 분석하고 절약법을 찾으세요.' },
  ];

  return (
    <div className="container mx-auto py-8">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-primary mb-3">N빵친구</h1>
        <p className="text-xl text-muted-foreground">친구들과의 정산을 스마트하게!</p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mb-12">
        {quickLinks.map((link) => (
          <Card key={link.href} className="hover:shadow-lg transition-shadow duration-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <link.icon className="w-6 h-6 text-primary" />
                {link.label}
              </CardTitle>
              <CardDescription>{link.description}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Link href={link.href} passHref legacyBehavior>
                <Button variant="outline" className="w-full">
                  바로가기 <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
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
              {/* Placeholder for a small chart or more details */}
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
              <p className="text-3xl font-bold text-primary">₩80,000</p>
              <p className="text-sm text-muted-foreground">다음 모임을 위해 충분한 잔액이 남아있습니다.</p>
              <Link href="/reserve-fund" passHref legacyBehavior>
                <Button variant="secondary" className="mt-4">회비 내역 보기</Button>
              </Link>
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
