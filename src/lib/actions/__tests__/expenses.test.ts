import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExpenseAction, updateExpenseAction, deleteExpenseAction } from '../expenses';
import {
  addExpense,
  updateExpense,
  deleteExpense,
  getMeetingById,
  updateMeeting,
  dbRevertMeetingDeduction
} from '../../data-store';
import { ensureUserPermission } from '../permissions';
import { revalidatePath } from 'next/cache';
import { makeAdmin, makeExpense, makeMeeting, makeUser } from './fixtures';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

vi.mock('../../data-store', () => ({
  addExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
  getMeetingById: vi.fn(),
  updateMeeting: vi.fn(),
  dbRevertMeetingDeduction: vi.fn(),
  getExpensesByMeetingId: vi.fn()
}));

vi.mock('../permissions', () => ({
  ensureUserPermission: vi.fn()
}));

const mockEnsureUserPermission = vi.mocked(ensureUserPermission);
const mockGetMeetingById = vi.mocked(getMeetingById);
const mockAddExpense = vi.mocked(addExpense);
const mockUpdateExpense = vi.mocked(updateExpense);
const mockDeleteExpense = vi.mocked(deleteExpense);
const mockUpdateMeeting = vi.mocked(updateMeeting);
const mockRevertMeetingDeduction = vi.mocked(dbRevertMeetingDeduction);
const mockRevalidatePath = vi.mocked(revalidatePath);

describe('createExpenseAction', () => {
  beforeEach(() => {
    mockEnsureUserPermission.mockReset();
    mockGetMeetingById.mockReset();
    mockAddExpense.mockReset();
    mockUpdateExpense.mockReset();
    mockDeleteExpense.mockReset();
    mockUpdateMeeting.mockReset();
    mockRevertMeetingDeduction.mockReset();
    mockRevalidatePath.mockReset();
  });

  const { id: _id, createdAt: _createdAt, ...expenseData } = makeExpense({
    id: 'e1',
    createdAt: new Date()
  });
  void _id;
  void _createdAt;

  it('returns permission error when user is not authorized', async () => {
    mockEnsureUserPermission.mockResolvedValue({ success: false, error: '권한 없음' });

    const result = await createExpenseAction(expenseData, 'u1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('권한 없음');
    expect(mockGetMeetingById).not.toHaveBeenCalled();
  });

  it('returns error when meeting is not found', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin({ id: 'u1' })
    });
    mockGetMeetingById.mockResolvedValue(null);

    const result = await createExpenseAction(expenseData, 'u1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('모임을 찾을 수 없습니다');
  });

  it('returns error when user is not admin or creator', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeUser({ id: 'u2' })
    });
    mockGetMeetingById.mockResolvedValue(makeMeeting({ creatorId: 'u1' }));

    const result = await createExpenseAction(expenseData, 'u2');

    expect(result.success).toBe(false);
    expect(result.error).toContain('지출 항목 추가 권한이 없습니다');
  });

  it('unsettles meeting and reverts reserve deduction when adding expense to settled meeting', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin({ id: 'admin-1' })
    });
    mockGetMeetingById.mockResolvedValue(
      makeMeeting({
        creatorId: 'admin-1',
        useReserveFund: true,
        partialReserveFundAmount: 5000,
        isSettled: true
      })
    );
    mockAddExpense.mockResolvedValue(makeExpense({ id: 'e1' }));

    const result = await createExpenseAction(expenseData, 'admin-1');

    expect(result.success).toBe(true);
    expect(mockUpdateMeeting).toHaveBeenCalledWith('m1', { isSettled: false });
    expect(mockRevertMeetingDeduction).toHaveBeenCalledWith('m1');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/reserve-fund');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/meetings/m1');
  });

  it('returns error when data-store throws', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin({ id: 'admin-1' })
    });
    mockGetMeetingById.mockResolvedValue(makeMeeting({ creatorId: 'admin-1' }));
    mockAddExpense.mockRejectedValue(new Error('db error'));

    const result = await createExpenseAction(expenseData, 'admin-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('db error');
  });
});

describe('updateExpenseAction', () => {
  beforeEach(() => {
    mockEnsureUserPermission.mockReset();
    mockGetMeetingById.mockReset();
    mockUpdateExpense.mockReset();
    mockUpdateMeeting.mockReset();
    mockRevertMeetingDeduction.mockReset();
    mockRevalidatePath.mockReset();
  });

  it('returns error when ids are missing', async () => {
    const result = await updateExpenseAction('', '', { description: '수정' }, 'u1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('모임 ID 또는 지출 ID가 없습니다');
  });

  it('returns error when user is not admin or creator', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeUser({ id: 'u2' })
    });
    mockGetMeetingById.mockResolvedValue(makeMeeting({ creatorId: 'u1' }));

    const result = await updateExpenseAction('e1', 'm1', { description: '수정' }, 'u2');

    expect(result.success).toBe(false);
    expect(result.error).toContain('지출 항목 수정 권한이 없습니다');
  });

  it('unsettles meeting and reverts reserve deduction when updating expense on settled meeting', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin({ id: 'admin-1' })
    });
    mockGetMeetingById.mockResolvedValue(
      makeMeeting({
        creatorId: 'admin-1',
        useReserveFund: true,
        partialReserveFundAmount: 5000,
        isSettled: true
      })
    );
    mockUpdateExpense.mockResolvedValue(makeExpense({ description: '수정' }));

    const result = await updateExpenseAction('e1', 'm1', { description: '수정' }, 'admin-1');

    expect(result.success).toBe(true);
    expect(mockUpdateMeeting).toHaveBeenCalledWith('m1', { isSettled: false });
    expect(mockRevertMeetingDeduction).toHaveBeenCalledWith('m1');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/reserve-fund');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/meetings/m1');
  });

  it('returns error when updateExpense returns null', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin({ id: 'admin-1' })
    });
    mockGetMeetingById.mockResolvedValue(makeMeeting({ creatorId: 'admin-1' }));
    mockUpdateExpense.mockResolvedValue(null);

    const result = await updateExpenseAction('e1', 'm1', { description: '수정' }, 'admin-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('지출 항목 업데이트에 실패했습니다');
  });
});

describe('deleteExpenseAction', () => {
  beforeEach(() => {
    mockEnsureUserPermission.mockReset();
    mockGetMeetingById.mockReset();
    mockDeleteExpense.mockReset();
    mockUpdateMeeting.mockReset();
    mockRevertMeetingDeduction.mockReset();
    mockRevalidatePath.mockReset();
  });

  it('returns error when user is not admin or creator', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeUser({ id: 'u2' })
    });
    mockGetMeetingById.mockResolvedValue(makeMeeting({ creatorId: 'u1' }));

    const result = await deleteExpenseAction('e1', 'm1', 'u2');

    expect(result.success).toBe(false);
    expect(result.error).toContain('지출 항목 삭제 권한이 없습니다');
  });

  it('unsettles meeting and reverts reserve deduction when deleting expense on settled meeting', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin({ id: 'admin-1' })
    });
    mockGetMeetingById.mockResolvedValue(
      makeMeeting({
        creatorId: 'admin-1',
        useReserveFund: true,
        partialReserveFundAmount: 5000,
        isSettled: true
      })
    );

    const result = await deleteExpenseAction('e1', 'm1', 'admin-1');

    expect(result.success).toBe(true);
    expect(mockDeleteExpense).toHaveBeenCalledWith('m1', 'e1');
    expect(mockUpdateMeeting).toHaveBeenCalledWith('m1', { isSettled: false });
    expect(mockRevertMeetingDeduction).toHaveBeenCalledWith('m1');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/reserve-fund');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/meetings/m1');
  });

  it('returns error when deleteExpense throws', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin({ id: 'admin-1' })
    });
    mockGetMeetingById.mockResolvedValue(makeMeeting({ creatorId: 'admin-1' }));
    mockDeleteExpense.mockRejectedValue(new Error('db error'));

    const result = await deleteExpenseAction('e1', 'm1', 'admin-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('db error');
  });
});
