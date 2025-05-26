
import { getReserveFundBalance, getLoggedReserveFundTransactions } from '@/lib/data-store';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ReserveFundClient } from '@/components/reserve-fund/ReserveFundClient';

export default async function ReserveFundPage() {
  const balance = await getReserveFundBalance();
  const transactions = await getLoggedReserveFundTransactions(); // Now gets logged transactions

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">회비 관리</h1>
        <p className="text-muted-foreground">
          모임의 공동 회비 잔액을 설정하고, 사용 내역을 확인하세요.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>현재 잔액</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold text-primary">{balance.toLocaleString()}원</p>
        </CardContent>
      </Card>
      
      {/* Pass logged transactions (usage log and balance updates) */}
      <ReserveFundClient initialTransactions={transactions} initialBalance={balance} />

    </div>
  );
}
