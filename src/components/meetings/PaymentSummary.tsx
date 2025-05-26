
'use client';

import type { Expense, Friend, Meeting } from '@/lib/types';
import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, TrendingDown, UserCircle, PiggyBank, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface PaymentSummaryProps {
  meeting: Meeting; // Added meeting prop
  expenses: Expense[];
  participants: Friend[]; // Meeting participants
  allFriends: Friend[]; // All friends to resolve names
}

interface LedgerEntry {
  friendId: string;
  amount: number; // positive if paid more (creditor), negative if owes (debtor)
}

export function PaymentSummary({ meeting, expenses, participants, allFriends }: PaymentSummaryProps) {
  
  const participantIdsInMeeting = useMemo(() => new Set(participants.map(p => p.id)), [participants]);

  const initialPaymentLedger = useMemo(() => {
    const ledger: Record<string, number> = {};
    participants.forEach(p => {
      ledger[p.id] = 0;
    });

    expenses.forEach(expense => {
      if (participantIdsInMeeting.has(expense.paidById)) {
         ledger[expense.paidById] = (ledger[expense.paidById] || 0) + expense.totalAmount;
      }

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

  const benefitingParticipantIds = useMemo(() => {
    if (!meeting.useReserveFund) {
      return new Set<string>();
    }
    return new Set(
      participants
        .map(p => p.id)
        .filter(id => !meeting.nonReserveFundParticipants.includes(id))
    );
  }, [meeting.useReserveFund, meeting.nonReserveFundParticipants, participants]);

  const fundContributionDetails = useMemo(() => {
    let amountToCoverByFund = 0;
    let description = "회비 사용 없음";

    if (meeting.useReserveFund) {
      if (meeting.reserveFundUsageType === 'partial') {
        amountToCoverByFund = meeting.partialReserveFundAmount || 0;
        description = `회비에서 ${amountToCoverByFund.toLocaleString()}원 부분 사용`;
      } else { // 'all'
        let totalOwedByBenefiting = 0;
        benefitingParticipantIds.forEach(id => {
          if (initialPaymentLedger[id] < 0) {
            totalOwedByBenefiting -= initialPaymentLedger[id]; // sum of absolute values of debts
          }
        });
        amountToCoverByFund = totalOwedByBenefiting;
        description = `회비에서 최대 ${amountToCoverByFund.toLocaleString()}원 사용 (혜택자 총 부담금 기준)`;
        if (amountToCoverByFund === 0 && totalSpent > 0) {
             description = "회비 사용 대상자의 부담금이 없어 회비가 사용되지 않았습니다.";
        } else if (totalSpent === 0) {
             description = "총 지출이 없어 회비가 사용되지 않았습니다.";
        }
      }
    }
    
    return { amount: amountToCoverByFund, description };
  }, [meeting, initialPaymentLedger, benefitingParticipantIds]);


  const finalPaymentLedger = useMemo(() => {
    const finalLedger = { ...initialPaymentLedger };
    let fundRemainingToDistribute = fundContributionDetails.amount;

    if (meeting.useReserveFund && fundRemainingToDistribute > 0) {
      // Sort benefiting participants: those who owe more get fund priority
      const sortedBenefitingDebtors = Array.from(benefitingParticipantIds)
        .filter(id => finalLedger[id] < 0)
        .sort((a, b) => finalLedger[a] - finalLedger[b]); // sort by debt amount, most negative first
      
      for (const friendId of sortedBenefitingDebtors) {
        if (fundRemainingToDistribute <= 0.01) break; // No more fund or negligible amount

        const debtAmount = Math.abs(finalLedger[friendId]);
        const amountToCover = Math.min(debtAmount, fundRemainingToDistribute);
        
        finalLedger[friendId] += amountToCover;
        fundRemainingToDistribute -= amountToCover;
      }
    }
    return finalLedger;
  }, [initialPaymentLedger, fundContributionDetails, benefitingParticipantIds, meeting.useReserveFund]);
  
  const totalSpent = useMemo(() => expenses.reduce((sum, e) => sum + e.totalAmount, 0), [expenses]);

  const simplifiedDebts = useMemo(() => {
    const balances: LedgerEntry[] = Object.entries(finalPaymentLedger)
      .map(([friendId, amount]) => ({ friendId, amount }))
      .sort((a, b) => a.amount - b.amount);

    const transactions: { from: string; to: string; amount: number }[] = [];
    let payers = balances.filter(b => b.amount > 0.01); // Creditors
    let owers = balances.filter(b => b.amount < -0.01); // Debtors

    payers.sort((a,b) => b.amount - a.amount); 
    owers.sort((a,b) => a.amount - b.amount);

    let payerIndex = 0;
    let owerIndex = 0;

    while (payerIndex < payers.length && owerIndex < owers.length) {
      const payer = payers[payerIndex];
      const ower = owers[owerIndex];
      const amountToTransfer = Math.min(payer.amount, -ower.amount);

      if (amountToTransfer > 0.01) { 
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
  }, [finalPaymentLedger]);

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
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>정산 요약</CardTitle>
        <CardDescription>
          총 지출: {totalSpent.toLocaleString()}원.
          {meeting.useReserveFund && fundContributionDetails.amount > 0 && (
            <span className="block text-sm text-primary mt-1">
              <PiggyBank className="inline-block h-4 w-4 mr-1" />
              {fundContributionDetails.description} (아래 정산에 반영됨)
            </span>
          )}
           {meeting.useReserveFund && fundContributionDetails.amount === 0 && totalSpent > 0 && (
             <span className="block text-sm text-muted-foreground mt-1">
                <Info className="inline-block h-4 w-4 mr-1" />
                {fundContributionDetails.description}
             </span>
           )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 && (
            <p className="text-muted-foreground text-center py-4">지출 내역이 없어 정산할 금액이 없습니다.</p>
        )}
        {expenses.length > 0 && (
            <div className="space-y-6">
            <div>
                <h3 className="text-md font-semibold mb-2">개인별 최종 정산 현황</h3>
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
                    {Object.entries(finalPaymentLedger).map(([friendId, amount]) => (
                        <TableRow key={friendId}>
                        <TableCell className="font-medium flex items-center">
                            <UserCircle className="h-4 w-4 mr-2 opacity-70"/>
                            {getFriendNickname(friendId)}
                            {meeting.useReserveFund && !benefitingParticipantIds.has(friendId) && (
                                <Badge variant="outline" className="ml-2 text-xs">회비 미적용</Badge>
                            )}
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${amount > 0.01 ? 'text-green-600' : amount < -0.01 ? 'text-red-600' : 'text-muted-foreground'}`}>
                            {Math.abs(amount) < 0.01 ? '-' : `${Math.abs(amount).toLocaleString(undefined, {maximumFractionDigits: 0})}원`}
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
                <p className="text-center text-muted-foreground py-3">모든 정산이 완료되었거나 추가 송금이 필요하지 않습니다.</p>
            )}
            </div>
        )}
      </CardContent>
      {expenses.length > 0 && (
        <CardFooter>
            <p className="text-xs text-muted-foreground">
                참고: 소수점 계산으로 인해 1원 미만의 오차가 발생할 수 있습니다.
                {meeting.useReserveFund && meeting.reserveFundUsageType === 'all' && (
                     " '모두 사용'의 경우, 회비는 혜택 대상자들의 총 부담금액 내에서 지원됩니다."
                )}
            </p>
        </CardFooter>
      )}
    </Card>
  );
}

    