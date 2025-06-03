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
  
  // --- 임시 모임일 경우: participants를 temporaryParticipants로 대체 (id 없으면 name+idx로 임시 id 부여) ---
  const effectiveParticipants = useMemo<Friend[]>(() => {
    if (meeting.isTemporary && Array.isArray(meeting.temporaryParticipants) && meeting.temporaryParticipants.length > 0) {
      return meeting.temporaryParticipants.map((p, idx) => ({
        id: `temp_${idx}_${p.name}`, // Corrected ID generation
        name: p.name,
        description: '(임시)', // Consistent with MeetingDetailsClient
        groupId: meeting.groupId || 'temp_group', // Associate with meeting's group or a default
        createdAt: new Date(), // Placeholder
      }));
    }
    return participants;
  }, [meeting, participants]);

  const participantIdsInMeeting = useMemo(() => new Set(effectiveParticipants.map(p => p.id)), [effectiveParticipants]);

  // --- 리팩토링: 1인당 지출 내역 및 회비 적용 계산 ---
  const perPersonCostDetails = useMemo<{
    totalSpent: number;
    perPersonCost: number;
    fundUsed: number;
    fundLeft: number;
    perPersonCostWithFund: Record<string, number>;
    fundApplicableIds: string[];
    fundNonApplicableIds: string[];
    fundDescription: string;
    perFundApplicableCost: number;
  }>(() => {
    const totalSpent = expenses.reduce((sum, e) => sum + e.totalAmount, 0);
    const participantIds = effectiveParticipants.map(p => p.id);
    const numParticipants = participantIds.length;
    if (numParticipants === 0) {
      return {
        totalSpent,
        perPersonCost: 0,
        fundUsed: 0,
        fundLeft: 0,
        perPersonCostWithFund: {},
        fundApplicableIds: [],
        fundNonApplicableIds: participantIds,
        fundDescription: '참여자가 없습니다.',
        perFundApplicableCost: 0 // 타입 일치
      };
    }

    // 회비 적용 인원
    let fundApplicableIds: string[] = participantIds;
    let fundNonApplicableIds: string[] = [];
    if (meeting.useReserveFund && Array.isArray(meeting.nonReserveFundParticipants) && meeting.nonReserveFundParticipants.length > 0) {
      fundNonApplicableIds = meeting.nonReserveFundParticipants.filter(id => participantIds.includes(id));
      fundApplicableIds = participantIds.filter(id => !fundNonApplicableIds.includes(id));
    }

    const numFundApplicable = fundApplicableIds.length;
    const numFundNonApplicable = fundNonApplicableIds.length;
    const perPersonCost = numParticipants > 0 ? totalSpent / numParticipants : 0;

    let fundUsed = 0;
    let fundLeft = 0;
    let perPersonCostWithFund: Record<string, number> = {};
    let fundDescription = '';
    let perFundApplicableCost = 0;
    if (meeting.useReserveFund && meeting.partialReserveFundAmount && meeting.partialReserveFundAmount > 0 && numFundApplicable > 0) {
      // 회비 적용 인원 총지출
      const fundApplicableTotal = totalSpent - (numFundNonApplicable * perPersonCost);
      fundUsed = Math.min(meeting.partialReserveFundAmount, fundApplicableTotal);
      fundLeft = meeting.partialReserveFundAmount - fundUsed;
      const fundAppliedLeftCost = fundApplicableTotal - fundUsed;
      perFundApplicableCost = numFundApplicable > 0 ? fundAppliedLeftCost / numFundApplicable : 0;
      fundApplicableIds.forEach(id => {
        perPersonCostWithFund[id] = perFundApplicableCost;
      });
      fundNonApplicableIds.forEach(id => {
        perPersonCostWithFund[id] = perPersonCost;
      });
      fundDescription = `회비 적용 인원 ${numFundApplicable}명, 미적용 인원 ${numFundNonApplicable}명, 실제 사용 회비: ${fundUsed.toLocaleString()}원${fundLeft > 0.01 ? `, 미사용 회비: ${fundLeft.toLocaleString()}원` : ''}`;
    } else {
      // 회비 없음
      participantIds.forEach(id => {
        perPersonCostWithFund[id] = perPersonCost;
      });
      fundDescription = '회비 미적용';
    }

    return {
      totalSpent,
      perPersonCost,
      fundUsed,
      fundLeft,
      perPersonCostWithFund: perPersonCostWithFund as Record<string, number>,
      fundApplicableIds,
      fundNonApplicableIds,
      fundDescription,
      perFundApplicableCost // 추가: 회비 적용 인원 1인당 부담액
    };
  }, [expenses, effectiveParticipants, meeting]);

  // --- settlementSuggestions 계산 리팩토링 ---
  // settlementSuggestions useMemo 중복 선언 제거 (한 번만 선언)
  const mappedExpenses = useMemo(() => {
    if (meeting.isTemporary && Array.isArray(meeting.temporaryParticipants) && meeting.temporaryParticipants.length > 0) {
      return expenses.map(e => {
        let newExpense = { ...e };
        // 결제자 보정
        if (!effectiveParticipants.some(f => f.id === e.paidById)) {
          const found = effectiveParticipants.find(f => f.name === e.paidById);
          if (found) newExpense.paidById = found.id;
        }
        // 분배자(splitAmongIds) 보정
        if (Array.isArray(e.splitAmongIds)) {
          newExpense.splitAmongIds = e.splitAmongIds.map((idOrName: string) => {
            // id로 매칭 안되면 name으로 매칭
            const found = effectiveParticipants.find(f => f.id === idOrName || f.name === idOrName);
            return found ? found.id : idOrName;
          });
        }
        return newExpense;
      });
    }
    return expenses;
  }, [expenses, meeting, effectiveParticipants]);

  // settlementSuggestions useMemo 중복 선언 제거, mappedExpenses 사용
  const settlementSuggestions = useMemo(() => {
    // 1. 개인별 최종 정산액(finalAmount) 계산
    const people = effectiveParticipants.map(p => {
      const totalPaid = mappedExpenses.filter(e => e.paidById === p.id).reduce((sum, e) => sum + e.totalAmount, 0);
      const shouldPay = perPersonCostDetails.perPersonCostWithFund[p.id] || 0;
      const finalAmount = parseFloat((totalPaid - shouldPay).toFixed(2));
      return { friendId: p.id, finalAmount };
    });
    // 2. 내림차순 정렬 (많이 받을 사람부터)
    const sorted = [...people].sort((a, b) => b.finalAmount - a.finalAmount);
    // 3. 회비 지원 송금 제안 (받을 돈이 있는 사람부터 회비에서 지급)
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
    // 4. 남은 금액 기준으로 일반 송금 제안 (그리디 매칭)
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
    return { fundPayouts, suggestions };
  }, [mappedExpenses, effectiveParticipants, perPersonCostDetails]);
  
  // getFriendName: allFriends와 effectiveParticipants 모두에서 찾도록 개선
  const getFriendName = (friendId: string) => {
    const friend = allFriends.find(f => f.id === friendId)
      || effectiveParticipants.find(f => f.id === friendId);
    if (!friend) return '알 수 없음';
    return friend.name + (friend.description ? ` (${friend.description})` : '');
  };

  if (participants.length === 0 && meeting.isTemporary && Array.isArray(meeting.temporaryParticipants) && meeting.temporaryParticipants.length > 0) {
    // 임시 모임: temporaryParticipants 이름만 표시
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
          {participants.length > 0 && (
            <div>
              참여자 1인당 부담액 (회비 적용 전): {perPersonCostDetails.perPersonCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
            </div>
          )}
          {perPersonCostDetails.fundUsed > 0.01 && (
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
            {/* --- 개인별 최종 정산 현황 --- */}
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
                  {/* Removed h3 and CardDescription as per request */}
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
                          {effectiveParticipants.map((p, idx) => {
                            const totalPaid = mappedExpenses.filter(e => e.paidById === p.id).reduce((sum, e) => sum + e.totalAmount, 0);
                            const shouldPay = perPersonCostDetails.perPersonCostWithFund[p.id] || 0;
                            const finalAmount = parseFloat((totalPaid - shouldPay).toFixed(2));
                            return (
                              <TableRow key={p.id}>
                                <TableCell className="font-medium flex items-center">
                                  <UserCircle className="h-4 w-4 mr-2 opacity-70" />
                                  {p.name}
                                </TableCell>
                                <TableCell className="text-right">{totalPaid ? totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 }) + '원' : '-'}</TableCell>
                                <TableCell className="text-right">{shouldPay ? shouldPay.toLocaleString(undefined, { maximumFractionDigits: 0 }) + '원' : '-'}</TableCell>
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
                </div>
              ) : (
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
                          const totalPaid = mappedExpenses.filter(e => e.paidById === p.id).reduce((sum, e) => sum + e.totalAmount, 0);
                          const shouldPay = perPersonCostDetails.perPersonCostWithFund[p.id] || 0;
                          const finalAmount = parseFloat((totalPaid - shouldPay).toFixed(2));
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
                      </TableBody>
                    </Table>
                  </ScrollArea>
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
                        {/* 회비에서 결제자에게 송금된 내역 먼저 표시 */}
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
                        {/* 일반 송금 제안: 기존 개인별 최종 정산 현황(본인부담액 반영) 기준으로만 계산 */}
                        {settlementSuggestions.suggestions.map((debt, index) => (
                          <TableRow key={`suggestion-${index}`}>
                            <TableCell>{getFriendName(debt.from)}</TableCell>
                            <TableCell>{getFriendName(debt.to)}</TableCell>
                            <TableCell className="text-right font-medium">
                              {debt.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}원
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">일반 정산</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
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
