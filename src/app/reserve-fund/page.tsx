import { getReserveFundBalance, getReserveFundTransactions } from '@/lib/data-store';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ReserveFundClient } from '@/components/reserve-fund/ReserveFundClient';

export default async function ReserveFundPage() {
  const balance = await getReserveFundBalance();
  const transactions = await getReserveFundTransactions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">회비 관리</h1>
        <p className="text-muted-foreground">
          모임의 공동 회비 잔액과 거래 내역을 확인하세요.
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
      
      <ReserveFundClient initialTransactions={transactions} initialBalance={balance} />

    </div>
  );
}
