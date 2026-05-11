import { beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeMeetingSettlementAction } from '../reserve-fund';
import {
  getMeetingById,
  getExpensesByMeetingId,
  updateMeeting,
} from '../../data-store';
import { ensureUserPermission } from '../permissions';
import { revalidatePath } from 'next/cache';
import { makeAdmin, makeExpense, makeMeeting } from './fixtures';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

vi.mock('../permissions', () => ({
  ensureUserPermission: vi.fn()
}));

vi.mock('../../data-store', () => ({
  getMeetingById: vi.fn(),
  updateMeeting: vi.fn(),
  getExpensesByMeetingId: vi.fn()
}));

const mockEnsureUserPermission = vi.mocked(ensureUserPermission);
const mockGetMeetingById = vi.mocked(getMeetingById);
const mockUpdateMeeting = vi.mocked(updateMeeting);
const mockGetExpensesByMeetingId = vi.mocked(getExpensesByMeetingId);
const mockRevalidatePath = vi.mocked(revalidatePath);

describe('finalizeMeetingSettlementAction', () => {
  beforeEach(() => {
    mockEnsureUserPermission.mockReset();
    mockGetMeetingById.mockReset();
    mockUpdateMeeting.mockReset();
    mockGetExpensesByMeetingId.mockReset();
    mockRevalidatePath.mockReset();
  });

  it('returns error when meeting is not found', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin()
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
    mockGetExpensesByMeetingId.mockResolvedValue([]);
    mockUpdateMeeting.mockResolvedValue({ id: 'm1' });

    const result = await finalizeMeetingSettlementAction('m1', 'admin-1');

    expect(result.success).toBe(true);
    expect(mockUpdateMeeting).toHaveBeenCalledWith('m1', {
      isSettled: true,
      settledReserveFundAmount: 0,
      settledReserveFundAt: expect.any(Date),
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/meetings/m1');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/');
  });

  it('records settled reserve fund amount on the meeting document', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin()
    });
    mockGetMeetingById.mockResolvedValue(
      makeMeeting({
        creatorId: 'admin-1',
        useReserveFund: true,
        partialReserveFundAmount: 5000,
        participantIds: ['f1', 'f2'],
        nonReserveFundParticipants: [],
        isSettled: false,
        isTemporary: false
      })
    );
    mockGetExpensesByMeetingId.mockResolvedValue([
      makeExpense({
        totalAmount: 8000,
        splitType: 'equally',
        splitAmongIds: ['f1', 'f2']
      })
    ]);
    mockUpdateMeeting.mockResolvedValue({ id: 'm1' });

    const result = await finalizeMeetingSettlementAction('m1', 'admin-1');

    expect(result.success).toBe(true);
    expect(mockUpdateMeeting).toHaveBeenCalledWith('m1', {
      isSettled: true,
      settledReserveFundAmount: 5000,
      settledReserveFundAt: expect.any(Date),
    });
    expect(result.message).toContain('5,000');
  });
});
