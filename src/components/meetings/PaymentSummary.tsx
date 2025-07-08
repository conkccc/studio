'use client';

import type { Expense, Friend, Meeting } from '@/lib/types';
import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, TrendingDown, UserCircle, PiggyBank, Users, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface PaymentSummaryProps {
  meeting: Meeting;
  expenses: Expense[];
  participants: Friend[];
  allFriends: Friend[];
}

export function PaymentSummary({ meeting, expenses, participants, allFriends }: PaymentSummaryProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };

    if (typeof window !== 'undefined') {
      handleResize();
      window.addEventListener('resize', handleResize);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, []); // 컴포넌트 마운트 시 한 번만 실행

  const effectiveParticipants = useMemo<Friend[]>(() => {
    if (meeting.isTemporary && Array.isArray(meeting.temporaryParticipants) && meeting.temporaryParticipants.length > 0) {
      return meeting.temporaryParticipants.map((p, idx) => ({
        id: p.name, 
        name: p.name,
        description: '', 
        groupId: meeting.groupId || 'temp_group', 
        createdAt: new Date(), 
      }));
    }
    return participants;
  }, [meeting, participants]);

  const isExpenseAllParticipantsShared = useCallback((expense: Expense, allCurrentParticipantIds: string[]): boolean => {
    if (expense.splitType === 'equally' && expense.splitAmongIds) {
      const splitAmongSet = new Set(expense.splitAmongIds);
      return allCurrentParticipantIds.length > 0 && allCurrentParticipantIds.every(id => splitAmongSet.has(id));
    }
    return false;
  }, []);

  const perPersonCostDetails = useMemo<{
    totalSpent: number;
    totalSpentAllParticipants: number;
    totalSpentExcludedParticipants: number;
    perPersonCost: number; // '모든 참여자의 분배'에 대한 1인당 균등 부담액 (적용 가능한 경우)
    fundUsed: number;
    fundLeft: number;
    perPersonCostWithFund: Record<string, number>;
    fundApplicableIds: string[];
    fundNonApplicableIds: string[];
    fundDescription: string;
    perFundApplicableCost: number;
    individualExpenseContributions: Record<string, number>; // 각 참여자가 각 Expense에 대해 부담해야 할 금액 (정확한 본인부담액)
  }>(() => {
    const totalSpent = expenses.reduce((sum, e) => sum + e.totalAmount, 0);
    const participantIds = effectiveParticipants.map(p => p.id);
    const numParticipants = participantIds.length;

    if (numParticipants === 0) {
      return {
        totalSpent,
        totalSpentAllParticipants: 0,
        totalSpentExcludedParticipants: 0,
        perPersonCost: 0,
        fundUsed: 0,
        fundLeft: 0,
        perPersonCostWithFund: {},
        fundApplicableIds: [],
        fundNonApplicableIds: participantIds,
        fundDescription: '참여자가 없습니다.',
        perFundApplicableCost: 0,
        individualExpenseContributions: {},
      };
    }

    let totalSpentAllParticipants = 0;
    let totalSpentExcludedParticipants = 0;

    expenses.forEach(expense => {
      if (isExpenseAllParticipantsShared(expense, participantIds)) {
        totalSpentAllParticipants += expense.totalAmount;
      } else {
        totalSpentExcludedParticipants += expense.totalAmount;
      }
    });
    
    let fundApplicableIds: string[] = participantIds;
    let fundNonApplicableIds: string[] = [];
    if (meeting.useReserveFund && Array.isArray(meeting.nonReserveFundParticipants) && meeting.nonReserveFundParticipants.length > 0) {
      fundNonApplicableIds = meeting.nonReserveFundParticipants.filter(id => participantIds.includes(id));
      fundApplicableIds = participantIds.filter(id => !fundNonApplicableIds.includes(id));
    }

    const numFundApplicable = fundApplicableIds.length;
    const numFundNonApplicable = fundNonApplicableIds.length;
    
    // 각 Expense별 개인이 부담해야 할 금액 계산
    const individualExpenseContributions: Record<string, number> = {};
    effectiveParticipants.forEach(p => (individualExpenseContributions[p.id] = 0)); 

    expenses.forEach(expense => {
      if (expense.splitType === 'equally') {
        const relevantParticipantsForExpense = expense.splitAmongIds?.filter(id => effectiveParticipants.some(p => p.id === id)) || [];
        const numRelevant = relevantParticipantsForExpense.length;
        if (numRelevant > 0) {
          const amountPerPerson = expense.totalAmount / numRelevant;
          relevantParticipantsForExpense.forEach(id => {
            individualExpenseContributions[id] = (individualExpenseContributions[id] || 0) + amountPerPerson;
          });
        }
      } else if (expense.splitType === 'custom' && expense.customSplits) {
        expense.customSplits.forEach(split => {
          if (effectiveParticipants.some(p => p.id === split.friendId)) {
            individualExpenseContributions[split.friendId] = (individualExpenseContributions[split.friendId] || 0) + split.amount;
          }
        });
      }
    });

    // "모든 참여자의 분배"에 대한 1인당 부담액 (모든 참여자가 분배하는 소비 지출만 있을 경우의 균등 분배액)
    const perPersonCost = numParticipants > 0 ? totalSpentAllParticipants / numParticipants : 0;

    let fundUsed = 0;
    let fundLeft = 0;
    let perPersonCostWithFund: Record<string, number> = { ...individualExpenseContributions }; // 개별 부담액으로 초기화
    let fundDescription = '';
    let perFundApplicableCost = 0; // "회비적용 인원 1인당 부담액" (인원 제외가 있는 소비가 없을 때만 균등 분배 의미)

    if (meeting.useReserveFund && meeting.partialReserveFundAmount && meeting.partialReserveFundAmount > 0 && numFundApplicable > 0) {
        const totalFundApplicableContributions = fundApplicableIds.reduce((sum, id) => sum + (individualExpenseContributions[id] || 0), 0);
        
        fundUsed = Math.min(meeting.partialReserveFundAmount, totalFundApplicableContributions);
        fundLeft = meeting.partialReserveFundAmount - fundUsed;
        
        const fundRemainingCost = totalFundApplicableContributions - fundUsed;
        perFundApplicableCost = numFundApplicable > 0 ? fundRemainingCost / numFundApplicable : 0;
        
        fundApplicableIds.forEach(id => {
            perPersonCostWithFund[id] = perFundApplicableCost; // 회비 적용 인원은 회비 적용 후 남은 비용을 균등 분배
        });
        
        fundNonApplicableIds.forEach(id => {
            perPersonCostWithFund[id] = individualExpenseContributions[id] || 0; // 회비 미적용 인원은 원래 계산된 부담액 지불
        });

        fundDescription = `회비 적용 인원 ${numFundApplicable}명, 미적용 인원 ${numFundNonApplicable}명, 실제 사용 회비: ${fundUsed.toLocaleString()}원${fundLeft > 0.01 ? `, 미사용 회비: ${fundLeft.toLocaleString()}원` : ''}`;
    } else {
        participantIds.forEach(id => {
            perPersonCostWithFund[id] = individualExpenseContributions[id] || 0;
        });
        fundDescription = '회비 미적용';
    }

    return {
      totalSpent,
      totalSpentAllParticipants,
      totalSpentExcludedParticipants,
      perPersonCost: perPersonCost, // '모든 참여자의 분배'에 대한 1인당 부담액
      fundUsed,
      fundLeft,
      perPersonCostWithFund: perPersonCostWithFund as Record<string, number>,
      fundApplicableIds,
      fundNonApplicableIds,
      fundDescription,
      perFundApplicableCost, // '모든 참여자의 분배' 중 회비 적용 대상에게 균등 분배되는 금액
      individualExpenseContributions,
    };
  }, [expenses, effectiveParticipants, meeting, isExpenseAllParticipantsShared]);

  const mappedExpenses = useMemo((): Expense[] => {
    if (meeting.isTemporary && Array.isArray(meeting.temporaryParticipants) && meeting.temporaryParticipants.length > 0) {
      return expenses.map(e => {
        let newExpense = { ...e };
        if (!effectiveParticipants.some(f => f.id === e.paidById)) {
          const found = effectiveParticipants.find(f => f.name === e.paidById);
          if (found) newExpense.paidById = found.id;
        }
        if (Array.isArray(e.splitAmongIds)) {
          newExpense.splitAmongIds = e.splitAmongIds.map((idOrName: string) => {
            const found = effectiveParticipants.find(f => f.id === idOrName || f.name === idOrName);
            return found ? found.id : idOrName;
          });
        }
        return newExpense;
      });
    }
    return expenses;
  }, [expenses, meeting, effectiveParticipants]);

  const settlementSuggestions = useMemo(() => {
    const people = effectiveParticipants.map(p => {
      const totalPaid = mappedExpenses.filter(e => e.paidById === p.id).reduce((sum, e) => sum + e.totalAmount, 0);
      
      const shouldPay = perPersonCostDetails.perPersonCostWithFund[p.id] || 0;
      
      const finalAmount = parseFloat((totalPaid - shouldPay).toFixed(2));
      return { friendId: p.id, totalPaid, shouldPay, finalAmount };
    });
    const sorted = [...people].sort((a, b) => b.finalAmount - a.finalAmount);
    let fundLeft = perPersonCostDetails.fundUsed;
    const fundPayouts: { to: string; amount: number }[] = [];
    const afterFund: { friendId: string; amount: number }[] = [];
    for (const person of sorted) {
      if (person.finalAmount > 0.01 && fundLeft > 0.01) {
        const payout = Math.min(person.finalAmount, fundLeft);
        fundPayouts.push({ to: person.friendId, amount: payout });
        afterFund.push({ friendId: person.friendId, amount: parseFloat((person.finalAmount - payout).toFixed(2)) });
        fundLeft -= payout;
      } else {
        afterFund.push({ friendId: person.friendId, amount: person.finalAmount });
      }
    }
    const receivers = afterFund.filter(p => p.amount > 0.01).sort((a, b) => b.amount - a.amount);
    const senders = afterFund.filter(p => p.amount < -0.01).sort((a, b) => a.amount - b.amount);
    const suggestions: { from: string; to: string; amount: number }[] = [];
    let i = 0, j = 0;
    while (i < senders.length && j < receivers.length) {
      const send = senders[i];
      const recv = receivers[j];
      const amount = Math.min(-send.amount, recv.amount);
      if (amount >= 0.01) {
        suggestions.push({ from: send.friendId, to: recv.friendId, amount: parseFloat(amount.toFixed(2)) });
        send.amount += amount;
        recv.amount -= amount;
      }
      if (Math.abs(send.amount) < 0.01) i++;
      if (Math.abs(recv.amount) < 0.01) j++;
    }
    return { fundPayouts, suggestions, people };
  }, [mappedExpenses, effectiveParticipants, perPersonCostDetails]);
  
  const getFriendName = (friendId: string): string => {
    const friend = allFriends.find(f => f.id === friendId)
      || effectiveParticipants.find(f => f.id === friendId);
    if (!friend) return '알 수 없음';
    return friend.name + (friend.description ? ` (${friend.description})` : '');
  };

  const nonPayingParticipants = useMemo(() => {
    const allPayerIds = new Set(expenses.map(e => e.paidById));
    return effectiveParticipants.filter(p => !allPayerIds.has(p.id));
  }, [effectiveParticipants, expenses]);

  const payingParticipants = useMemo(() => {
    const allPayerIds = new Set(expenses.map(e => e.paidById));
    return effectiveParticipants.filter(p => allPayerIds.has(p.id));
  }, [effectiveParticipants, expenses]);


  if (participants.length === 0 && meeting.isTemporary && Array.isArray(meeting.temporaryParticipants) && meeting.temporaryParticipants.length > 0) {
    return (
      <Card>
        <CardHeader>
          <CardDescription>임시 모임의 최종 정산 내역입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-2 text-muted-foreground">참여자 목록:</div>
          <ul className="mb-4 pl-5 list-disc text-sm text-muted-foreground">
            {meeting.temporaryParticipants.map((p, idx) => (
              <li key={idx}>{p.name}</li>
            ))}
          </ul>
          <p className="text-muted-foreground text-center py-4">정산 내역을 표시할 수 없습니다. (임시 모임은 참여자 이름만 표시)</p>
        </CardContent>
      </Card>
    );
  }

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
            총 지출: {perPersonCostDetails.totalSpent.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
          </div>
          {/* 모든 참여자가 분배하는 소비 총액 및 1인당 부담액 */}
          {perPersonCostDetails.totalSpentAllParticipants > 0 && (
            <div>
              모든 참여자의 분배 총액: {perPersonCostDetails.totalSpentAllParticipants.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
              {participants.length > 0 && ` (1인당: ${perPersonCostDetails.perPersonCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}원)`}
            </div>
          )}
          
          {/* 인원 제외가 있는 소비 총액 */}
          {perPersonCostDetails.totalSpentExcludedParticipants > 0 && (
            <div>
              인원 제외가 있는 분배 총액: {perPersonCostDetails.totalSpentExcludedParticipants.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
            </div>
          )}

          {/* 인원 제외가 있는 소비 지출이 없을 때만 '참여자 1인당 부담액 (모든 참여자가 분배하는 소비)' 표시 */}
          {perPersonCostDetails.totalSpentExcludedParticipants === 0 && participants.length > 0 && (
            <div>
              참여자 1인당 부담액 (회비 적용 전): {perPersonCostDetails.perPersonCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
            </div>
          )}

          {/* 회비 적용 인원 1인당 부담액 (인원 제외가 있는 소비가 없을 때만 유효한 균등 분배 금액을 표시) */}
          {perPersonCostDetails.fundUsed > 0.01 && perPersonCostDetails.totalSpentExcludedParticipants === 0 && (
            <div>
                회비적용 인원 1인당 부담액: {perPersonCostDetails.perFundApplicableCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
            </div>
          )}
          <div className={`text-sm ${perPersonCostDetails.fundUsed > 0.01 ? 'text-primary' : 'text-muted-foreground'}`}>
            <PiggyBank className="inline-block h-4 w-4 mr-1 align-middle" />
            {perPersonCostDetails.fundDescription}
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 && (
          <p className="text-muted-foreground text-center py-4">지출 내역이 없어 정산할 금액이 없습니다.</p>
        )}
        {expenses.length > 0 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-md font-semibold mb-2 flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                개인별 최종 정산 현황
              </h3>
              <CardDescription>
                회비 및 지출 내역이 모두 반영된 개인별 최종 부담액입니다.<br />
              </CardDescription>
              {meeting.isTemporary && Array.isArray(meeting.temporaryParticipants) && meeting.temporaryParticipants.length > 0 ? (
                <div className="mb-4">
                  {/* 임시 모임 데스크톱 테이블 뷰 */}
                  {isMobile ? (
                    // 임시 모임 모바일 뷰
                    <div className="border rounded-md divide-y divide-gray-200">
                      {effectiveParticipants.map(p => {
                        const personDetails = settlementSuggestions.people.find(sp => sp.friendId === p.id);
                        if (!personDetails) return null;

                        const totalPaid = personDetails.totalPaid;
                        const shouldPay = personDetails.shouldPay;
                        const finalAmount = personDetails.finalAmount;

                        return (
                          <div key={p.id} className="p-4">
                            <div className="font-semibold text-lg flex items-center">
                              <UserCircle className="h-5 w-5 mr-2 opacity-70" />
                              {getFriendName(p.id)}
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-2">
                              <div><span className="text-muted-foreground">총 지출액:</span> {totalPaid > 0 ? totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 }) + '원' : '-'}</div>
                              <div><span className="text-muted-foreground">본인부담액:</span> {shouldPay > 0 ? shouldPay.toLocaleString(undefined, { maximumFractionDigits: 0 }) + '원' : '-'}</div>
                              <div className="col-span-2">
                                <span className="text-muted-foreground">최종 정산액:</span>{' '}
                                <span className={`font-semibold ${finalAmount > 0.01 ? 'text-green-600' : finalAmount < -0.01 ? 'text-red-600' : 'text-muted-foreground'}`}>
                                  {Math.abs(finalAmount) < 0.01 ? '-' : `${finalAmount > 0 ? '+' : ''}${finalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}원`}
                                </span>
                              </div>
                              <div className="col-span-2 flex items-center">
                                <span className="text-muted-foreground">상태:</span>{' '}
                                {finalAmount > 0.01 ? (
                                  <Badge className="inline-flex items-center text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full ml-1">
                                    <TrendingUp className="h-3 w-3 mr-1" /> 받을 돈
                                  </Badge>
                                ) : finalAmount < -0.01 ? (
                                  <Badge className="inline-flex items-center text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full ml-1">
                                    <TrendingDown className="h-3 w-3 mr-1" /> 내야할 돈
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs text-muted-foreground ml-1">정산 완료</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // 임시 모임 데스크톱 테이블 뷰
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
                            {effectiveParticipants.map((p) => {
                              const personDetails = settlementSuggestions.people.find(sp => sp.friendId === p.id);
                              if (!personDetails) return null;

                              const totalPaid = personDetails.totalPaid;
                              const shouldPay = personDetails.shouldPay;
                              const finalAmount = personDetails.finalAmount;

                              return (
                                <TableRow key={p.id}>
                                  <TableCell className="font-medium flex items-center">
                                    <UserCircle className="h-4 w-4 mr-2 opacity-70" />
                                    {getFriendName(p.id)}
                                  </TableCell>
                                  <TableCell className="text-right">{totalPaid > 0 ? totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 }) + '원' : '-'}</TableCell>
                                  <TableCell className="text-right">{shouldPay > 0 ? shouldPay.toLocaleString(undefined, { maximumFractionDigits: 0 }) + '원' : '-'}</TableCell>
                                  <TableCell className="text-right font-semibold">{Math.abs(finalAmount) < 0.01 ? '-' : `${finalAmount > 0 ? '+' : ''}${finalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}원`}</TableCell>
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
                  )}
                </div>
              ) : (
                // 일반 모임 뷰
                <div className="overflow-x-auto">
                  {isMobile ? (
                    // 일반 모임 모바일 뷰
                    <div className="border rounded-md divide-y divide-gray-200">
                      {payingParticipants.map(p => {
                        const personDetails = settlementSuggestions.people.find(sp => sp.friendId === p.id);
                        if (!personDetails) return null;

                        const totalPaid = personDetails.totalPaid;
                        const shouldPay = personDetails.shouldPay;
                        const finalAmount = personDetails.finalAmount;

                        return (
                          <div key={p.id} className="p-4">
                            <div className="font-semibold text-lg flex items-center">
                              <UserCircle className="h-5 w-5 mr-2 opacity-70" />
                              {getFriendName(p.id)}
                              {perPersonCostDetails.fundUsed > 0.01 && perPersonCostDetails.fundNonApplicableIds.includes(p.id) && (
                                <Badge variant="outline" className="ml-2 text-xs">회비 미적용</Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-2">
                              <div><span className="text-muted-foreground">총 지출액:</span> {totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })}원</div>
                              <div><span className="text-muted-foreground">본인부담액:</span> {shouldPay.toLocaleString(undefined, { maximumFractionDigits: 0 })}원</div>
                              <div className="col-span-2">
                                <span className="text-muted-foreground">최종 정산액:</span>{' '}
                                <span className={`font-semibold ${finalAmount > 0.01 ? 'text-green-600' : finalAmount < -0.01 ? 'text-red-600' : 'text-muted-foreground'}`}> 
                                  {Math.abs(finalAmount) < 0.01 ? '-' : `${finalAmount > 0 ? '+' : ''}${finalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}원`}
                                </span>
                              </div>
                              <div className="col-span-2 flex items-center">
                                <span className="text-muted-foreground">상태:</span>{' '}
                                {finalAmount > 0.01 ? (
                                  <Badge className="inline-flex items-center text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full ml-1">
                                    <TrendingUp className="h-3 w-3 mr-1" /> 받을 돈
                                  </Badge>
                                ) : finalAmount < -0.01 ? (
                                  <Badge className="inline-flex items-center text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full ml-1">
                                    <TrendingDown className="h-3 w-3 mr-1" /> 내야할 돈
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs text-muted-foreground ml-1">정산 완료</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {nonPayingParticipants.length > 0 && (
                        <div className="py-2 text-center text-muted-foreground bg-gray-50 dark:bg-gray-800">
                          지출 내역이 없는 참여자
                        </div>
                      )}
                      {nonPayingParticipants
                        .map(p => {
                          const personDetails = settlementSuggestions.people.find(sp => sp.friendId === p.id);
                          return personDetails ? { participant: p, details: personDetails } : null; 
                        })
                        .filter(item => item !== null) 
                        .map(({ participant: p, details: personDetails }) => (
                          <div key={p.id} className="p-4 opacity-70">
                            <div className="font-semibold text-lg flex items-center">
                              <UserCircle className="h-5 w-5 mr-2 opacity-70" />
                              {getFriendName(p.id)}
                              {perPersonCostDetails.fundUsed > 0.01 && perPersonCostDetails.fundNonApplicableIds.includes(p.id) && (
                                <Badge variant="outline" className="ml-2 text-xs">회비 미적용</Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-2">
                              <div><span className="text-muted-foreground">총 지출액:</span> -</div>
                              <div><span className="text-muted-foreground">본인부담액:</span> {personDetails.shouldPay.toLocaleString(undefined, { maximumFractionDigits: 0 })}원</div>
                              <div className="col-span-2">
                                <span className="text-muted-foreground">최종 정산액:</span>{' '}
                                <span className={`font-semibold ${personDetails.finalAmount > 0.01 ? 'text-green-600' : personDetails.finalAmount < -0.01 ? 'text-red-600' : 'text-muted-foreground'}`}>
                                  {Math.abs(personDetails.finalAmount) < 0.01 ? '-' : `${personDetails.finalAmount > 0 ? '+' : ''}${personDetails.finalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}원`}
                                </span>
                              </div>
                              <div className="col-span-2 flex items-center">
                                <span className="text-muted-foreground">상태:</span>{' '}
                                {personDetails.finalAmount > 0.01 ? (
                                  <Badge className="inline-flex items-center text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full ml-1">
                                    <TrendingUp className="h-3 w-3 mr-1" /> 받을 돈
                                  </Badge>
                                ) : personDetails.finalAmount < -0.01 ? (
                                  <Badge className="inline-flex items-center text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full ml-1">
                                    <TrendingDown className="h-3 w-3 mr-1" /> 내야할 돈
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs text-muted-foreground ml-1">정산 완료</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    // 일반 모임 데스크톱 테이블 뷰
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
                          {/* 지출이 있는 참여자들 먼저 표시 */}
                          {payingParticipants.map(p => {
                            const personDetails = settlementSuggestions.people.find(sp => sp.friendId === p.id);
                            if (!personDetails) return null;

                            const totalPaid = personDetails.totalPaid;
                            const shouldPay = personDetails.shouldPay;
                            const finalAmount = personDetails.finalAmount;

                            return (
                              <TableRow key={p.id}>
                                <TableCell className="font-medium flex items-center">
                                  <UserCircle className="h-4 w-4 mr-2 opacity-70" />
                                  {getFriendName(p.id)}
                                  {perPersonCostDetails.fundUsed > 0.01 && perPersonCostDetails.fundNonApplicableIds.includes(p.id) && (
                                    <Badge variant="outline" className="ml-2 text-xs">회비 미적용</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
                                </TableCell>
                                <TableCell className="text-right">
                                  {shouldPay.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
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

                          {/* 지출 내역이 없는 참여자들을 구분하여 표시 */}
                          {nonPayingParticipants.length > 0 && (
                            <TableRow>
                              <TableCell colSpan={5} className="py-2 text-center text-muted-foreground bg-gray-50 dark:bg-gray-800">
                                지출 내역이 없는 참여자
                              </TableCell>
                            </TableRow>
                          )}
                          {nonPayingParticipants
                            .map(p => {
                              const personDetails = settlementSuggestions.people.find(sp => sp.friendId === p.id);
                              return personDetails ? { participant: p, details: personDetails } : null; 
                            })
                            .filter(item => item !== null) 
                            .map(({ participant: p, details: personDetails }) => (
                              <TableRow key={p.id} className="opacity-70"><TableCell className="font-medium flex items-center"><UserCircle className="h-4 w-4 mr-2 opacity-70" />{getFriendName(p.id)}{perPersonCostDetails.fundUsed > 0.01 && perPersonCostDetails.fundNonApplicableIds.includes(p.id) && (<Badge variant="outline" className="ml-2 text-xs">회비 미적용</Badge>)}</TableCell><TableCell className="text-right">-</TableCell><TableCell className="text-right">{personDetails.shouldPay.toLocaleString(undefined, { maximumFractionDigits: 0 })}원</TableCell><TableCell className={`text-right font-semibold ${personDetails.finalAmount > 0.01 ? 'text-green-600' : personDetails.finalAmount < -0.01 ? 'text-red-600' : 'text-muted-foreground'}`}>{Math.abs(personDetails.finalAmount) < 0.01 ? '-' : `${personDetails.finalAmount > 0 ? '+' : ''}${personDetails.finalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}원`}</TableCell><TableCell className="text-right">{personDetails.finalAmount > 0.01 ? (<span className="inline-flex items-center text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><TrendingUp className="h-3 w-3 mr-1" /> 받을 돈</span>) : personDetails.finalAmount < -0.01 ? (<span className="inline-flex items-center text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><TrendingDown className="h-3 w-3 mr-1" /> 내야할 돈</span>) : (<span className="text-xs text-muted-foreground">정산 완료</span>)}</TableCell></TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </div>
              )}
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
                {isMobile ? (
                  // 모바일 송금 제안 뷰
                  <div className="border rounded-md divide-y divide-gray-200">
                    {meeting.useReserveFund && perPersonCostDetails.fundUsed > 0.01 &&
                    settlementSuggestions.fundPayouts.map((debt, index) => (
                      <div key={`fundPayout-${index}`} className="p-4">
                        <div className="text-muted-foreground mb-1">N빵친구 회비 → {getFriendName(debt.to)}</div>
                        <div className="font-medium flex items-center">
                          {debt.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
                          <Badge className="ml-2 text-xs text-primary bg-primary/10">회비 지원</Badge>
                        </div>
                      </div>
                    ))}
                    {settlementSuggestions.suggestions.map((debt, index) => (
                      <div key={`suggestion-${index}`} className="p-4">
                        <div className="mb-1">{getFriendName(debt.from)} → {getFriendName(debt.to)}</div>
                        <div className="font-medium">
                          {debt.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // 데스크톱 송금 제안 테이블 뷰
                  <div className="overflow-x-auto">
                    <ScrollArea className="pr-3 mt-2 min-w-[600px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>보내는 사람</TableHead>
                            <TableHead>받는 사람</TableHead>
                            <TableHead className="text-right">금액</TableHead>
                            <TableHead className="text-right">비고</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {meeting.useReserveFund && perPersonCostDetails.fundUsed > 0.01 &&
                          settlementSuggestions.fundPayouts.map((debt, index) => (
                            <TableRow key={`fundPayout-${index}`}>
                              <TableCell className="text-muted-foreground">N빵친구 회비</TableCell>
                              <TableCell>{getFriendName(debt.to)}</TableCell>
                              <TableCell className="text-right font-medium">
                                {debt.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
                              </TableCell>
                              <TableCell className="text-right text-xs text-primary">회비 지원</TableCell>
                            </TableRow>
                          ))}
                          {settlementSuggestions.suggestions.map((debt, index) => (
                            <TableRow key={`suggestion-${index}`}>
                              <TableCell>{getFriendName(debt.from)}</TableCell>
                              <TableCell>{getFriendName(debt.to)}</TableCell>
                              <TableCell className="text-right font-medium">
                                {debt.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground"></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}

            {settlementSuggestions.suggestions.length === 0 && expenses.length > 0 && (
              <p className="text-center text-muted-foreground py-3">모든 정산이 완료되었거나 추가 송금이 필요하지 않습니다.</p>
            )}
          </div>
        )}
      </CardContent>
      {expenses.length > 0 && (
        <CardFooter>
          <p className="text-xs text-muted-foreground">
            참고: 소수점 계산으로 인해 10원 미만의 오차가 발생할 수 있습니다.
            {perPersonCostDetails.fundUsed > 0.01 && (
              ' 회비 사용액이 혜택 대상자들의 부담금을 줄이는 데 사용됩니다.'
            )}
          </p>
        </CardFooter>
      )}
    </Card>
  );
}
