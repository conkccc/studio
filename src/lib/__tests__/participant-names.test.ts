import { describe, expect, it } from 'vitest';
import { makeExpense, makeFriend, makeMeeting } from '../actions/__tests__/fixtures';
import { calculateSettlement, restoreSettlementNames } from '../settlement';
import { isUnresolvedParticipantName, meetingForDisplay, meetingReferenceIds, recordedParticipantName } from '../participant-names';

describe('participant names and stale roster IDs', () => {
  it('shows four actual participants when a fifth dangling ID has no expense or recorded name', () => {
    const original = makeMeeting({ participantIds: ['a', 'b', 'c', 'd', 'deleted'] });
    const friends = ['a', 'b', 'c', 'd'].map(id => makeFriend({ id, name: `친구 ${id}` }));
    const display = meetingForDisplay(original, friends);
    expect(display.participantIds).toEqual(['a', 'b', 'c', 'd']);
    const settlement = calculateSettlement({ meeting: display, expenses: [], participants: friends });
    expect(settlement.participants).toHaveLength(4);
    expect(settlement.participants.some(person => person.friendId === 'deleted')).toBe(false);
    expect(original.participantIds).toHaveLength(5);
  });

  it('retains a missing historical payer and their contribution when expenses still reference them', () => {
    const original = makeMeeting({ participantIds: ['known', 'missing'] });
    const friends = [makeFriend({ id: 'known', name: '친구' })];
    const expense = makeExpense({ totalAmount: 1000, paidById: 'missing', splitAmongIds: ['known', 'missing'] });
    const settlement = calculateSettlement({ meeting: meetingForDisplay(original, friends), expenses: [expense], participants: friends });
    expect(settlement.participants.find(person => person.friendId === 'missing')).toMatchObject({ totalPaid: 1000, expenseContribution: 500, shouldPay: 500 });
    expect(settlement.participants.reduce((sum, person) => sum + person.shouldPay, 0)).toBe(1000);
    expect(isUnresolvedParticipantName(settlement.participants.find(person => person.friendId === 'missing')?.name)).toBe(true);
  });

  it('uses recorded names when the global friend document is gone', () => {
    const original = makeMeeting({ participantIds: ['missing'], participantSnapshot: [{ id: 'missing', name: '기록된 이름' }] });
    expect(recordedParticipantName(original, 'missing')).toBe('기록된 이름');
    expect(meetingForDisplay(original, []).participantIds).toEqual(['missing']);
  });

  it('does not let old fallback names hide a name that is still available', () => {
    const original = makeMeeting({ participantSnapshot: [{ id: 'a', name: '이전 참여자' }], participantNames: { a: '이전 참여자' } });
    expect(recordedParticipantName(original, 'a', { name: '실제 이름' })).toBe('실제 이름');
  });

  it('gathers payers/custom shares and stored settlement people for targeted name lookup', () => {
    const original = makeMeeting({ participantIds: ['a'] });
    expect(meetingReferenceIds(original, [makeExpense({ paidById: 'former', splitType: 'custom', splitAmongIds: undefined, customSplits: [{ friendId: 'other', amount: 10000 }] })])).toEqual(['a', 'former', 'other']);
  });

  it('repairs only missing display names without recalculating saved monetary results', () => {
    const original = makeMeeting({ participantIds: ['a', 'b'] });
    const expense = makeExpense({ paidById: 'a', splitAmongIds: ['a', 'b'] });
    const saved = calculateSettlement({ meeting: original, expenses: [expense] });
    saved.participants[0].name = '이전 참여자';
    saved.namesById.a = '이전 참여자';
    const before = structuredClone(saved);
    const repaired = restoreSettlementNames(saved, { ...original, settlementSnapshot: saved }, [makeFriend({ id: 'a', name: '실제 이름' })]);
    expect(repaired.participants[0].name).toBe('실제 이름');
    expect(repaired.transfers).toBe(saved.transfers);
    expect(repaired.reserveFund).toBe(saved.reserveFund);
    expect(repaired.totalSpent).toBe(saved.totalSpent);
    expect(repaired.participants.map(({ name: _name, ...person }) => { void _name; return person; })).toEqual(saved.participants.map(({ name: _name, ...person }) => { void _name; return person; }));
    expect(saved).toEqual(before);
  });

  it('keeps a genuinely saved historical name even if the current directory name changes', () => {
    const original = makeMeeting({ participantSnapshot: [{ id: 'a', name: '과거 이름' }] });
    expect(recordedParticipantName(original, 'a', { name: '현재 이름' })).toBe('과거 이름');
  });
});
