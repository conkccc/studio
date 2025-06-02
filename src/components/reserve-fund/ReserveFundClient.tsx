'use client';

import type { ReserveFundTransaction } from '@/lib/types';
import React, { useState, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { setReserveFundBalanceAction } from '@/lib/actions'; // Updated action
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { TrendingDown, Edit, Loader2, History, PiggyBank } from 'lucide-react'; // Edit instead of PlusCircle
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from '@/contexts/AuthContext';

const balanceUpdateSchema = z.object({
  newBalance: z.preprocess(
    (val) => (typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val),
    z.number().min(0, '잔액은 0 이상이어야 합니다.')
  ),
  description: z.string().min(1, "설명을 입력해주세요.").max(100, "설명은 100자 이내여야 합니다.").optional(),
});

type BalanceUpdateFormData = z.infer<typeof balanceUpdateSchema>;

interface ReserveFundClientProps {
  initialTransactions: ReserveFundTransaction[]; // These are logged transactions
  initialBalance: number;
  groupId: string; // groupId 추가
  onChanged?: () => void; // Optional callback for parent refresh
}

export function ReserveFundClient({ initialTransactions, initialBalance, groupId, isReadOnly = false, onChanged }: ReserveFundClientProps & { isReadOnly?: boolean }) {
  const [transactions, setTransactions] = useState<ReserveFundTransaction[]>(initialTransactions);
  const [currentBalance, setCurrentBalance] = useState<number>(initialBalance); // Local state for balance
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const { appUser } = useAuth();

  const form = useForm<BalanceUpdateFormData>({
    resolver: zodResolver(balanceUpdateSchema),
    defaultValues: {
      newBalance: initialBalance, // Default to current balance
      description: '수동 잔액 조정',
    },
  });
  
  React.useEffect(() => {
    setCurrentBalance(initialBalance);
    form.setValue('newBalance', initialBalance);
  }, [initialBalance, form]);

  React.useEffect(() => {
    setTransactions(initialTransactions);
  }, [initialTransactions]);


  const handleBalanceUpdate = (data: BalanceUpdateFormData) => {
    startTransition(async () => {
      const newBalance = typeof data.newBalance === 'number' ? data.newBalance : parseFloat(String(data.newBalance));
      // appUser?.id를 currentUserId로 전달
      const result = await setReserveFundBalanceAction(groupId, newBalance, data.description || '', appUser?.id);
      if (result.success && result.newBalance !== undefined) {
        toast({ title: '성공', description: '회비 잔액이 업데이트되었습니다.' });
        setCurrentBalance(result.newBalance);
        const newLogEntry: ReserveFundTransaction = {
          id: `temp-${Date.now()}`,
          groupId,
          type: 'balance_update',
          amount: result.newBalance,
          description: data.description || `잔액 ${result.newBalance.toLocaleString()}원으로 설정됨`,
          date: new Date(),
        };
        setTransactions(prev => [newLogEntry, ...prev].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        form.reset({ newBalance: result.newBalance, description: '수동 잔액 조정' });
        setIsUpdateDialogOpen(false);
        if (onChanged) onChanged();
      } else {
        toast({
          title: '오류',
          description: result.error || '잔액 업데이트에 실패했습니다.',
          variant: 'destructive',
        });
      }
    });
  };
  
  const formatNumber = (value: number | string) => {
    if (typeof value === 'number') return value.toLocaleString();
    if (value === '' || value === null || value === undefined) return '';
    const num = parseFloat(String(value).replace(/,/g, ''));
    return isNaN(num) ? String(value) : num.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>잔액 설정</CardTitle>
            <AlertDialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={isReadOnly}>
                  <Edit className="mr-2 h-4 w-4" /> 현재 잔액 설정
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="sm:max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle>현재 회비 잔액 설정</AlertDialogTitle>
                  <AlertDialogDescription>
                    외부에서 관리되는 회비의 현재 총 잔액을 입력해주세요.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <form onSubmit={form.handleSubmit(handleBalanceUpdate)} className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="newBalance">새로운 잔액 (원) <span className="text-destructive">*</span></Label>
                    <Input 
                        id="newBalance" 
                        type="text" 
                        value={formatNumber(form.watch('newBalance'))}
                        onChange={(e) => {
                          const rawValue = e.target.value.replace(/,/g, '');
                          form.setValue('newBalance', rawValue === '' ? 0 : parseFloat(rawValue), {shouldValidate: true});
                        }}
                        disabled={isPending || isReadOnly} 
                      />
                    {form.formState.errors.newBalance && <p className="text-sm text-destructive mt-1">{form.formState.errors.newBalance.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="description">설명 (선택)</Label>
                    <Input 
                        id="description" 
                        {...form.register('description')}
                        placeholder="예: 2024년 7월 정산 후 잔액"
                        disabled={isPending || isReadOnly} 
                      />
                     {form.formState.errors.description && <p className="text-sm text-destructive mt-1">{form.formState.errors.description.message}</p>}
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setIsUpdateDialogOpen(false)} disabled={isPending}>취소</AlertDialogCancel>
                    <AlertDialogAction type="submit" disabled={isPending || isReadOnly}>
                      {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      잔액 저장
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </form>
              </AlertDialogContent>
            </AlertDialog>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            현재 설정된 회비 잔액은 <strong className="text-primary">{currentBalance.toLocaleString()}원</strong> 입니다.
            모임에서 회비를 사용하면 이 잔액에서 자동으로 차감됩니다.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary"/>회비 변경 내역</CardTitle>
          <CardDescription>모임에서의 회비 사용 또는 수동 잔액 설정 내역입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>설명</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead className="text-right">금액 (원)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell>{format(new Date(tx.date), 'yyyy.MM.dd HH:mm', { locale: ko })}</TableCell>
                      <TableCell>{tx.description}</TableCell>
                      <TableCell>
                        {tx.type === 'meeting_deduction' ? (
                          <span className="inline-flex items-center text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                            <TrendingDown className="h-3 w-3 mr-1"/> 모임 차감
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                            <PiggyBank className="h-3 w-3 mr-1"/> 잔액 설정
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${tx.type === 'meeting_deduction' ? 'text-red-600' : 'text-foreground'}`}>
                        {/* For balance_update, amount is the new balance. For deduction, it's the change. */}
                        {tx.type === 'balance_update' ? tx.amount.toLocaleString() : tx.amount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              기록된 회비 변경 내역이 없습니다.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
