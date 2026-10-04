import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExpenseAction, updateExpenseAction, deleteExpenseAction, getExpensesByMeetingIdAction } from '../expenses';
import { addExpense, updateExpense, deleteExpense, getExpenseById, getExpensesByMeetingId } from '../../data-store';
import { ensureMeetingAccess } from '../../services/access';
import { revalidatePath } from 'next/cache';
import type { Expense, Meeting } from '../../types';
import { makeExpense, makeMeeting, makeUser } from './fixtures';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../services/access', () => ({ ensureMeetingAccess: vi.fn() }));
vi.mock('../../data-store', () => ({
  addExpense: vi.fn(), updateExpense: vi.fn(), deleteExpense: vi.fn(),
  getExpenseById: vi.fn(), getExpensesByMeetingId: vi.fn(),
}));

const mockAccess = vi.mocked(ensureMeetingAccess);
const mockAdd = vi.mocked(addExpense);
const mockUpdate = vi.mocked(updateExpense);
const mockDelete = vi.mocked(deleteExpense);
const mockGetExpense = vi.mocked(getExpenseById);
const mockGetExpenses = vi.mocked(getExpensesByMeetingId);
const mockRevalidate = vi.mocked(revalidatePath);

type ExpenseInput = Omit<Expense, 'id' | 'createdAt'>;
function input(overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return { meetingId: 'm1', description: '식사', totalAmount: 10000, paidById: 'f1', splitType: 'equally', splitAmongIds: ['f1', 'f2'], ...overrides };
}
function authorize(overrides: Partial<Meeting> = {}) {
  mockAccess.mockResolvedValue({ success: true, user: makeUser({ id: 'u1' }), meeting: makeMeeting({ participantIds: ['f1', 'f2'], ...overrides }) });
}
function expectNoWrites() {
  expect(mockAdd).not.toHaveBeenCalled();
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockDelete).not.toHaveBeenCalled();
  expect(mockRevalidate).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAccess.mockReset(); mockAdd.mockReset(); mockUpdate.mockReset(); mockDelete.mockReset(); mockGetExpense.mockReset(); mockGetExpenses.mockReset();
  authorize();
  mockGetExpense.mockResolvedValue(makeExpense());
  mockAdd.mockResolvedValue(makeExpense());
  mockUpdate.mockResolvedValue(makeExpense({ description: '수정한 식사' }));
  mockDelete.mockResolvedValue(undefined);
  mockGetExpenses.mockResolvedValue([makeExpense()]);
});

describe('expense access boundaries', () => {
  it.each(['cross-group user', 'another meeting owner'])('honors %s access denial before reading or mutating expense records', async () => {
    mockAccess.mockResolvedValue({ success: false, error: '이 모임에 접근할 권한이 없습니다.' });
    const results = await Promise.all([
      createExpenseAction(input(), 'outsider'),
      updateExpenseAction('e1', 'm1', { description: '변경' }, 'outsider'),
      deleteExpenseAction('e1', 'm1', 'outsider'),
      getExpensesByMeetingIdAction('m1'),
    ]);
    expect(results.every(result => !result.success)).toBe(true);
    expect(mockGetExpense).not.toHaveBeenCalled();
    expect(mockGetExpenses).not.toHaveBeenCalled();
    expectNoWrites();
    expect(mockAccess).toHaveBeenCalledWith('m1', 'outsider', true);
  });

  it('requires read authorization before returning the expense list', async () => {
    const expectedExpenses = [makeExpense()];
    mockGetExpenses.mockResolvedValue(expectedExpenses);
    const result = await getExpensesByMeetingIdAction('m1');
    expect(result).toEqual({ success: true, expenses: expectedExpenses });
    expect(mockAccess).toHaveBeenCalledWith('m1');
    expect(mockGetExpenses).toHaveBeenCalledWith('m1');
  });
});

describe('createExpenseAction server validation', () => {
  it.each([
    ['negative amount', { totalAmount: -1 }],
    ['zero amount', { totalAmount: 0 }],
    ['fractional won', { totalAmount: 10000.5 }],
    ['non-participant payer', { paidById: 'outsider' }],
    ['non-participant equal split', { splitAmongIds: ['f1', 'outsider'] }],
    ['duplicate equal split', { splitAmongIds: ['f1', 'f1'] }],
    ['empty split', { splitAmongIds: [] }],
    ['custom sum mismatch', { splitType: 'custom', customSplits: [{ friendId: 'f1', amount: 100 }, { friendId: 'f2', amount: 9901 }] }],
    ['non-participant custom split', { splitType: 'custom', customSplits: [{ friendId: 'outsider', amount: 10000 }] }],
    ['fractional custom splits', { splitType: 'custom', customSplits: [{ friendId: 'f1', amount: 0.5 }, { friendId: 'f2', amount: 9999.5 }] }],
  ] satisfies [string, Partial<ExpenseInput>][])('rejects %s before writes', async (_label, updates) => {
    const result = await createExpenseAction(input(updates), 'u1');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expectNoWrites();
  });

  it('persists an authorized integer expense and refreshes the affected pages', async () => {
    const result = await createExpenseAction(input({ description: ' 식사 ' }), 'u1');
    expect(result.success).toBe(true);
    expect(mockAccess).toHaveBeenCalledWith('m1', 'u1', true);
    expect(mockAdd).toHaveBeenCalledWith(input());
    expect(mockRevalidate).toHaveBeenCalledWith('/meetings/m1');
    expect(mockRevalidate).toHaveBeenCalledWith('/');
  });

  it('validates temporary expenses against stable IDs instead of participant names', async () => {
    authorize({ isTemporary: true, participantIds: [], temporaryParticipants: [{ id: 'temp-1', name: '민수' }, { id: 'temp-2', name: '민수' }] });
    const temporaryInput = input({ paidById: 'temp-1', splitAmongIds: ['temp-1', 'temp-2'] });
    mockAdd.mockResolvedValue(makeExpense(temporaryInput));
    expect((await createExpenseAction(temporaryInput, 'u1')).success).toBe(true);
    expect(mockAdd).toHaveBeenCalledWith(temporaryInput);
    mockAdd.mockClear(); mockRevalidate.mockClear();
    expect((await createExpenseAction({ ...temporaryInput, paidById: '민수' }, 'u1')).success).toBe(false);
    expectNoWrites();
  });

  it('returns a write failure without reporting a created expense', async () => {
    mockAdd.mockRejectedValue(new Error('정산을 다시 열어야 지출을 변경할 수 있습니다.'));
    const result = await createExpenseAction(input(), 'u1');
    expect(result).toEqual({ success: false, error: '정산을 다시 열어야 지출을 변경할 수 있습니다.' });
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});

describe('updateExpenseAction merged validation', () => {
  it('merges a partial description update with persisted payer, amount, and split information', async () => {
    const existing = makeExpense({ description: '기존 식사' });
    mockGetExpense.mockResolvedValue(existing);
    const result = await updateExpenseAction('e1', 'm1', { description: '수정한 식사' }, 'u1');
    expect(result.success).toBe(true);
    expect(mockGetExpense).toHaveBeenCalledWith('m1', 'e1');
    expect(mockUpdate).toHaveBeenCalledWith('m1', 'e1', {
      description: '수정한 식사', totalAmount: existing.totalAmount, paidById: existing.paidById,
      splitType: existing.splitType, splitAmongIds: existing.splitAmongIds,
    });
  });

  it('rejects a total-only update when persisted custom splits no longer sum to the total', async () => {
    mockGetExpense.mockResolvedValue(makeExpense({ splitType: 'custom', customSplits: [{ friendId: 'f1', amount: 3000 }, { friendId: 'f2', amount: 7000 }] }));
    const result = await updateExpenseAction('e1', 'm1', { totalAmount: 11000 }, 'u1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('총합');
    expectNoWrites();
  });

  it('validates persisted fields even when they are absent from the partial update', async () => {
    mockGetExpense.mockResolvedValue(makeExpense({ paidById: 'outsider' }));
    const result = await updateExpenseAction('e1', 'm1', { description: '수정' }, 'u1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('결제자는 모임 참여자');
    expectNoWrites();
  });

  it.each([-100, 1.5])('rejects invalid updated amount %s', async totalAmount => {
    expect((await updateExpenseAction('e1', 'm1', { totalAmount }, 'u1')).success).toBe(false);
    expectNoWrites();
  });

  it('rejects an expense missing from the authorized meeting', async () => {
    mockGetExpense.mockResolvedValue(undefined);
    const result = await updateExpenseAction('e1', 'm1', { description: '수정' }, 'u1');
    expect(result).toEqual({ success: false, error: '지출을 찾을 수 없습니다.' });
    expectNoWrites();
  });
});

describe('settled expense immutability', () => {
  it('rejects all expense changes before reading expense records until explicit reopen', async () => {
    authorize({ isSettled: true, settledReserveFundAmount: 5000 });
    const results = await Promise.all([
      createExpenseAction(input(), 'u1'),
      updateExpenseAction('e1', 'm1', { description: '수정' }, 'u1'),
      deleteExpenseAction('e1', 'm1', 'u1'),
    ]);
    for (const result of results) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('다시 연 뒤');
    }
    expect(mockGetExpense).not.toHaveBeenCalled();
    expectNoWrites();
  });
});

describe('deleteExpenseAction', () => {
  it('deletes only an expense found in the authorized meeting', async () => {
    const result = await deleteExpenseAction('e1', 'm1', 'u1');
    expect(result.success).toBe(true);
    expect(mockGetExpense).toHaveBeenCalledWith('m1', 'e1');
    expect(mockDelete).toHaveBeenCalledWith('m1', 'e1');
    expect(mockRevalidate).toHaveBeenCalledWith('/meetings/m1');
  });

  it('returns missing-expense errors without writes', async () => {
    mockGetExpense.mockResolvedValue(undefined);
    expect((await deleteExpenseAction('e1', 'm1', 'u1')).success).toBe(false);
    expectNoWrites();
  });

  it('does not invalidate pages when a concurrent finalization rejects deletion', async () => {
    mockDelete.mockRejectedValue(new Error('정산을 다시 열어야 지출을 변경할 수 있습니다.'));
    const result = await deleteExpenseAction('e1', 'm1', 'u1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('다시 열어야');
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});
