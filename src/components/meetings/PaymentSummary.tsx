'use client';

import type { Expense, Friend } from '@/lib/types';
import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, TrendingDown, UserCircle } from 'lucide-react';

interface PaymentSummaryProps {
  expenses: Expense[];
  participants: Friend[]; // Meeting participants
  allFriends: Friend[]; // All friends to resolve names
}

interface LedgerEntry {
  friendId: string;
  amount: number; // positive if paid more, negative if owes
}

export function PaymentSummary({ expenses, participants, allFriends }: PaymentSummaryProps) {
  
  const participantIdsInMeeting = useMemo(() => new Set(participants.map(p => p.id)), [participants]);

  const paymentLedger = useMemo(() => {
    const ledger: Record<string, number> = {};

    participants.forEach(p => {
      ledger[p.id] = 0;
    });

    expenses.forEach(expense => {
      // Subtract amount if this participant paid
      if (participantIdsInMeeting.has(expense.paidById)) {
         ledger[expense.paidById] = (ledger[expense.paidById] || 0) + expense.totalAmount;
      }

      // Add share to each participant involved in the split
      if (expense.splitType === 'equally' && expense.splitAmongIds && expense.splitAmongIds.length > 0) {
        const share = expense.totalAmount / expense.splitAmongIds.length;
        expense.splitAmongIds.forEach(friendId => {
          if (participantIdsInMeeting.has(friendId)) {
            ledger[friendId] = (ledger[friendId] || 0) - share;
          }
        });
      } else if (expense.splitType === 'custom' && expense.customSplits) {
        expense.customSplits.forEach(split => {
          if (participantIdsInMeeting.has(split.friendId)) {
            ledger[split.friendId] = (ledger[split.friendId] || 0) - split.amount;
          }
        });
      }
    });
    return ledger;
  }, [expenses, participants, participantIdsInMeeting]);
  
  const totalSpent = useMemo(() => expenses.reduce((sum, e) => sum + e.totalAmount, 0), [expenses]);

  const simplifiedDebts = useMemo(() => {
    const balances: LedgerEntry[] = Object.entries(paymentLedger)
      .map(([friendId, amount]) => ({ friendId, amount }))
      .sort((a, b) => a.amount - b.amount); // Sort by amount, smallest (owes most) to largest (paid most)

    const transactions: { from: string; to: string; amount: number }[] = [];
    let payers = balances.filter(b => b.amount > 0.01); // Slight tolerance for floating point
    let owers = balances.filter(b => b.amount < -0.01);

    payers.sort((a,b) => b.amount - a.amount); // Payers with largest positive balance first
    owers.sort((a,b) => a.amount - b.amount); // Owers with largest negative balance (owes most) first


    let payerIndex = 0;
    let owerIndex = 0;

    while (payerIndex < payers.length && owerIndex < owers.length) {
      const payer = payers[payerIndex];
      const ower = owers[owerIndex];
      const amountToTransfer = Math.min(payer.amount, -ower.amount);

      if (amountToTransfer > 0.01) { // Only record significant transactions
          transactions.push({
            from: ower.friendId,
            to: payer.friendId,
            amount: amountToTransfer,
          });

          payer.amount -= amountToTransfer;
          ower.amount += amountToTransfer;
      }
      
      if (Math.abs(payer.amount) < 0.01) payerIndex++;
      if (Math.abs(ower.amount) < 0.01) owerIndex++;
    }

    return transactions;
  }, [paymentLedger]);


  const getFriendNickname = (friendId: string) => {
    return allFriends.find(f => f.id === friendId)?.nickname || '알 수 없음';
  };

  if (participants.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>정산 요약</CardTitle>
          <CardDescription>모임의 최종 정산 내역입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">참여자가 없어 정산 내역을 표시할 수 없습니다.</p>
        </CardContent>
      </Card>
    );
  }
  
  if (expenses.length === 0) {
     return (
      <Card>
        <CardHeader>
          <CardTitle>정산 요약</CardTitle>
          <CardDescription>모임의 최종 정산 내역입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">지출 내역이 없어 정산할 금액이 없습니다.</p>
        </CardContent>
      </Card>
    );
  }


  return (
    <Card>
      <CardHeader>
        <CardTitle>정산 요약</CardTitle>
        <CardDescription>
          모임의 최종 정산 내역입니다. 총 지출: {totalSpent.toLocaleString()}원
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div>
            <h3 className="text-md font-semibold mb-2">개인별 정산 현황</h3>
             <ScrollArea className="h-[200px] pr-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>참여자</TableHead>
                    <TableHead className="text-right">정산 금액</TableHead>
                    <TableHead className="text-right">상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(paymentLedger).map(([friendId, amount]) => (
                    <TableRow key={friendId}>
                      <TableCell className="font-medium flex items-center">
                        <UserCircle className="h-4 w-4 mr-2 opacity-70"/>
                        {getFriendNickname(friendId)}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${amount > 0 ? 'text-green-600' : amount < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                        {amount !== 0 ? `${Math.abs(amount).toLocaleString(undefined, {maximumFractionDigits: 0})}원` : '-'}
                      </TableCell>
                       <TableCell className="text-right">
                        {amount > 0.01 ? (
                          <span className="inline-flex items-center text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                            <TrendingUp className="h-3 w-3 mr-1"/> 받을 돈
                          </span>
                        ) : amount < -0.01 ? (
                           <span className="inline-flex items-center text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                            <TrendingDown className="h-3 w-3 mr-1"/> 내야할 돈
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">정산 완료</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>

          {simplifiedDebts.length > 0 && (
            <div>
              <h3 className="text-md font-semibold mb-2">최종 송금 제안</h3>
               <ScrollArea className="h-[150px] pr-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>보내는 사람</TableHead>
                      <TableHead>받는 사람</TableHead>
                      <TableHead className="text-right">금액</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {simplifiedDebts.map((debt, index) => (
                      <TableRow key={index}>
                        <TableCell>{getFriendNickname(debt.from)}</TableCell>
                        <TableCell>{getFriendNickname(debt.to)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {debt.amount.toLocaleString(undefined, {maximumFractionDigits: 0})}원
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}
           {simplifiedDebts.length === 0 && expenses.length > 0 && (
             <p className="text-center text-muted-foreground">모든 정산이 완료되었거나 추가 송금이 필요하지 않습니다.</p>
           )}
        </div>
      </CardContent>
    </Card>
  );
}
