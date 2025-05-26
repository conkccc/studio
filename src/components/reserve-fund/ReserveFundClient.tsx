'use client';

import type { ReserveFundTransaction } from '@/lib/types';
import React, { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { addReserveTransactionAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { PlusCircle, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const transactionSchema = z.object({
  type: z.enum(['deposit', 'withdrawal'], { required_error: '거래 유형을 선택해주세요.' }),
  amount: z.preprocess(
    (val) => (typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val),
    z.number().positive('금액은 0보다 커야 합니다.')
  ),
  description: z.string().min(1, '설명을 입력해주세요.').max(100, '설명은 100자 이내여야 합니다.'),
  date: z.date({ required_error: '날짜를 선택해주세요.' }),
});

type TransactionFormData = z.infer<typeof transactionSchema>;

interface ReserveFundClientProps {
  initialTransactions: ReserveFundTransaction[];
  initialBalance: number;
}

export function ReserveFundClient({ initialTransactions, initialBalance }: ReserveFundClientProps) {
  const [transactions, setTransactions] = useState<ReserveFundTransaction[]>(initialTransactions);
  const [balance, setBalance] = useState<number>(initialBalance);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: 'deposit',
      amount: 0,
      description: '',
      date: new Date(),
    },
  });

  const onSubmit = (data: TransactionFormData) => {
    startTransition(async () => {
      // For deposit, amount is positive. For withdrawal, make it negative.
      const transactionAmount = data.type === 'deposit' ? data.amount : -data.amount;
      const result = await addReserveTransactionAction({
        type: data.type,
        amount: transactionAmount,
        description: data.description,
        date: data.date,
      });

      if (result.success && result.transaction) {
        toast({ title: '성공', description: '거래 내역이 추가되었습니다.' });
        setTransactions(prev => [result.transaction!, ...prev].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime() ));
        setBalance(prev => prev + transactionAmount);
        form.reset();
        setIsDialogOpen(false);
      } else {
        toast({
          title: '오류',
          description: result.error || '거래 내역 추가에 실패했습니다.',
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>거래 내역</CardTitle>
          <CardDescription>회비의 입출금 내역입니다.</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <PlusCircle className="mr-2 h-4 w-4" /> 새 거래 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>새 거래 추가</DialogTitle>
              <DialogDescription>회비 입금 또는 출금 내역을 기록합니다.</DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label>거래 유형 <span className="text-destructive">*</span></Label>
                <RadioGroup
                  onValueChange={(value: "deposit" | "withdrawal") => form.setValue('type', value)}
                  defaultValue={form.watch('type')}
                  className="flex space-x-4 mt-1"
                  disabled={isPending}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="deposit" id="deposit" />
                    <Label htmlFor="deposit">입금</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="withdrawal" id="withdrawal" />
                    <Label htmlFor="withdrawal">출금</Label>
                  </div>
                </RadioGroup>
              </div>
              <div>
                <Label htmlFor="amount">금액 <span className="text-destructive">*</span></Label>
                 <Input 
                    id="amount" 
                    type="text" 
                    value={formatNumber(form.watch('amount'))}
                    onChange={(e) => {
                      const rawValue = e.target.value.replace(/,/g, '');
                      form.setValue('amount', rawValue === '' ? 0 : parseFloat(rawValue), {shouldValidate: true});
                    }}
                    disabled={isPending} 
                  />
                {form.formState.errors.amount && <p className="text-sm text-destructive mt-1">{form.formState.errors.amount.message}</p>}
              </div>
              <div>
                <Label htmlFor="description">설명 <span className="text-destructive">*</span></Label>
                <Textarea id="description" {...form.register('description')} disabled={isPending} />
                {form.formState.errors.description && <p className="text-sm text-destructive mt-1">{form.formState.errors.description.message}</p>}
              </div>
              <div>
                <Label htmlFor="date">날짜 <span className="text-destructive">*</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !form.watch('date') && 'text-muted-foreground'
                      )}
                      disabled={isPending}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.watch('date') ? format(form.watch('date'), 'PPP', { locale: ko }) : <span>날짜 선택</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={form.watch('date')}
                      onSelect={(date) => date && form.setValue('date', date, { shouldValidate: true })}
                      initialFocus
                      disabled={isPending}
                    />
                  </PopoverContent>
                </Popover>
                {form.formState.errors.date && <p className="text-sm text-destructive mt-1">{form.formState.errors.date.message}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isPending}>
                  취소
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  저장
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
                  <TableHead className="text-right">금액</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{format(new Date(tx.date), 'yyyy.MM.dd', { locale: ko })}</TableCell>
                    <TableCell>{tx.description}{tx.meetingId && ` (모임: ${tx.meetingId})`}</TableCell>
                    <TableCell>
                      {tx.type === 'deposit' || (tx.type === 'meeting_contribution' && tx.amount > 0) ? (
                        <span className="inline-flex items-center text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                          <TrendingUp className="h-3 w-3 mr-1"/> 입금
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                           <TrendingDown className="h-3 w-3 mr-1"/> 출금
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.amount >= 0 ? `+${tx.amount.toLocaleString()}` : tx.amount.toLocaleString()}원
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        ) : (
          <p className="text-center text-muted-foreground py-8">
            등록된 거래 내역이 없습니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
