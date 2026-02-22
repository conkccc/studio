import { beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeMeetingSettlementAction, setReserveFundBalanceAction } from '../reserve-fund';
import {
  dbRecordMeetingDeduction,
  dbRevertMeetingDeduction,
  dbSetReserveFundBalance,
  getMeetingById,
  getReserveFundBalance,
  getExpensesByMeetingId,
  updateMeeting
} from '../../data-store';
import { ensureUserPermission } from '../permissions';
import { revalidatePath } from 'next/cache';
import { doc, getDoc } from 'firebase/firestore';
import { makeAdmin, makeMeeting, makeUser } from './fixtures';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

vi.mock('../permissions', () => ({
  ensureUserPermission: vi.fn()
}));

vi.mock('../../data-store', () => ({
  getReserveFundBalance: vi.fn(),
  dbSetReserveFundBalance: vi.fn(),
  dbRecordMeetingDeduction: vi.fn(),
  dbRevertMeetingDeduction: vi.fn(),
  getMeetingById: vi.fn(),
  updateMeeting: vi.fn(),
  getExpensesByMeetingId: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn()
}));

vi.mock('../../firebase', () => ({
  db: {}
}));

const mockEnsureUserPermission = vi.mocked(ensureUserPermission);
const mockGetReserveFundBalance = vi.mocked(getReserveFundBalance);
const mockSetReserveFundBalance = vi.mocked(dbSetReserveFundBalance);
const mockRecordDeduction = vi.mocked(dbRecordMeetingDeduction);
const mockRevertDeduction = vi.mocked(dbRevertMeetingDeduction);
const mockGetMeetingById = vi.mocked(getMeetingById);
const mockUpdateMeeting = vi.mocked(updateMeeting);
const mockGetExpensesByMeetingId = vi.mocked(getExpensesByMeetingId);
const mockRevalidatePath = vi.mocked(revalidatePath);
const mockDoc = vi.mocked(doc);
const mockGetDoc = vi.mocked(getDoc);

describe('setReserveFundBalanceAction', () => {
  beforeEach(() => {
    mockEnsureUserPermission.mockReset();
    mockSetReserveFundBalance.mockReset();
    mockRevalidatePath.mockReset();
    mockDoc.mockReset();
    mockGetDoc.mockReset();
  });

  it('returns error when groupId is missing', async () => {
    const result = await setReserveFundBalanceAction('', 1000, '설명', 'u1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('그룹 ID가 필요합니다');
  });

  it('returns permission error from ensureUserPermission', async () => {
    mockEnsureUserPermission.mockResolvedValue({ success: false, error: '권한 없음' });
    const result = await setReserveFundBalanceAction('g1', 1000, '설명', 'u1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('권한 없음');
  });

  it('allows admin to set reserve fund balance', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin()
    });

    const result = await setReserveFundBalanceAction('g1', 5000, '수정', 'admin-1');

    expect(result.success).toBe(true);
    expect(mockSetReserveFundBalance).toHaveBeenCalledWith('g1', 5000, '수정');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/reserve-fund');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/');
  });

  it('allows group owner to set reserve fund balance', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeUser({ id: 'u1' })
    });
    mockDoc.mockReturnValue({} as ReturnType<typeof doc>);
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerUserId: 'u1' })
    });

    const result = await setReserveFundBalanceAction('g1', 2000, undefined, 'u1');

    expect(result.success).toBe(true);
    expect(mockSetReserveFundBalance).toHaveBeenCalledWith('g1', 2000, '수동 잔액 조정');
  });
});

describe('finalizeMeetingSettlementAction', () => {
  beforeEach(() => {
    mockEnsureUserPermission.mockReset();
    mockGetMeetingById.mockReset();
    mockUpdateMeeting.mockReset();
    mockGetExpensesByMeetingId.mockReset();
    mockGetReserveFundBalance.mockReset();
    mockRecordDeduction.mockReset();
    mockRevertDeduction.mockReset();
    mockRevalidatePath.mockReset();
  });

  it('returns error when meeting is not found', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: { id: 'admin-1', role: 'admin', createdAt: new Date() }
    });
    mockGetMeetingById.mockResolvedValue(null);

    const result = await finalizeMeetingSettlementAction('m1', 'admin-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('모임을 찾을 수 없습니다');
  });

  it('settles meeting without reserve fund usage', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin()
    });
    mockGetMeetingById.mockResolvedValue(
      makeMeeting({
        creatorId: 'admin-1',
        useReserveFund: false,
        isSettled: false
      })
    );
    mockUpdateMeeting.mockResolvedValue({ id: 'm1' });

    const result = await finalizeMeetingSettlementAction('m1', 'admin-1');

    expect(result.success).toBe(true);
    expect(mockUpdateMeeting).toHaveBeenCalledWith('m1', { isSettled: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/meetings/m1');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/');
  });

  it('records partial reserve fund deduction when balance is insufficient', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin()
    });
    mockGetMeetingById.mockResolvedValue(
      makeMeeting({
        creatorId: 'admin-1',
        useReserveFund: true,
        partialReserveFundAmount: 5000,
        isSettled: false,
        isTemporary: false
      })
    );
    mockGetExpensesByMeetingId.mockResolvedValue([{ id: 'e1' }]);
    mockGetReserveFundBalance.mockResolvedValue(1000);
    mockUpdateMeeting.mockResolvedValue({ id: 'm1' });

    const result = await finalizeMeetingSettlementAction('m1', 'admin-1');

    expect(result.success).toBe(true);
    expect(mockRevertDeduction).toHaveBeenCalledWith('m1');
    expect(mockRecordDeduction).toHaveBeenCalledWith('g1', 'm1', '모임', 1000, expect.any(Date));
    expect(result.message).toContain('부분 사용');
    expect(mockUpdateMeeting).toHaveBeenCalledWith('m1', { isSettled: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/reserve-fund');
  });
});
