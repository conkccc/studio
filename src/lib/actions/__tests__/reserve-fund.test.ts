import { beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeMeetingSettlementAction, reopenMeetingSettlementAction } from '../reserve-fund';
import { getExpensesByMeetingId, getMeetingFriends, saveMeetingSettlement, updateMeeting } from '../../data-store';
import { ensureMeetingAccess } from '../../services/access';
import { revalidatePath } from 'next/cache';
import { calculateSettlement, isSettlementSnapshot } from '../../settlement';
import type { Friend, Meeting, User } from '../../types';
import { makeAdmin, makeExpense, makeMeeting, makeUser } from './fixtures';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../services/access', () => ({ ensureMeetingAccess: vi.fn() }));
vi.mock('../../data-store', () => ({ getExpensesByMeetingId: vi.fn(), getMeetingFriends: vi.fn(), saveMeetingSettlement: vi.fn(), updateMeeting: vi.fn() }));

const mockAccess = vi.mocked(ensureMeetingAccess);
const mockExpenses = vi.mocked(getExpensesByMeetingId);
const mockFriends = vi.mocked(getMeetingFriends);
const mockSave = vi.mocked(saveMeetingSettlement);
const mockUpdate = vi.mocked(updateMeeting);
const mockRevalidate = vi.mocked(revalidatePath);
let activeMeeting: Meeting;
const friend = (id: string, name = id): Friend => ({ id, name, groupId: 'g1', createdAt: new Date('2026-10-04') });
const authorize = (overrides: Partial<Meeting> = {}, user: User = makeUser({ id: 'u1' })) => {
  activeMeeting = makeMeeting({ participantIds: ['f1', 'f2', 'f3'], revision: 7, ...overrides });
  mockAccess.mockResolvedValue({ success: true, user, meeting: activeMeeting });
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAccess.mockReset(); mockExpenses.mockReset(); mockFriends.mockReset(); mockSave.mockReset(); mockUpdate.mockReset();
  authorize();
  mockExpenses.mockResolvedValue([makeExpense({ splitAmongIds: ['f1', 'f2', 'f3'] })]);
  mockFriends.mockResolvedValue([friend('f1', '지수'), friend('f2', '민수'), friend('f3', '서연')]);
  mockSave.mockImplementation(async (_id, _revision, settlementSnapshot) => ({ ...activeMeeting, isSettled: true, settlementSnapshot,
    settledReserveFundAmount: settlementSnapshot.reserveFund.totalFundUsed, settledReserveFundAt: new Date('2026-10-04') }));
  mockUpdate.mockImplementation(async (_id, updates) => ({ ...activeMeeting, ...updates }));
});

describe('finalizeMeetingSettlementAction', () => {
  it('freezes automatic support using the latest expenses, including separate non-attendee refunds', async () => {
    authorize({ useReserveFund: true, reserveFundCoverAll: true, partialReserveFundAmount: 1, nonReserveFundParticipants: ['f3'], refundReserveFundToNonParticipants: true, reserveFundRefundRecipientIds: ['f4'] });
    mockExpenses.mockResolvedValue([makeExpense({ totalAmount: 12000, splitAmongIds: ['f1', 'f2', 'f3'] })]);
    mockFriends.mockResolvedValue([friend('f1'), friend('f2'), friend('f3'), friend('f4')]);
    const result = await finalizeMeetingSettlementAction('m1', 'u1');
    expect(result.success).toBe(true);
    const snapshot = mockSave.mock.calls[0][2];
    expect(snapshot.reserveFund.baseFundUsed).toBe(8000);
    expect(snapshot.reserveFund.refundTotal).toBe(4000);
    expect(snapshot.reserveFund.totalFundUsed).toBe(12000);
    expect(snapshot.participantCostTotal).toBe(4000);
    expect(mockSave.mock.calls[0][1]).toBe(7);
    mockAccess.mockResolvedValue({ success: true, user: makeUser(), meeting: result.meeting! });
    mockSave.mockClear(); mockExpenses.mockClear();
    expect((await finalizeMeetingSettlementAction('m1', 'u1')).success).toBe(true);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockExpenses).not.toHaveBeenCalled();
  });
  it('honors access rejection before reading expense/friend data or writing settlement', async () => {
    mockAccess.mockResolvedValue({ success: false, error: '이 모임에 접근할 권한이 없습니다.' });
    const result = await finalizeMeetingSettlementAction('m1', 'another-owner');
    expect(result).toEqual({ success: false, error: '이 모임에 접근할 권한이 없습니다.' });
    expect(mockExpenses).not.toHaveBeenCalled();
    expect(mockFriends).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it('lets an authorized owner finalize a no-fund meeting with exact integer rows and its expected revision', async () => {
    const result = await finalizeMeetingSettlementAction('m1', 'u1');
    expect(result.success).toBe(true);
    expect(mockAccess).toHaveBeenCalledWith('m1', 'u1', true);
    expect(mockSave).toHaveBeenCalledTimes(1);
    const [meetingId, revision, snapshot] = mockSave.mock.calls[0];
    expect(meetingId).toBe('m1'); expect(revision).toBe(7);
    expect(isSettlementSnapshot(snapshot)).toBe(true);
    expect(snapshot.totalSpent).toBe(10000);
    expect(snapshot.participants.map(person => person.shouldPay)).toEqual([3334, 3333, 3333]);
    expect(snapshot.participants.reduce((sum, person) => sum + person.shouldPay, 0)).toBe(10000);
    expect(snapshot.reserveFund.totalFundUsed).toBe(0);
    expect(snapshot.transfers).toEqual([
      { from: 'f2', to: 'f1', amount: 3333, kind: 'participant' },
      { from: 'f3', to: 'f1', amount: 3333, kind: 'participant' },
    ]);
    expect(snapshot.namesById).toMatchObject({ f1: '지수', f2: '민수', f3: '서연' });
    expect(mockRevalidate).toHaveBeenCalledWith('/meetings/m1');
    expect(mockRevalidate).toHaveBeenCalledWith('/meetings');
    expect(mockRevalidate).toHaveBeenCalledWith('/');
  });

  it('lets an authorized admin finalize a fund meeting including integer non-attendee refund snapshots', async () => {
    authorize({ creatorId: 'someone-else', useReserveFund: true, partialReserveFundAmount: 5001, nonReserveFundParticipants: ['f3'],
      refundReserveFundToNonParticipants: true, reserveFundRefundRecipientIds: ['f4', 'f5'] }, makeAdmin());
    mockFriends.mockResolvedValue([friend('f1'), friend('f2'), friend('f3'), friend('f4', '환급 친구'), friend('f5', '환급 친구 2')]);
    const result = await finalizeMeetingSettlementAction('m1', 'admin-1');
    expect(result.success).toBe(true);
    const snapshot = mockSave.mock.calls[0][2];
    expect(snapshot.reserveFund.baseFundUsed).toBe(5001);
    expect(snapshot.reserveFund.refundTotal).toBe(5001);
    expect(snapshot.reserveFund.totalFundUsed).toBe(10002);
    expect(snapshot.transfers.filter(transfer => transfer.kind === 'refund')).toEqual([
      { from: null, to: 'f4', amount: 2501, kind: 'refund' },
      { from: null, to: 'f5', amount: 2500, kind: 'refund' },
    ]);
    expect(snapshot.namesById.f4).toBe('환급 친구');
    expect(snapshot.participants.reduce((sum, person) => sum + person.shouldPay, 0)).toBe(4999);
    expect(isSettlementSnapshot(snapshot)).toBe(true);
  });

  it('finalizes temporary meetings using distinct stable IDs even with duplicate names', async () => {
    authorize({ isTemporary: true, participantIds: [], temporaryParticipants: [{ id: 'temp-1', name: '민수' }, { id: 'temp-2', name: '민수' }] });
    mockExpenses.mockResolvedValue([makeExpense({ totalAmount: 1001, paidById: 'temp-1', splitAmongIds: ['temp-1', 'temp-2'] })]);
    mockFriends.mockResolvedValue([]);
    expect((await finalizeMeetingSettlementAction('m1', 'u1')).success).toBe(true);
    const snapshot = mockSave.mock.calls[0][2];
    expect(snapshot.participants.map(person => [person.friendId, person.name, person.shouldPay])).toEqual([['temp-1', '민수', 501], ['temp-2', '민수', 500]]);
    expect(snapshot.transfers).toEqual([{ from: 'temp-2', to: 'temp-1', amount: 500, kind: 'participant' }]);
  });

  it('uses revision zero for older meetings with no revision field', async () => {
    authorize({ revision: undefined });
    expect((await finalizeMeetingSettlementAction('m1', 'u1')).success).toBe(true);
    expect(mockSave.mock.calls[0][1]).toBe(0);
  });

  it('does not finalize an empty expense list or write a zero-expense snapshot', async () => {
    mockExpenses.mockResolvedValue([]);
    const result = await finalizeMeetingSettlementAction('m1', 'u1');
    expect(result).toEqual({ success: false, error: '지출을 등록한 뒤 정산해주세요.' });
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it('blocks ambiguous legacy temporary participants before saving a guessed settlement', async () => {
    authorize({ isTemporary: true, participantIds: [], temporaryParticipants: [{ name: '민수' }, { name: '민수' }] });
    mockExpenses.mockResolvedValue([makeExpense({ paidById: '민수', splitAmongIds: ['민수'] })]);
    mockFriends.mockResolvedValue([]);
    const result = await finalizeMeetingSettlementAction('m1', 'u1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('동명이인');
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it('blocks legacy fractional records until the amounts are reviewed', async () => {
    mockExpenses.mockResolvedValue([makeExpense({ totalAmount: 10000.5, splitAmongIds: ['f1', 'f2', 'f3'] })]);
    const result = await finalizeMeetingSettlementAction('m1', 'u1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('소수점');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('surfaces revision conflicts without reverting or replacing settlement data', async () => {
    const conflict = '모임이나 지출이 변경되었습니다. 새로고침 후 다시 정산해주세요.';
    mockSave.mockRejectedValue(new Error(conflict));
    const result = await finalizeMeetingSettlementAction('m1', 'u1');
    expect(result).toEqual({ success: false, error: conflict });
    expect(mockSave.mock.calls[0][1]).toBe(7);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it('returns an already finalized immutable snapshot without duplicate reads or writes', async () => {
    const snapshot = calculateSettlement({ meeting: activeMeeting, expenses: [makeExpense({ splitAmongIds: ['f1', 'f2', 'f3'] })] });
    authorize({ isSettled: true, settlementSnapshot: snapshot, settledReserveFundAmount: 0 });
    const result = await finalizeMeetingSettlementAction('m1', 'u1');
    expect(result.success).toBe(true);
    expect(result.meeting?.settlementSnapshot).toBe(snapshot);
    expect(mockExpenses).not.toHaveBeenCalled();
    expect(mockFriends).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});

describe('reopenMeetingSettlementAction', () => {
  it('clears saved settlement and fund deduction only after an explicit authorized reopen', async () => {
    const snapshot = calculateSettlement({ meeting: activeMeeting, expenses: [makeExpense({ splitAmongIds: ['f1', 'f2', 'f3'] })] });
    authorize({ isSettled: true, settlementSnapshot: snapshot, settledReserveFundAmount: 5000, settledReserveFundAt: new Date('2026-10-04') });
    const result = await reopenMeetingSettlementAction('m1', 'u1');
    expect(result.success).toBe(true);
    expect(mockAccess).toHaveBeenCalledWith('m1', 'u1', true);
    expect(mockUpdate).toHaveBeenCalledWith('m1', { isSettled: false, settlementSnapshot: undefined, settledReserveFundAmount: undefined, settledReserveFundAt: undefined });
    expect(result.meeting?.isSettled).toBe(false);
    expect(result.meeting?.settlementSnapshot).toBeUndefined();
    expect(mockRevalidate).toHaveBeenCalledWith('/meetings/m1');
  });

  it('honors another-owner rejection without clearing an existing snapshot', async () => {
    mockAccess.mockResolvedValue({ success: false, error: '이 모임에 접근할 권한이 없습니다.' });
    const result = await reopenMeetingSettlementAction('m1', 'outsider');
    expect(result.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});
