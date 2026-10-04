'use client';

import React, { useMemo } from 'react';
import type { Expense, Friend, Meeting } from '@/lib/types';
import { calculateSettlement, isSettlementSnapshot, restoreSettlementNames, type SettlementParticipant, type SettlementTransfer } from '@/lib/settlement';
import { isUnresolvedParticipantName } from '@/lib/participant-names';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, CheckCircle2, PiggyBank } from 'lucide-react';

interface PaymentSummaryProps {
  meeting: Meeting;
  expenses: Expense[];
  participants: Friend[];
  allFriends: Friend[];
}

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`;
const balanceLabel = (person: SettlementParticipant) => person.finalAmount > 0 ? '받을 금액' : person.finalAmount < 0 ? '보낼 금액' : '추가 정산 없음';
const balanceClass = (person: SettlementParticipant) => person.finalAmount > 0 ? 'text-emerald-600 dark:text-emerald-400' : person.finalAmount < 0 ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground';

function TransferGroup({ title, id, transfers, nameFor }: {
  title: string; id: string; transfers: SettlementTransfer[]; nameFor: (id: string | null) => string;
}) {
  if (!transfers.length) return null;
  const total = transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
  // Stored snapshots can interleave senders. Group the view without changing the saved amounts.
  const bySender = new Map<string | null, SettlementTransfer[]>();
  for (const transfer of transfers) {
    const rows = bySender.get(transfer.from) || [];
    rows.push(transfer);
    bySender.set(transfer.from, rows);
  }
  return <section aria-labelledby={id} className="overflow-hidden rounded-lg border">
    <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-4 py-3">
      <h4 id={id} className="text-sm font-semibold">{title}</h4>
      {transfers.length > 1 && <p className="text-sm tabular-nums text-muted-foreground">합계 {won(total)}</p>}
    </div>
    <ul className="divide-y">
      {Array.from(bySender, ([sender, rows]) => <li key={sender ?? 'reserve-fund'}>
        {sender !== null && rows.length > 1 && <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 bg-muted/20 px-4 py-2 text-xs"><span className="font-medium">보내는 사람: {nameFor(sender)}</span><span className="text-muted-foreground tabular-nums">보낼 합계 {won(rows.reduce((sum, row) => sum + row.amount, 0))}</span></div>}
        <ul className="divide-y divide-border/50">{rows.map((transfer, index) => <li key={`${transfer.to}-${index}`} className="flex items-start justify-between gap-3 px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0 text-sm leading-6">
          <span className="break-words font-medium">{nameFor(transfer.from)}</span>
          <ArrowRight aria-label="송금 대상" className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="break-words font-medium">{nameFor(transfer.to)}</span>
        </div>
        <span className="shrink-0 whitespace-nowrap text-sm font-semibold leading-6 tabular-nums">{won(transfer.amount)}</span>
        </li>)}</ul>
      </li>)}
    </ul>
  </section>;
}

export function PaymentSummary({ meeting, expenses, participants, allFriends }: PaymentSummaryProps) {
  const settlement = useMemo(() => {
    const saved = meeting.settlementSnapshot;
    return meeting.isSettled && isSettlementSnapshot(saved)
      ? restoreSettlementNames(saved, meeting, [...allFriends, ...participants])
      : calculateSettlement({ meeting, expenses, participants, allFriends });
  }, [meeting, expenses, participants, allFriends]);
  const fund = settlement.reserveFund;
  const nameFor = (id: string | null) => id === null ? '모임 회비' : settlement.namesById[id] || '이름 확인 필요';
  const hasSavedSettlement = meeting.isSettled && isSettlementSnapshot(meeting.settlementSnapshot);
  const hasExpenses = expenses.length > 0 || settlement.totalSpent > 0;
  const showFund = meeting.useReserveFund || fund.totalFundUsed > 0 || fund.configuredFundAmount > 0;
  const missingNames = Object.values(settlement.namesById).filter(name => isUnresolvedParticipantName(name)).length;
  const participantTransfers = settlement.transfers.filter(transfer => transfer.kind === 'participant');
  const fundTransfers = settlement.transfers.filter(transfer => transfer.kind === 'fund');
  const refundTransfers = settlement.transfers.filter(transfer => transfer.kind === 'refund');

  return <Card>
    <CardHeader className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-xl"><h2>정산 요약</h2></CardTitle>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">참여자 {settlement.participants.length}명</Badge>
          {meeting.isSettled ? <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />금액 확정</Badge> : <Badge variant="outline">정산 미리보기</Badge>}
        </div>
      </div>
      <CardDescription>{hasSavedSettlement ? '확정할 때 저장한 금액입니다. 실제 송금 여부는 별도로 확인해주세요.' : meeting.isSettled ? '기존 지출로 정산을 재구성한 금액입니다. 과거 송금 내역과 다를 수 있습니다.' : '등록된 지출과 회비 설정을 기준으로 계산한 금액입니다.'}</CardDescription>
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <dl aria-label="참여자 부담 합계">
          <dt className="text-sm font-medium text-muted-foreground">참여자 부담 합계</dt>
          <dd className="mt-2 break-words text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">{hasExpenses ? won(settlement.participantCostTotal) : '계산 대기'}</dd>
        </dl>
        <p className="mt-2 text-sm text-muted-foreground">{hasExpenses ? '회비 적용 후 참여자들이 최종적으로 부담하는 비용의 합계입니다. 이미 결제한 금액이 포함되어 있으므로, 추가로 보낼 금액은 아래 송금 안내를 확인해주세요.' : '지출을 등록하면 참여자별 부담금과 송금 금액이 표시됩니다.'}</p>
        {hasExpenses && <p aria-label="부담금 계산식" className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-primary/10 pt-3 text-sm">
          <span>총 지출 <strong className="font-medium tabular-nums">{won(settlement.totalSpent)}</strong></span>
          <span aria-hidden="true">−</span>
          <span>참가자에 적용한 회비 <strong className="font-medium tabular-nums">{won(fund.baseFundUsed)}</strong></span>
          <span aria-hidden="true">=</span>
          <strong className="tabular-nums">{won(settlement.participantCostTotal)}</strong>
        </p>}
      </div>
    </CardHeader>
    <CardContent className="space-y-7">
      {missingNames > 0 && <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">이름 기록을 찾을 수 없는 참여자가 {missingNames}명 있습니다. ‘이름 확인 필요’로 표시하고 해당 참여자의 금액과 기록은 유지합니다.</p>}
      {settlement.warnings.length > 0 && <div role="status" className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{settlement.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>}

      {showFund && <section aria-labelledby="settlement-fund-title" className="space-y-3">
        <h3 id="settlement-fund-title" className="flex items-center gap-2 font-semibold"><PiggyBank aria-hidden="true" className="h-4 w-4 text-primary" />회비 적용 내역</h3>
        <dl className="grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-3">
          <div><dt className="text-sm text-muted-foreground">참가자 지출 지원</dt><dd className="mt-1 font-semibold tabular-nums">{won(fund.baseFundUsed)}</dd></div>
          <div><dt className="text-sm text-muted-foreground">미참가자 환급</dt><dd className="mt-1 font-semibold tabular-nums">{won(fund.refundTotal)}</dd></div>
          <div><dt className="text-sm text-muted-foreground">총 회비 사용액</dt><dd className="mt-1 font-semibold tabular-nums">{won(fund.totalFundUsed)}</dd></div>
        </dl>
        <p className="text-sm text-muted-foreground">참가자 지출 지원액은 회비에서 결제자에게 지급하는 금액입니다. 참여자별 ‘적용한 회비’와 같은 지원을 나타내며, 두 번 지급하는 금액이 아닙니다.{!meeting.isSettled && ' 현재는 정산 확정 전의 예정 금액입니다.'}</p>
        {meeting.reserveFundCoverAll ? <p className="text-sm text-muted-foreground">참가자 비용 전액 자동 지원{!meeting.isSettled && ' · 지출과 지원 제외 설정이 바뀌면 지원액도 자동으로 바뀝니다.'}</p> : fund.configuredFundAmount > 0 && <p className="text-sm text-muted-foreground">참가자 지원 예산 {won(fund.configuredFundAmount)} · 미사용 지원 예산 {won(fund.configuredFundLeft)}</p>}
        {fund.refundTotal > 0 && <p className="text-sm text-muted-foreground">미참가자 환급은 참가자 지원에 추가로 회비에서 지급합니다. 위의 참여자 부담 합계에서는 참가자 지출 지원액만 차감합니다.</p>}
      </section>}

      <section aria-labelledby="settlement-transfers-title" className="space-y-3">
        <div><h3 id="settlement-transfers-title" className="font-semibold">송금 안내</h3><p className="mt-1 text-sm text-muted-foreground">{hasExpenses ? '먼저 결제한 금액을 반영한 송금 안내입니다. 실제 송금 완료 여부는 직접 확인해주세요.' : '지출 내역을 등록하면 송금 대상과 금액을 확인할 수 있습니다.'}</p></div>
        {settlement.transfers.length ? <div className="space-y-3">
          <TransferGroup title="참여자 간 송금" id="participant-transfers-title" transfers={participantTransfers} nameFor={nameFor} />
          <TransferGroup title="회비에서 결제자에게 지급" id="fund-transfers-title" transfers={fundTransfers} nameFor={nameFor} />
          <TransferGroup title="회비에서 미참가자에게 환급" id="refund-transfers-title" transfers={refundTransfers} nameFor={nameFor} />
        </div> : <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{hasExpenses ? '현재 계산 결과에서 추가로 송금할 금액이 없습니다.' : '아직 계산할 지출 내역이 없습니다.'}</p>}
      </section>

      {hasExpenses && settlement.participants.length > 0 && <section aria-labelledby="settlement-participants-title" className="space-y-3">
        <div><h3 id="settlement-participants-title" className="font-semibold">참여자별 부담 내역</h3><p className="mt-1 text-sm text-muted-foreground">최종 부담액과 먼저 결제한 금액의 차이를 정산합니다. 받을 금액에는 회비에서 지급받는 금액도 포함됩니다.</p>{showFund && <p className="mt-1 text-sm text-muted-foreground">참가자 {settlement.participants.length}명 중 회비 지원 대상 {fund.fundApplicableIds.length}명 · 회비 지원 제외 {fund.fundNonApplicableIds.length}명. 미참가자 환급은 위 송금 안내에 따로 표시합니다.</p>}</div>
        <div className="space-y-3 sm:hidden">
          {settlement.participants.map(person => <div key={person.friendId} className="rounded-lg border p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{person.name}{person.description && <span className="ml-1 text-xs text-muted-foreground">({person.description})</span>}{showFund && <span className="mt-1 block text-xs font-normal text-muted-foreground">{fund.fundNonApplicableIds.includes(person.friendId) ? '회비 지원 제외' : '회비 지원 대상'}</span>}</span><span className={`text-sm font-medium ${balanceClass(person)}`}>{balanceLabel(person)}{person.finalAmount !== 0 && ` ${won(Math.abs(person.finalAmount))}`}</span></div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">먼저 결제한 금액</dt><dd className="text-right tabular-nums">{won(person.totalPaid)}</dd>
              {showFund && <><dt className="text-muted-foreground">회비 적용 전 부담</dt><dd className="text-right tabular-nums">{won(person.expenseContribution)}</dd><dt className="text-muted-foreground">적용한 회비</dt><dd className="text-right tabular-nums">{won(person.fundContribution)}</dd></>}
              <dt className="text-muted-foreground">최종 부담액</dt><dd className="text-right font-medium tabular-nums">{won(person.shouldPay)}</dd>
            </dl>
          </div>)}
        </div>
        <div className="hidden overflow-x-auto rounded-lg border sm:block">
          <Table>
            <TableHeader><TableRow><TableHead>참여자</TableHead><TableHead className="text-right">먼저 결제한 금액</TableHead>{showFund && <TableHead className="text-right">적용한 회비</TableHead>}<TableHead className="text-right">최종 부담액</TableHead><TableHead className="text-right">받을 금액 / 보낼 금액</TableHead></TableRow></TableHeader>
            <TableBody>{settlement.participants.map(person => <TableRow key={person.friendId}>
              <TableCell className="font-medium">{person.name}{person.description && <span className="ml-1 text-xs text-muted-foreground">({person.description})</span>}{showFund && <span className="mt-1 block whitespace-nowrap text-xs font-normal text-muted-foreground">{fund.fundNonApplicableIds.includes(person.friendId) ? '회비 지원 제외' : '회비 지원 대상'}</span>}</TableCell>
              <TableCell className="text-right tabular-nums">{won(person.totalPaid)}</TableCell>{showFund && <TableCell className="text-right tabular-nums">{won(person.fundContribution)}</TableCell>}<TableCell className="text-right tabular-nums">{won(person.shouldPay)}</TableCell>
              <TableCell className={`text-right font-medium tabular-nums ${balanceClass(person)}`}>{balanceLabel(person)}{person.finalAmount !== 0 && ` ${won(Math.abs(person.finalAmount))}`}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </div>
      </section>}
    </CardContent>
    <CardFooter>
      <details className="w-full rounded-lg border p-4 text-sm">
        <summary className="cursor-pointer font-medium">계산 기준과 정산 상태</summary>
        <ul className="mt-3 space-y-2 leading-relaxed text-muted-foreground">
          <li>금액은 1원 단위로 계산하고, 나누어떨어지지 않는 금액은 고정된 순서로 배분합니다.</li>
          {showFund && <li>회비는 참가자의 지출 분담 비율에 따라 지원하며, 해당 참가자의 부담액을 넘지 않습니다.</li>}
          <li>금액 확정은 계산 결과를 저장하는 단계입니다. 송금 완료 여부는 별도로 확인해주세요.</li>
          {meeting.isTemporary && <li>임시 모임의 회비 설정은 참고 정보이며, 정산 금액은 등록된 지출을 기준으로 계산합니다.</li>}
          {meeting.isSettled && !hasSavedSettlement && typeof meeting.settledReserveFundAmount === 'number' && <li>기존에 기록된 회비 사용액: {won(meeting.settledReserveFundAmount)}. 위의 재구성 금액과 다를 수 있습니다.</li>}
        </ul>
      </details>
    </CardFooter>
  </Card>;
}
