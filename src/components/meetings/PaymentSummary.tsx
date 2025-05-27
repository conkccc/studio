
'use client';

import type { Expense, Friend, Meeting } from '@/lib/types';
import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, TrendingDown, UserCircle, PiggyBank, Info, Users, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface PaymentSummaryProps {
  meeting: Meeting;
  expenses: Expense[];
  participants: Friend[];
  allFriends: Friend[];
}

interface LedgerEntry {
  friendId: string;
  amount: number; // Positive if owed by group, negative if owes to group
}

interface FundPayoutToPayer {
  to: string; // friendId of the payer receiving from fund
  amount: number;
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
        const validSplitAmongIds = expense.splitAmongIds.filter(id => participantIdsInMeeting.has(id));
        if (validSplitAmongIds.length > 0) {
          const share = expense.totalAmount / validSplitAmongIds.length;
          validSplitAmongIds.forEach(friendId => {
            ledger[friendId] = (ledger[friendId] || 0) - share;
          });
        }
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
  
  const totalSpent = useMemo(() => expenses.reduce((sum, e) => sum + e.totalAmount, 0), [expenses]);
  const perPersonCost = useMemo(() => participants.length > 0 ? totalSpent / participants.length : 0, [totalSpent, participants.length]);

  const fundApplicationDetails = useMemo(() => {
    let ledgerAfterBeneficiarySupport = { ...initialPaymentLedger };
    let actualFundContribution = 0;
    let description = "회비 사용 없음";

    if (meeting.useReserveFund) {
      if (meeting.reserveFundUsageType === 'all') {
        benefitingParticipantIds.forEach(id => {
          if (ledgerAfterBeneficiarySupport[id] < -0.01) { // If they owe money
            const debtCovered = Math.abs(ledgerAfterBeneficiarySupport[id]);
            actualFundContribution += debtCovered;
            ledgerAfterBeneficiarySupport[id] = 0; // Fund covers their debt
          }
        });
        if (actualFundContribution > 0) {
          description = `회비에서 총 ${actualFundContribution.toLocaleString(undefined, {maximumFractionDigits: 0})}원 사용 (혜택자 부담금 전액 지원)`;
        } else if (totalSpent > 0) {
          description = "회비 사용 대상자의 부담금이 없어 회비가 사용되지 않았습니다.";
        } else {
          description = "총 지출이 없어 회비가 사용되지 않았습니다.";
        }
      } else if (meeting.reserveFundUsageType === 'partial') {
        const fundAvailable = meeting.partialReserveFundAmount || 0;
        let distributedFund = 0;
        
        const benefitingDebtors = Array.from(benefitingParticipantIds).filter(id => ledgerAfterBeneficiarySupport[id] < -0.01);
        const totalBeneficiaryDebt = benefitingDebtors.reduce((sum, id) => sum + Math.abs(ledgerAfterBeneficiarySupport[id]), 0);

        if (fundAvailable > 0 && totalBeneficiaryDebt > 0) {
          benefitingDebtors.forEach(id => {
            const originalDebt = Math.abs(ledgerAfterBeneficiarySupport[id]);
            // Distribute proportionally, but not more than their debt
            const fundShareForDebtor = Math.min(originalDebt, (originalDebt / totalBeneficiaryDebt) * fundAvailable);
            ledgerAfterBeneficiarySupport[id] += fundShareForDebtor;
            distributedFund += fundShareForDebtor;
          });
        }
        actualFundContribution = distributedFund;
        if (actualFundContribution > 0) {
          description = `회비에서 ${actualFundContribution.toLocaleString(undefined, {maximumFractionDigits: 0})}원 부분 사용`;
        } else {
          description = "회비 부분 사용 설정되었으나, 사용할 금액이 없거나 대상자가 없습니다.";
        }
      }
    }
    return { ledger: ledgerAfterBeneficiarySupport, fundAmountUsed: actualFundContribution, description };
  }, [initialPaymentLedger, meeting, benefitingParticipantIds, totalSpent]);

  const { ledger: ledgerAfterBeneficiarySupport, fundAmountUsed: actualFundContribution, description: fundDescription } = fundApplicationDetails;

  const settlementAfterFundReimbursesPayers = useMemo(() => {
    const payoutsToPayersList: FundPayoutToPayer[] = [];
    let finalLedger = { ...ledgerAfterBeneficiarySupport };
    let fundToDistributeToPayers = actualFundContribution;

    if (fundToDistributeToPayers > 0.01) {
      const sortedPayers = Object.entries(finalLedger)
        .filter(([_, amount]) => amount > 0.01) // Those who are owed money by the group
        .sort(([, aAmount], [, bAmount]) => bAmount - aAmount) // Largest creditors first
        .map(([id]) => id);

      for (const payerId of sortedPayers) {
        if (fundToDistributeToPayers <= 0.01) break;
        const amountOwedToPayerByGroup = finalLedger[payerId];
        const reimbursementAmount = Math.min(amountOwedToPayerByGroup, fundToDistributeToPayers);

        if (reimbursementAmount > 0.01) {
          payoutsToPayersList.push({ to: payerId, amount: reimbursementAmount });
          finalLedger[payerId] -= reimbursementAmount; // Payer receives from fund, so their credit from group decreases
          fundToDistributeToPayers -= reimbursementAmount;
        }
      }
    }
    return { payoutsList: payoutsToPayersList, finalLedger: finalLedger };
  }, [ledgerAfterBeneficiarySupport, actualFundContribution]);
  
  const { payoutsList: fundPayoutsToPayersList, finalLedger } = settlementAfterFundReimbursesPayers;

  const simplifiedDebts = useMemo(() => {
    const balances: LedgerEntry[] = Object.entries(finalLedger)
      .map(([friendId, amount]) => ({ friendId, amount: parseFloat(amount.toFixed(2)) })) // Ensure amounts are numbers
      .sort((a, b) => a.amount - b.amount);

    const transactions: { from: string; to: string; amount: number }[] = [];
    let payersIdx = balances.length -1; 
    let owersIdx = 0; 

    while (owersIdx < payersIdx) {
        const payer = balances[payersIdx];
        const ower = balances[owersIdx];
        
        if (payer.amount < 0.01) { payersIdx--; continue; }
        if (ower.amount > -0.01) { owersIdx++; continue; }

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
        
        if (Math.abs(payer.amount) < 0.01) payersIdx--;
        if (Math.abs(ower.amount) < 0.01) owersIdx++;
    }
    return transactions;
  }, [finalLedger]);

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
        <CardDescription className="space-y-1">
            <div>
                총 지출: {totalSpent.toLocaleString(undefined, {maximumFractionDigits: 0})}원 
                {participants.length > 0 && ` (1인당 ${perPersonCost.toLocaleString(undefined, {maximumFractionDigits: 0})}원)`}
            </div>
            <span className={`block text-sm ${actualFundContribution > 0.01 ? 'text-primary' : 'text-muted-foreground'}`}>
                <PiggyBank className="inline-block h-4 w-4 mr-1" />
                {fundDescription}
            </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 && (
            <p className="text-muted-foreground text-center py-4">지출 내역이 없어 정산할 금액이 없습니다.</p>
        )}
        {expenses.length > 0 && (
            <div className="space-y-6">
            
            {actualFundContribution > 0.01 && fundPayoutsToPayersList.length > 0 && (
              <div>
                <h3 className="text-md font-semibold mb-2 flex items-center gap-1.5">
                  <PiggyBank className="h-4 w-4 text-primary" />
                  회비 지원 상세 (결제자에게)
                </h3>
                <CardDescription>회비에서 각 결제자에게 지원된 금액입니다.</CardDescription>
                <ScrollArea className="h-auto max-h-[150px] pr-3 mt-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>회비 계정</TableHead>
                        <TableHead>받는 사람 (결제자)</TableHead>
                        <TableHead className="text-right">지원 금액</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fundPayoutsToPayersList.map((payout, index) => (
                        <TableRow key={`fund-payout-${index}`}>
                          <TableCell className="text-muted-foreground">N빵친구 회비</TableCell>
                          <TableCell>{getFriendNickname(payout.to)}</TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            {payout.amount.toLocaleString(undefined, {maximumFractionDigits: 0})}원
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}

            <div>
                <h3 className="text-md font-semibold mb-2 flex items-center gap-1.5">
                    <Users className="h-4 w-4"/>
                    개인별 최종 정산 현황
                </h3>
                <CardDescription>회비 지원이 모두 반영된 후의 개인별 최종 정산액입니다.</CardDescription>
                <ScrollArea className="h-auto max-h-[200px] pr-3 mt-2">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>참여자</TableHead>
                        <TableHead className="text-right">정산 금액</TableHead>
                        <TableHead className="text-right">상태</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {Object.entries(finalLedger).map(([friendId, amount]) => (
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
                <h3 className="text-md font-semibold mb-2 flex items-center gap-1.5">
                    <FileText className="h-4 w-4" />
                    최종 송금 제안
                </h3>
                 <CardDescription>개인 간 필요한 최종 송금 내역입니다.</CardDescription>
                <ScrollArea className="h-auto max-h-[150px] pr-3 mt-2">
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
                        <TableRow key={`simplified-${index}`}>
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
                참고: 소수점 계산으로 인해 10원 미만의 오차가 발생할 수 있습니다.
                {meeting.useReserveFund && meeting.reserveFundUsageType === 'all' && (
                     " '모두 사용'의 경우, 회비는 혜택 대상자들의 총 부담금액 내에서 지원됩니다."
                )}
                 {meeting.useReserveFund && meeting.reserveFundUsageType === 'partial' && (
                     " '부분 사용'의 경우, 설정된 금액이 혜택 대상자들의 부담금을 줄이는 데 사용됩니다."
                )}
            </p>
        </CardFooter>
      )}
    </Card>
  );
}

