import type { Expense, Friend, Meeting } from './types';
import { calculateReserveFundBreakdown, type ReserveFundBreakdown } from './reserve-fund-settlement';
import { amountForParticipant, compareParticipantIds, normalizeWon, uniqueParticipantIds } from './settlement-money';
import { isUnresolvedParticipantName, recordedParticipantName } from './participant-names';

export type SettlementParticipant = {
  friendId: string;
  name: string;
  description: string;
  totalPaid: number;
  expenseContribution: number;
  fundContribution: number;
  shouldPay: number;
  /** Positive means money to receive; negative means money to send. */
  finalAmount: number;
};

export type SettlementTransfer = {
  /** null represents the reserve fund, avoiding collisions with participant IDs. */
  from: string | null;
  to: string;
  amount: number;
  kind: 'participant' | 'fund' | 'refund';
};

/** Serializable immutable result saved when settlement is finalized. */
export type SettlementSnapshot = {
  version: 1;
  currency: 'KRW';
  totalSpent: number;
  participantCostTotal: number;
  participants: SettlementParticipant[];
  namesById: Record<string, string>;
  transfers: SettlementTransfer[];
  reserveFund: ReserveFundBreakdown;
  warnings: string[];
};

/** Refresh missing display labels without recalculating or writing an immutable financial result. */
export function restoreSettlementNames(snapshot: SettlementSnapshot, meeting: Meeting, friends: Pick<Friend, 'id' | 'name'>[]): SettlementSnapshot {
  const directory = new Map(friends.map(friend => [friend.id, friend]));
  const names = Object.fromEntries(Object.entries(snapshot.namesById).map(([id, name]) => [id,
    isUnresolvedParticipantName(name) ? recordedParticipantName(meeting, id, directory.get(id)) : name]));
  return { ...snapshot, namesById: names, participants: snapshot.participants.map(person => ({ ...person,
    name: isUnresolvedParticipantName(person.name) ? names[person.friendId] || recordedParticipantName(meeting, person.friendId, directory.get(person.friendId)) : person.name })) };
}

/** Ignore an incompatible stored result rather than rendering a partial shape. */
export function isSettlementSnapshot(value: unknown): value is SettlementSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<SettlementSnapshot>;
  const validAmount = (amount: unknown): amount is number => typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0;
  return snapshot.version === 1 && snapshot.currency === 'KRW' &&
    validAmount(snapshot.totalSpent) && validAmount(snapshot.participantCostTotal) &&
    Array.isArray(snapshot.participants) && Array.isArray(snapshot.transfers) && Array.isArray(snapshot.warnings) &&
    snapshot.warnings.every(warning => typeof warning === 'string') &&
    Boolean(snapshot.namesById && typeof snapshot.namesById === 'object' && !Array.isArray(snapshot.namesById) &&
      Object.values(snapshot.namesById).every(name => typeof name === 'string') && snapshot.reserveFund &&
      validAmount(snapshot.reserveFund.baseFundUsed) && validAmount(snapshot.reserveFund.refundTotal) && validAmount(snapshot.reserveFund.totalFundUsed)) &&
    snapshot.participants.every(person => person && typeof person.friendId === 'string' && typeof person.name === 'string' &&
      [person.totalPaid, person.expenseContribution, person.fundContribution, person.shouldPay].every(validAmount) &&
      Number.isSafeInteger(person.finalAmount) && person.finalAmount === person.totalPaid - person.shouldPay &&
      person.shouldPay === person.expenseContribution - person.fundContribution) &&
    snapshot.transfers.every(transfer => transfer && (transfer.from === null || typeof transfer.from === 'string') && typeof transfer.to === 'string' &&
      validAmount(transfer.amount) && transfer.amount > 0 && ['participant', 'fund', 'refund'].includes(transfer.kind)) &&
    snapshot.participants.reduce((sum, person) => sum + person.totalPaid, 0) === snapshot.totalSpent &&
    snapshot.participants.reduce((sum, person) => sum + person.expenseContribution, 0) === snapshot.totalSpent &&
    snapshot.participants.reduce((sum, person) => sum + person.shouldPay, 0) === snapshot.participantCostTotal;
}

type ParticipantName = Pick<Friend, 'id' | 'name'> & Partial<Pick<Friend, 'description'>>;
type TemporaryParticipant = { id?: string; name: string };

function temporaryParticipants(meeting: Meeting): ParticipantName[] {
  const entries: TemporaryParticipant[] = meeting.temporaryParticipants || [];
  return entries.map((entry, index) => ({
    id: entry.id || (entries.filter(other => other.name === entry.name).length === 1 ? entry.name : `legacy-temporary:${index}`),
    name: entry.name,
  }));
}

export function getMeetingParticipantIds(meeting: Meeting): string[] {
  return uniqueParticipantIds(meeting.isTemporary ? temporaryParticipants(meeting).map(participant => participant.id) : meeting.participantIds || []);
}

function referenceResolver(meeting: Meeting) {
  const participants = meeting.isTemporary ? temporaryParticipants(meeting) : [];
  return (reference: string) => {
    if (!participants.length || participants.some(participant => participant.id === reference)) return reference;
    const matchingNames = participants.filter(participant => participant.name === reference);
    // Ambiguous old names stay separate from identified people until corrected.
    return matchingNames.length === 1 ? matchingNames[0].id : reference;
  };
}

export function normalizeExpenseReferences(meeting: Meeting, expenses: Expense[]): Expense[] {
  const resolve = referenceResolver(meeting);
  return expenses.map(expense => ({
    ...expense,
    paidById: resolve(expense.paidById),
    ...(expense.splitAmongIds ? { splitAmongIds: expense.splitAmongIds.map(resolve) } : {}),
    ...(expense.customSplits ? { customSplits: expense.customSplits.map(split => ({ ...split, friendId: resolve(split.friendId) })) } : {}),
  }));
}

export function calculateSettlement({ meeting, expenses, participants = [], allFriends = [] }: {
  meeting: Meeting;
  expenses: Expense[];
  participants?: ParticipantName[];
  allFriends?: ParticipantName[];
}): SettlementSnapshot {
  const warnings: string[] = [];
  const mappedExpenses = normalizeExpenseReferences(meeting, expenses);
  const meetingIds = getMeetingParticipantIds(meeting);
  const referencedIds = mappedExpenses.flatMap(expense => [expense.paidById, ...(expense.splitType === 'custom'
    ? expense.customSplits?.map(split => split.friendId) || []
    : expense.splitAmongIds || [])]);
  // A missing/deleted friend must never redistribute their historical obligation.
  const participantIds = uniqueParticipantIds([...meetingIds, ...referencedIds]);
  if (referencedIds.some(id => !meetingIds.includes(id))) warnings.push('현재 참여자 목록에 없는 과거 지출의 참여자도 정산에 포함했습니다.');
  const temporary = meeting.isTemporary ? temporaryParticipants(meeting) : [];
  if (temporary.some((participant, index) => temporary.some((other, otherIndex) => index !== otherIndex && participant.name === other.name)) &&
      mappedExpenses.some(expense => [expense.paidById, ...(expense.splitAmongIds || []), ...(expense.customSplits?.map(split => split.friendId) || [])]
        .some(reference => temporary.filter(participant => participant.name === reference).length > 1 && !temporary.some(participant => participant.id === reference)))) {
    warnings.push('기존 임시 모임의 동명이인 지출은 이름만으로 구분할 수 없습니다. 지출의 결제자와 분배 대상을 확인해주세요.');
  }
  if (mappedExpenses.some(expense => !Number.isSafeInteger(expense.totalAmount) || expense.customSplits?.some(split => !Number.isSafeInteger(split.amount)))) {
    warnings.push('기존 소수점 지출은 총액을 원 단위로 반올림하고 분배 비율에 따라 나머지를 배분했습니다. 저장된 원본 금액은 유지됩니다.');
  }
  if (mappedExpenses.some(expense => expense.splitType === 'custom' && expense.customSplits?.reduce((sum, split) => sum + split.amount, 0) !== expense.totalAmount)) {
    warnings.push('기존 개별 분배의 합계가 지출 총액과 달라 입력된 비율로 총액을 배분했습니다.');
  }
  if (mappedExpenses.some(expense => expense.splitType === 'equally' && !expense.splitAmongIds?.length)) {
    warnings.push('분배 대상이 없는 기존 지출은 모임 참여자에게 균등 배분했습니다.');
  }

  const resolve = referenceResolver(meeting);
  const settings = {
    ...meeting,
    nonReserveFundParticipants: (meeting.nonReserveFundParticipants || []).map(resolve),
    reserveFundRefundRecipientIds: (meeting.reserveFundRefundRecipientIds || []).map(resolve),
  };
  const reserveFund = calculateReserveFundBreakdown({ settings, expenses: mappedExpenses, participantIds });
  const directory = new Map([...allFriends, ...participants, ...temporary].map(participant => [participant.id, participant]));
  const namesById: Record<string, string> = Object.create(null);
  for (const id of [...participantIds, ...reserveFund.refundRecipientIds]) {
    namesById[id] = recordedParticipantName(meeting, id, directory.get(id));
  }
  const totalPaidById: Record<string, number> = Object.create(null);
  let totalSpent = 0;
  for (const expense of mappedExpenses) {
    const amount = normalizeWon(expense.totalAmount);
    totalSpent += amount;
    totalPaidById[expense.paidById] = (totalPaidById[expense.paidById] || 0) + amount;
  }
  const rows: SettlementParticipant[] = participantIds.map(friendId => {
    const totalPaid = totalPaidById[friendId] || 0;
    const shouldPay = reserveFund.perPersonCostWithFund[friendId] || 0;
    return {
      friendId,
      name: namesById[friendId],
      description: directory.get(friendId)?.description || '',
      totalPaid,
      expenseContribution: reserveFund.individualExpenseContributions[friendId] || 0,
      fundContribution: amountForParticipant(reserveFund.fundContributionById, friendId),
      shouldPay,
      finalAmount: totalPaid - shouldPay,
    };
  });
  const transfers: SettlementTransfer[] = [];
  const balances = rows.map(row => ({ id: row.friendId, amount: row.finalAmount }));
  const descendingBalance = (a: { id: string; amount: number }, b: { id: string; amount: number }) => b.amount - a.amount || compareParticipantIds(a.id, b.id);
  let fundLeft = reserveFund.baseFundUsed;
  for (const receiver of [...balances].sort(descendingBalance)) {
    const amount = Math.min(Math.max(receiver.amount, 0), fundLeft);
    if (amount) {
      transfers.push({ from: null, to: receiver.id, amount, kind: 'fund' });
      receiver.amount -= amount;
      fundLeft -= amount;
    }
  }
  const senders = balances.filter(row => row.amount < 0).sort((a, b) => a.amount - b.amount || compareParticipantIds(a.id, b.id));
  const receivers = balances.filter(row => row.amount > 0).sort(descendingBalance);
  let senderIndex = 0;
  let receiverIndex = 0;
  while (senderIndex < senders.length && receiverIndex < receivers.length) {
    const sender = senders[senderIndex];
    const receiver = receivers[receiverIndex];
    const amount = Math.min(-sender.amount, receiver.amount);
    transfers.push({ from: sender.id, to: receiver.id, amount, kind: 'participant' });
    sender.amount += amount;
    receiver.amount -= amount;
    if (sender.amount === 0) senderIndex++;
    if (receiver.amount === 0) receiverIndex++;
  }
  for (const id of reserveFund.refundRecipientIds) {
    if (reserveFund.refundById[id]) transfers.push({ from: null, to: id, amount: reserveFund.refundById[id], kind: 'refund' });
  }
  return { version: 1, currency: 'KRW', totalSpent, participantCostTotal: totalSpent - reserveFund.baseFundUsed, participants: rows, namesById: Object.fromEntries(Object.entries(namesById)), transfers, reserveFund, warnings };
}
