import { describe, expect, it } from 'vitest';
import type { Expense, Meeting } from '../types';
import { calculateSettlement, getMeetingParticipantIds, isSettlementSnapshot, normalizeExpenseReferences, type SettlementSnapshot } from '../settlement';
import { calculateReserveFundBreakdown } from '../reserve-fund-settlement';
import { allocateEqually } from '../settlement-money';

const meeting = (overrides: Partial<Meeting> = {}): Meeting => ({
  id: 'meeting', name: '모임', dateTime: new Date('2026-10-04'), locationName: '서울', creatorId: 'user',
  participantIds: ['a', 'b', 'c'], createdAt: new Date('2026-10-04'), useReserveFund: false,
  nonReserveFundParticipants: [], groupId: 'group', ...overrides,
});
const expense = (overrides: Partial<Expense> = {}): Expense => ({
  id: 'expense', meetingId: 'meeting', description: '식사', totalAmount: 10000,
  paidById: 'a', splitType: 'equally', splitAmongIds: ['a', 'b', 'c'], createdAt: new Date('2026-10-04'), ...overrides,
});
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
function expectConserved(snapshot: SettlementSnapshot) {
  expect(sum(snapshot.participants.map(person => person.expenseContribution))).toBe(snapshot.totalSpent);
  expect(sum(snapshot.participants.map(person => person.totalPaid))).toBe(snapshot.totalSpent);
  expect(sum(snapshot.participants.map(person => person.shouldPay))).toBe(snapshot.participantCostTotal);
  expect(sum(snapshot.transfers.filter(transfer => transfer.kind === 'fund').map(transfer => transfer.amount))).toBe(snapshot.reserveFund.baseFundUsed);
  expect(sum(snapshot.transfers.filter(transfer => transfer.kind === 'refund').map(transfer => transfer.amount))).toBe(snapshot.reserveFund.refundTotal);
  for (const person of snapshot.participants) {
    const incoming = sum(snapshot.transfers.filter(transfer => transfer.to === person.friendId).map(transfer => transfer.amount));
    const outgoing = sum(snapshot.transfers.filter(transfer => transfer.from === person.friendId).map(transfer => transfer.amount));
    expect(incoming - outgoing).toBe(person.finalAmount);
    expect(person.shouldPay).toBeGreaterThanOrEqual(0);
    expect(Number.isSafeInteger(person.shouldPay)).toBe(true);
  }
  expect(snapshot.transfers.every(transfer => Number.isSafeInteger(transfer.amount) && transfer.amount > 0)).toBe(true);
}

describe('integer won settlement', () => {
  it('conserves 10,000 won split between three people and deterministically assigns the remainder', () => {
    expect(allocateEqually(10000, ['c', 'a', 'b'])).toEqual({ a: 3334, b: 3333, c: 3333 });
    const snapshot = calculateSettlement({ meeting: meeting(), expenses: [expense()] });
    expect(snapshot.transfers).toEqual([
      { from: 'b', to: 'a', amount: 3333, kind: 'participant' },
      { from: 'c', to: 'a', amount: 3333, kind: 'participant' },
    ]);
    expectConserved(snapshot);
    expect(isSettlementSnapshot(JSON.parse(JSON.stringify(snapshot)))).toBe(true);
    expect(isSettlementSnapshot({ version: 2 })).toBe(false);
    expect(Object.getPrototypeOf(snapshot.namesById)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(snapshot.reserveFund.fundContributionById)).toBe(Object.prototype);
  });

  it('covers custom obligations proportionally without negative costs', () => {
    const snapshot = calculateSettlement({ meeting: meeting({ useReserveFund: true, partialReserveFundAmount: 6001 }), expenses: [expense({
      splitType: 'custom', customSplits: [{ friendId: 'a', amount: 100 }, { friendId: 'b', amount: 9900 }, { friendId: 'c', amount: 0 }],
    })] });
    expect(snapshot.reserveFund.fundContributionById).toEqual({ a: 60, b: 5941, c: 0 });
    expect(snapshot.participants.map(person => person.shouldPay)).toEqual([40, 3959, 0]);
    expectConserved(snapshot);
  });

  it('supports partial fund use, exclusions, and additional non-attendee refunds', () => {
    const snapshot = calculateSettlement({ meeting: meeting({
      useReserveFund: true, partialReserveFundAmount: 5001, nonReserveFundParticipants: ['c'],
      refundReserveFundToNonParticipants: true, reserveFundRefundRecipientIds: ['z', 'x', 'z', 'a'],
    }), expenses: [expense()] });
    expect(snapshot.reserveFund.baseFundUsed).toBe(5001);
    expect(snapshot.reserveFund.refundTotal).toBe(5001);
    expect(snapshot.reserveFund.refundById).toEqual({ x: 2501, z: 2500 });
    expect(snapshot.reserveFund.totalFundUsed).toBe(10002);
    expect(snapshot.participants.find(person => person.friendId === 'c')?.shouldPay).toBe(3333);
    expectConserved(snapshot);
  });

  it('caps full support at each obligation and leaves excess configured funds unused', () => {
    const snapshot = calculateSettlement({ meeting: meeting({ useReserveFund: true, partialReserveFundAmount: 20000 }), expenses: [expense()] });
    expect(snapshot.reserveFund.configuredFundLeft).toBe(10000);
    expect(snapshot.participants.every(person => person.shouldPay === 0)).toBe(true);
    expectConserved(snapshot);
  });

  it('retains historical split members and payer when absent from current friend or participant lists', () => {
    const snapshot = calculateSettlement({ meeting: meeting({ participantIds: ['b'] }), expenses: [expense({ totalAmount: 1000, splitAmongIds: ['a', 'b'] })] });
    expect(snapshot.participants.map(person => [person.friendId, person.shouldPay])).toEqual([['a', 500], ['b', 500]]);
    expect(snapshot.warnings).toContain('현재 참여자 목록에 없는 과거 지출의 참여자도 정산에 포함했습니다.');
    expectConserved(snapshot);
  });

  it('normalizes legacy fractional custom values without changing the source', () => {
    const original = expense({ totalAmount: 10000.2, splitType: 'custom', customSplits: [
      { friendId: 'a', amount: 3333.4 }, { friendId: 'b', amount: 3333.4 }, { friendId: 'c', amount: 3333.4 },
    ] });
    const snapshot = calculateSettlement({ meeting: meeting(), expenses: [original] });
    expect(snapshot.totalSpent).toBe(10000);
    expect(snapshot.participants.map(person => person.shouldPay)).toEqual([3334, 3333, 3333]);
    expect(original.totalAmount).toBe(10000.2);
    expect(original.customSplits?.[0].amount).toBe(3333.4);
    expect(snapshot.warnings.length).toBeGreaterThan(0);
    expectConserved(snapshot);
  });

  it('keeps identified temporary participants with duplicate names distinct', () => {
    const temporary = meeting({ isTemporary: true, temporaryParticipants: [{ id: 'temp-a', name: '민수' }, { id: 'temp-b', name: '민수' }] });
    const snapshot = calculateSettlement({ meeting: temporary, expenses: [expense({ totalAmount: 1001, paidById: 'temp-a', splitAmongIds: ['temp-a', 'temp-b'] })] });
    expect(getMeetingParticipantIds(temporary)).toEqual(['temp-a', 'temp-b']);
    expect(snapshot.participants.map(person => person.shouldPay)).toEqual([501, 500]);
    expect(snapshot.warnings).toEqual([]);
    expectConserved(snapshot);
  });

  it('preserves legacy unique name IDs and maps unique name references to new IDs', () => {
    const legacy = meeting({ isTemporary: true, temporaryParticipants: [{ name: '지수' }, { name: '민수' }] });
    expect(getMeetingParticipantIds(legacy)).toEqual(['민수', '지수']);
    const temporary = meeting({ isTemporary: true, temporaryParticipants: [{ id: 'new-id', name: '지수' }] });
    expect(normalizeExpenseReferences(temporary, [expense({ paidById: '지수', splitType: 'custom', customSplits: [{ friendId: '지수', amount: 10000 }] })])[0].customSplits?.[0].friendId).toBe('new-id');
  });

  it('flags ambiguous legacy duplicate names instead of assigning expenses arbitrarily', () => {
    const temporary = meeting({ isTemporary: true, temporaryParticipants: [{ name: '민수' }, { name: '민수' }] });
    const snapshot = calculateSettlement({ meeting: temporary, expenses: [expense({ totalAmount: 1000, paidById: '민수', splitAmongIds: ['민수'] })] });
    expect(snapshot.warnings.some(warning => warning.includes('동명이인'))).toBe(true);
    expect(snapshot.participants.find(person => person.friendId === '민수')?.expenseContribution).toBe(1000);
    expectConserved(snapshot);
  });

  it('is independent of expense order, participant order, and split order', () => {
    const expenses = [expense(), expense({ id: 'other', totalAmount: 12347, paidById: 'c', splitAmongIds: ['c', 'b'] })];
    const first = calculateSettlement({ meeting: meeting({ useReserveFund: true, partialReserveFundAmount: 9999 }), expenses });
    const second = calculateSettlement({ meeting: meeting({ useReserveFund: true, partialReserveFundAmount: 9999, participantIds: ['c', 'b', 'a'] }), expenses: [...expenses].reverse().map(item => ({ ...item, splitAmongIds: [...(item.splitAmongIds || [])].reverse() })) });
    expect(second).toEqual(first);
    expectConserved(first);
  });

  it('keeps a temporary name that matches an Object prototype property as a valid ID', () => {
    const snapshot = calculateSettlement({ meeting: meeting({ participantIds: ['__proto__', 'constructor', 'toString', 'a'], nonReserveFundParticipants: ['constructor', 'toString'] }), expenses: [expense({ totalAmount: 1000, paidById: '__proto__', splitType: 'custom', customSplits: [{ friendId: '__proto__', amount: 1000 }] })] });
    expect(snapshot.participants.find(person => person.friendId === '__proto__')?.shouldPay).toBe(1000);
    expectConserved(snapshot);
  });

  it('has no fund deductions or refunds when there are no expenses', () => {
    const fund = calculateReserveFundBreakdown({ settings: meeting({ useReserveFund: true, partialReserveFundAmount: 10000, refundReserveFundToNonParticipants: true, reserveFundRefundRecipientIds: ['x'] }), expenses: [], participantIds: ['a', 'b'] });
    expect(fund.totalFundUsed).toBe(0);
    expect(fund.configuredFundLeft).toBe(10000);
  });

  it('conserves every won over varied split, payer, and support combinations', () => {
    for (let amount = 1; amount <= 100; amount++) {
      for (const payer of ['a', 'b', 'c']) {
        const snapshot = calculateSettlement({ meeting: meeting({ useReserveFund: true, partialReserveFundAmount: Math.floor(amount / 2), nonReserveFundParticipants: ['c'] }), expenses: [expense({ totalAmount: amount, paidById: payer })] });
        expectConserved(snapshot);
      }
    }
  });
});
