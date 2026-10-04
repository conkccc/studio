import { describe, expect, it } from 'vitest';
import { makeExpense, makeMeeting } from '../actions/__tests__/fixtures';
import { calculateSettlement, isSettlementSnapshot } from '../settlement';
import { meetingInputSchema } from '../meeting-schema';
import { meetingSchema, meetingDraftSchema } from '@/features/meetings/meeting-form-schema';

const meeting = makeMeeting({ participantIds: ['a', 'b', 'c'], useReserveFund: true, reserveFundCoverAll: true });
const expense = makeExpense({ totalAmount: 9000, paidById: 'a', splitAmongIds: ['a', 'b', 'c'] });
describe('automatic full reserve-fund support', () => {
  it('follows expense additions, edits and deletions without a stored amount', () => {
    for (const [expenses, expected] of [[[], 0], [[expense], 9000], [[{ ...expense, totalAmount: 12000 }], 12000], [[expense, { ...expense, id: 'second', totalAmount: 3000 }], 12000]] as const) {
      const snapshot = calculateSettlement({ meeting, expenses: [...expenses] });
      expect(snapshot.reserveFund.baseFundUsed).toBe(expected);
      expect(snapshot.participantCostTotal).toBe(0);
      expect(snapshot.transfers.filter(t => t.kind === 'participant')).toHaveLength(0);
      expect(isSettlementSnapshot(snapshot)).toBe(true);
    }
  });
  it('covers only eligible obligations and refunds absent recipients separately', () => {
    const snapshot = calculateSettlement({ meeting: { ...meeting, nonReserveFundParticipants: ['c'], refundReserveFundToNonParticipants: true, reserveFundRefundRecipientIds: ['absent'] }, expenses: [expense] });
    expect(snapshot.reserveFund.baseFundUsed).toBe(6000);
    expect(snapshot.reserveFund.refundTotal).toBe(3000);
    expect(snapshot.reserveFund.totalFundUsed).toBe(9000);
    expect(snapshot.participantCostTotal).toBe(3000);
    expect(snapshot.participants.find(p => p.friendId === 'c')?.shouldPay).toBe(3000);
    expect(snapshot.transfers.find(t => t.kind === 'refund')?.amount).toBe(3000);
  });
  it('covers unequal custom splits exactly and ignores an old manual cap', () => {
    const snapshot = calculateSettlement({ meeting: { ...meeting, partialReserveFundAmount: 1, nonReserveFundParticipants: ['c'] }, expenses: [{ ...expense, totalAmount: 10001, splitType: 'custom', customSplits: [{ friendId: 'a', amount: 2001 }, { friendId: 'b', amount: 5000 }, { friendId: 'c', amount: 3000 }] }] });
    expect(snapshot.reserveFund.baseFundUsed).toBe(7001);
    expect(snapshot.reserveFund.fundContributionById).toEqual({ a: 2001, b: 5000 });
    expect(snapshot.participantCostTotal).toBe(3000);
  });
  it('uses no fund or refund when everyone is excluded', () => {
    const snapshot = calculateSettlement({ meeting: { ...meeting, nonReserveFundParticipants: meeting.participantIds, refundReserveFundToNonParticipants: true, reserveFundRefundRecipientIds: ['absent'] }, expenses: [expense] });
    expect(snapshot.reserveFund.totalFundUsed).toBe(0);
    expect(snapshot.participantCostTotal).toBe(9000);
  });
  it('keeps a manual cap and disabled fund behavior', () => {
    const manual = calculateSettlement({ meeting: { ...meeting, reserveFundCoverAll: false, partialReserveFundAmount: 3000 }, expenses: [expense] });
    expect(manual.reserveFund.baseFundUsed).toBe(3000);
    expect(manual.participantCostTotal).toBe(6000);
    const disabled = calculateSettlement({ meeting: { ...meeting, useReserveFund: false }, expenses: [expense] });
    expect(disabled.reserveFund.baseFundUsed).toBe(0);
    expect(disabled.participantCostTotal).toBe(9000);
  });
  it('accepts automatic mode with no amount in both client and server schemas and drafts', () => {
    expect(meetingInputSchema.safeParse(meeting).success).toBe(true);
    expect(meetingSchema.safeParse(meeting).success).toBe(true);
    expect(meetingDraftSchema.parse({ reserveFundCoverAll: true })).toEqual({ reserveFundCoverAll: true });
  });
  it('requires a manual amount when automatic mode is off and rejects invalid flag types', () => {
    expect(meetingInputSchema.safeParse({ ...meeting, reserveFundCoverAll: false }).success).toBe(false);
    expect(meetingSchema.safeParse({ ...meeting, reserveFundCoverAll: false }).success).toBe(false);
    expect(meetingInputSchema.safeParse({ ...meeting, reserveFundCoverAll: 'true' }).success).toBe(false);
  });
});
