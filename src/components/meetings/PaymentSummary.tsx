'use client';

import type { Expense, Friend, Meeting } from '@/lib/types';
import React, { useMemo } from 'react';
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
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

  const calculationResults = useMemo(() => {
    const totalExpenses = expenses.reduce((sum, e) => sum + e.totalAmount, 0);
    const numParticipants = participants.length;

    if (numParticipants === 0) {
      return {
        totalExpenses,
        meetingDues: 0,
        expensesCoveredByDues: 0,
        remainingDues: 0,
        netExpensesToSplit: totalExpenses,
        costPerPerson: 0,
        amountPaidByEach: new Map<string, number>(),
        duesContributedByEach: new Map<string, number>(), // How much each person 'paid' in dues
        finalCostSharePerPerson: new Map<string, number>(), // Actual share of expenses after dues
        netAmountForPerson: new Map<string, number>(),
        settlementSuggestions: [],
        feeDescription: "참여자가 없습니다.",
        isReserveFundUsedForDisplay: false,
        nonReserveFundParticipantsForDisplay: [],
      };
    }

    let meetingDues = 0; // Total dues collected for the meeting
    const duesContributedByEach = new Map<string, number>(); // How much each person 'paid' in dues
    let feeDescription = "";
    let isReserveFundUsedForDisplay = false;
    let nonReserveFundParticipantsForDisplay: string[] = [];


    if (meeting.isTemporary) {
      if (typeof meeting.totalFee === 'number' && meeting.totalFee >= 0) {
        meetingDues = meeting.totalFee;
        feeDescription = `임시 모임 총 회비: ${meetingDues.toLocaleString()}원`;
        participants.forEach(p => duesContributedByEach.set(p.id, meetingDues / numParticipants));
      } else if (typeof meeting.feePerPerson === 'number' && meeting.feePerPerson >= 0) {
        meetingDues = meeting.feePerPerson * numParticipants;
        feeDescription = `임시 모임 1인당 회비: ${meeting.feePerPerson.toLocaleString()}원 (총 ${meetingDues.toLocaleString()}원)`;
        participants.forEach(p => duesContributedByEach.set(p.id, meeting.feePerPerson!));
      } else {
        feeDescription = '임시 모임 회비 없음';
        participants.forEach(p => duesContributedByEach.set(p.id, 0));
      }
    } else { // Regular meeting
      isReserveFundUsedForDisplay = meeting.useReserveFund;
      nonReserveFundParticipantsForDisplay = meeting.nonReserveFundParticipants || [];
      if (meeting.useReserveFund && typeof meeting.partialReserveFundAmount === 'number' && meeting.partialReserveFundAmount > 0) {
        meetingDues = meeting.partialReserveFundAmount;
        const applicableParticipants = participants.filter(p => !nonReserveFundParticipantsForDisplay.includes(p.id));
        const numApplicable = applicableParticipants.length;
        if (numApplicable > 0) {
          const duePerApplicablePerson = meetingDues / numApplicable;
          applicableParticipants.forEach(p => duesContributedByEach.set(p.id, duePerApplicablePerson));
        }
        nonReserveFundParticipantsForDisplay.forEach(id => duesContributedByEach.set(id, 0)); // These didn't contribute from reserve
        feeDescription = `적립금 사용: ${meetingDues.toLocaleString()}원 (혜택 인원: ${numApplicable}명)`;
      } else {
        feeDescription = '적립금 미사용';
        participants.forEach(p => duesContributedByEach.set(p.id, 0));
      }
    }

    const expensesCoveredByDues = Math.min(totalExpenses, meetingDues);
    const remainingDues = meetingDues - expensesCoveredByDues; // If positive, dues were more than expenses
    const netExpensesToSplit = totalExpenses - expensesCoveredByDues;
    const costPerPerson = numParticipants > 0 ? netExpensesToSplit / numParticipants : 0;

    const amountPaidByEach = new Map<string, number>();
    participants.forEach(p => {
      amountPaidByEach.set(p.id, 0);
    });
    expenses.forEach(expense => {
      amountPaidByEach.set(expense.paidById, (amountPaidByEach.get(expense.paidById) || 0) + expense.totalAmount);
    });

    const finalCostSharePerPerson = new Map<string, number>();
    participants.forEach(p => {
      finalCostSharePerPerson.set(p.id, costPerPerson);
    });

    // For regular meetings with nonReserveFundParticipants, their cost share might differ if reserve fund was used
    // This part of the logic needs to be accurate based on how partialReserveFundAmount is meant to be applied.
    // The current `costPerPerson` calculation splits `netExpensesToSplit` equally.
    // If `nonReserveFundParticipants` should pay their raw share of `totalExpenses` without benefit from `meetingDues` (from reserve),
    // then `finalCostSharePerPerson` for them should be `totalExpenses / numParticipants` (overallPerPersonCost),
    // and for others, it would be `(totalExpenses - (overallPerPersonCost * nonReserveFundParticipants.length) - expensesCoveredByDues) / applicableParticipants.length`.
    // This is complex. For now, the simplified `costPerPerson` is used for all after general dues are applied.
    // The previous `perPersonCostDetails.perPersonCostWithFund` had this distinction. Let's try to replicate it.
    if (!meeting.isTemporary && meeting.useReserveFund && typeof meeting.partialReserveFundAmount === 'number' && meeting.partialReserveFundAmount > 0) {
        const rawOverallPerPersonCost = numParticipants > 0 ? totalExpenses / numParticipants : 0;
        const applicableParticipants = participants.filter(p => !nonReserveFundParticipantsForDisplay.includes(p.id));
        const numApplicable = applicableParticipants.length;

        nonReserveFundParticipantsForDisplay.forEach(id => {
            finalCostSharePerPerson.set(id, rawOverallPerPersonCost);
        });

        if (numApplicable > 0) {
            const expensesAttributedToNonApplicable = nonReserveFundParticipantsForDisplay.reduce((sum, id) => sum + (finalCostSharePerPerson.get(id) || 0), 0);
            const expensesRemainingForApplicable = totalExpenses - expensesAttributedToNonApplicable;
            const fundToUseForApplicable = Math.min(meeting.partialReserveFundAmount, expensesRemainingForApplicable);
            const netExpensesForApplicableAfterFund = expensesRemainingForApplicable - fundToUseForApplicable;
            const costPerApplicablePerson = netExpensesForApplicableAfterFund / numApplicable;
            applicableParticipants.forEach(p => {
                finalCostSharePerPerson.set(p.id, costPerApplicablePerson);
            });
            // Update actualFeeUsedAgainstExpenses based on this more precise calculation
            // actualFeeUsedAgainstExpenses = fundToUseForApplicable; // This should be set
        }
    }


    const netAmountForPerson = new Map<string, number>();
    const peopleForSettlement: { friendId: string; finalAmount: number }[] = [];

    participants.forEach(p => {
      const finalShare = finalCostSharePerPerson.get(p.id) || 0;
      const contributedDues = duesContributedByEach.get(p.id) || 0; // This is what they "paid" as fee
      const paidForExpenses = amountPaidByEach.get(p.id) || 0;

      // Net = (Paid for expenses + Fee they are credited for) - Their final share of expenses
      // If feePerPerson model, they "paid" it. If totalFee model, their "credit" is totalFee/N.
      // If reserve fund, their "credit" is partialReserveFundAmount/numApplicable.
      const net = parseFloat((paidForExpenses + contributedDues - finalShare).toFixed(2));
      netAmountForPerson.set(p.id, net);
      peopleForSettlement.push({ friendId: p.id, finalAmount: net });
    });

    const sortedToReceive = peopleForSettlement.filter(p => p.finalAmount > 0.01).sort((a, b) => b.finalAmount - a.finalAmount);
    const sortedToPay = peopleForSettlement.filter(p => p.finalAmount < -0.01).sort((a, b) => a.finalAmount - b.finalAmount);

    const settlementSuggestionsList: { from: string; to: string; amount: number }[] = [];
    let receiverIdx = 0;
    let payerIdx = 0;

    while (receiverIdx < sortedToReceive.length && payerIdx < sortedToPay.length) {
      const receiver = sortedToReceive[receiverIdx];
      const payer = sortedToPay[payerIdx];
      const amountToTransfer = Math.min(receiver.finalAmount, -payer.finalAmount);

      if (amountToTransfer >= 0.01) {
        settlementSuggestionsList.push({
          from: payer.friendId,
          to: receiver.friendId,
          amount: parseFloat(amountToTransfer.toFixed(2)),
        });
        receiver.finalAmount = parseFloat((receiver.finalAmount - amountToTransfer).toFixed(2));
        payer.finalAmount = parseFloat((payer.finalAmount + amountToTransfer).toFixed(2));
      }
      if (Math.abs(receiver.finalAmount) < 0.01) receiverIdx++;
      if (Math.abs(payer.finalAmount) < 0.01) payerIdx++;
    }

    return {
      totalExpenses,
      meetingDues, // 총 걷은 회비
      expensesCoveredByDues: actualFeeUsedAgainstExpenses, // 회비로 처리된 지출
      remainingDues: remainingFeeFromCollection, // 남은 회비 (환급 가능?)
      netExpensesToSplit, // 회비 처리 후 분담할 순수 지출
      costPerPerson, // 회비 처리 후 1인당 분담액 (일괄 적용 시)
      amountPaidByEach,
      duesContributedByEach,
      finalCostSharePerPerson, // 각자의 최종 비용 분담액 (nonReserve 등을 고려한)
      netAmountForPerson,
      settlementSuggestions: settlementSuggestionsList,
      feeDescription,
      isReserveFundUsedForDisplay,
      nonReserveFundParticipantsForDisplay,
    };
  }, [expenses, participants, meeting, allFriends]); // allFriends might not be needed here if getFriendName is outside or pure
  
  // getFriendName can be outside useMemo if allFriends doesn't change, or pass allFriends to useMemo
  const getFriendName = (friendId: string) => {
    const friend = allFriends.find(f => f.id === friendId);
    if (!friend) return '알 수 없음';
    return friend.name + (friend.description ? ` (${friend.description})` : '');
  };

  if (participants.length === 0) {
    return (
      <Card>
        <CardHeader>
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
        <CardDescription className="space-y-1 mt-1">
          <div>
            총 지출: {calculationResults.totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
          </div>
          {/* Display overall per-person cost before any fee application if it makes sense */}
          {/* For example:
            participants.length > 0 && !meeting.isTemporary && !calculationResults.isReserveFundUsedForDisplay && (
            <div>
              참여자 1인당 부담액: {(calculationResults.totalExpenses / participants.length).toLocaleString(undefined, { maximumFractionDigits: 0 })}원
            </div>
          )} */}
          {/* The feeDescription now aims to summarize fee application */}
          <div className={`text-sm ${calculationResults.expensesCoveredByDues > 0.01 ? 'text-primary' : 'text-muted-foreground'}`}>
            <PiggyBank className="inline-block h-4 w-4 mr-1 align-middle" />
            {calculationResults.feeDescription}
          </div>
          {calculationResults.remainingDues > 0.01 && (
             <div className="text-sm text-blue-600">
               <Info className="inline-block h-4 w-4 mr-1 align-middle" />
               회비에서 남은 금액: {calculationResults.remainingDues.toLocaleString(undefined, {maximumFractionDigits: 0})}원 (정산에 반영됨)
             </div>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 && (
          <p className="text-muted-foreground text-center py-4">지출 내역이 없어 정산할 금액이 없습니다.</p>
        )}
        {expenses.length > 0 && (
          <div className="space-y-6">
            {/* --- 개인별 최종 정산 현황 --- */}
            <div>
              <h3 className="text-md font-semibold mb-2 flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                개인별 최종 정산 현황
              </h3>
              <CardDescription>
                회비 및 지출 내역이 모두 반영된 개인별 최종 부담액입니다.<br />
              </CardDescription>
              <div className="overflow-x-auto">
                <ScrollArea className="pr-3 mt-2 min-w-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>참여자</TableHead>
                        <TableHead className="text-right">총 지출액</TableHead>
                        <TableHead className="text-right">본인부담액</TableHead>
                        <TableHead className="text-right">최종 정산액</TableHead>
                        <TableHead className="text-right">상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {participants.map(p => {
                        const totalPaidForItems = calculationResults.amountPaidByEach.get(p.id) || 0;
                        const actualCostShare = calculationResults.finalCostSharePerPerson.get(p.id) || 0;
                        const finalAmount = calculationResults.netAmountForPerson.get(p.id) || 0;
                        // const feePaidOrCredited = calculationResults.duesContributedByEach.get(p.id) || 0;

                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium flex items-center">
                              <UserCircle className="h-4 w-4 mr-2 opacity-70" />
                              {getFriendName(p.id)}
                              {!meeting.isTemporary && calculationResults.isReserveFundUsedForDisplay && calculationResults.nonReserveFundParticipantsForDisplay.includes(p.id) && (
                                <Badge variant="outline" className="ml-2 text-xs">적립금 미적용</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {totalPaidForItems.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
                            </TableCell>
                            <TableCell className="text-right">
                              {/* 본인부담액: 최종적으로 지출에 대해 부담해야 하는 금액 */}
                              {actualCostShare.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
                            </TableCell>
                            <TableCell className={`text-right font-semibold ${finalAmount > 0.01 ? 'text-green-600' : finalAmount < -0.01 ? 'text-red-600' : 'text-muted-foreground'}`}> 
                              {Math.abs(finalAmount) < 0.01 ? '-' : `${finalAmount > 0 ? '+' : ''}${finalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}원`}
                            </TableCell>
                            <TableCell className="text-right">
                              {finalAmount > 0.01 ? (
                                <span className="inline-flex items-center text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                  <TrendingUp className="h-3 w-3 mr-1" /> 받을 돈
                                </span>
                              ) : finalAmount < -0.01 ? (
                                <span className="inline-flex items-center text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                                  <TrendingDown className="h-3 w-3 mr-1" /> 내야할 돈
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">정산 완료</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </div>

            {settlementSuggestions.suggestions.length > 0 && (
              <div>
                <h3 className="text-md font-semibold mb-2 flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  최종 송금 제안
                </h3>
                <CardDescription>
                  개인 간 필요한 최종 송금 내역입니다.<br />
                </CardDescription>
                <div className="overflow-x-auto">
                  <ScrollArea className="pr-3 mt-2 min-w-[600px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>보내는 사람</TableHead>
                          <TableHead>받는 사람</TableHead>
                          <TableHead className="text-right">금액</TableHead>
                          {/* <TableHead className="text-right">비고</TableHead> */}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {calculationResults.settlementSuggestions.map((debt, index) => (
                          <TableRow key={`suggestion-${index}`}>
                            <TableCell>{getFriendName(debt.from)}</TableCell>
                            <TableCell>{getFriendName(debt.to)}</TableCell>
                            <TableCell className="text-right font-medium">
                              {debt.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
                            </TableCell>
                            {/* <TableCell className="text-right text-xs text-muted-foreground">일반 정산</TableCell> */}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </div>
            )}

            {calculationResults.settlementSuggestions.length === 0 && expenses.length > 0 && (
              <p className="text-center text-muted-foreground py-3">모든 정산이 완료되었거나 추가 송금이 필요하지 않습니다.</p>
            )}
          </div>
        )}
      </CardContent>
      {expenses.length > 0 && (
        <CardFooter>
          <p className="text-xs text-muted-foreground">
            참고: 소수점 계산으로 인해 10원 미만의 오차가 발생할 수 있습니다.
            {calculationResults.expensesCoveredByDues > 0.01 && !meeting.isTemporary && (
              ' 적립금 사용액이 혜택 대상자들의 부담금을 줄이는 데 사용됩니다.'
            )}
             {calculationResults.expensesCoveredByDues > 0.01 && meeting.isTemporary && (
              ' 설정된 회비가 참여자들의 부담금을 줄이는 데 사용됩니다.'
            )}
          </p>
        </CardFooter>
      )}
    </Card>
  );
}
