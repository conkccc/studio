import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMeetingAction,
  deleteMeetingAction,
  getMeetingByIdAction,
  getMeetingsForUserAction,
  updateMeetingAction
} from '../meetings';
import {
  addMeeting,
  deleteMeeting,
  getMeetingById,
  getMeetings,
  getUserById,
  updateMeeting,
  dbRevertMeetingDeduction
} from '../../data-store';
import { ensureUserPermission } from '../permissions';
import { revalidatePath } from 'next/cache';
import { makeAdmin, makeMeeting, makeUser } from './fixtures';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

vi.mock('../permissions', () => ({
  ensureUserPermission: vi.fn()
}));

vi.mock('../../data-store', () => ({
  addMeeting: vi.fn(),
  updateMeeting: vi.fn(),
  deleteMeeting: vi.fn(),
  getMeetingById: vi.fn(),
  dbRevertMeetingDeduction: vi.fn(),
  getMeetings: vi.fn(),
  getUserById: vi.fn()
}));

const mockEnsureUserPermission = vi.mocked(ensureUserPermission);
const mockAddMeeting = vi.mocked(addMeeting);
const mockUpdateMeeting = vi.mocked(updateMeeting);
const mockDeleteMeeting = vi.mocked(deleteMeeting);
const mockGetMeetingById = vi.mocked(getMeetingById);
const mockGetMeetings = vi.mocked(getMeetings);
const mockGetUserById = vi.mocked(getUserById);
const mockRevertMeetingDeduction = vi.mocked(dbRevertMeetingDeduction);
const mockRevalidatePath = vi.mocked(revalidatePath);

describe('getMeetingByIdAction', () => {
  beforeEach(() => {
    mockGetMeetingById.mockReset();
  });

  it('returns error when meeting is not found', async () => {
    mockGetMeetingById.mockResolvedValue(null);
    const result = await getMeetingByIdAction('m1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('모임을 찾을 수 없습니다');
  });

  it('returns error when data-store throws', async () => {
    mockGetMeetingById.mockRejectedValue(new Error('boom'));
    const result = await getMeetingByIdAction('m1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
});

describe('createMeetingAction', () => {
  beforeEach(() => {
    mockEnsureUserPermission.mockReset();
    mockAddMeeting.mockReset();
    mockRevalidatePath.mockReset();
  });

  it('rejects missing groupId for non-temporary meeting', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeUser({ id: 'u1' })
    });

    const result = await createMeetingAction(
      {
        name: '모임',
        dateTime: new Date(),
        groupId: '',
        locationName: '장소',
        participantIds: [],
        nonReserveFundParticipants: [],
        useReserveFund: false,
        isTemporary: false
      },
      'u1'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('친구 그룹을 선택');
  });

  it('creates temporary meeting without reserve fields', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeUser({ id: 'u1' })
    });
    mockAddMeeting.mockResolvedValue({ id: 'm1' });

    await createMeetingAction(
      {
        name: '임시 모임',
        dateTime: new Date(),
        groupId: '',
        locationName: '장소',
        participantIds: ['f1'],
        nonReserveFundParticipants: ['f1'],
        useReserveFund: true,
        partialReserveFundAmount: 1000,
        isTemporary: true,
        temporaryParticipants: [{ name: '임시' }],
        totalFee: 20000
      },
      'u1'
    );

    const payload = mockAddMeeting.mock.calls[0][0];
    expect(payload.isTemporary).toBe(true);
    expect(payload.participantIds).toBeUndefined();
    expect(payload.useReserveFund).toBeUndefined();
    expect(payload.partialReserveFundAmount).toBeUndefined();
    expect(payload.nonReserveFundParticipants).toBeUndefined();
  });

  it('returns error when data-store throws', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeUser({ id: 'u1' })
    });
    mockAddMeeting.mockRejectedValue(new Error('failed'));

    const result = await createMeetingAction(
      {
        name: '모임',
        dateTime: new Date(),
        groupId: 'g1',
        locationName: '장소',
        participantIds: [],
        nonReserveFundParticipants: [],
        useReserveFund: false,
        isTemporary: false
      },
      'u1'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('failed');
  });
});

describe('updateMeetingAction', () => {
  beforeEach(() => {
    mockEnsureUserPermission.mockReset();
    mockGetMeetingById.mockReset();
    mockUpdateMeeting.mockReset();
    mockRevertMeetingDeduction.mockReset();
    mockRevalidatePath.mockReset();
  });

  it('returns error when meeting does not exist', async () => {
    mockGetMeetingById.mockResolvedValue(null);
    const result = await updateMeetingAction('m1', { name: '수정' }, 'u1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('수정할 모임을 찾을 수 없습니다');
  });

  it('reverts reserve deduction when settled meeting reserve settings change', async () => {
    mockGetMeetingById.mockResolvedValue(
      makeMeeting({
        creatorId: 'u1',
        useReserveFund: true,
        partialReserveFundAmount: 1000,
        isSettled: true
      })
    );
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeUser({ id: 'u1' })
    });
    mockUpdateMeeting.mockResolvedValue({ id: 'm1' });

    const result = await updateMeetingAction('m1', { useReserveFund: false }, 'u1');

    expect(result.success).toBe(true);
    expect(mockRevertMeetingDeduction).toHaveBeenCalledWith('m1');
    expect(mockUpdateMeeting).toHaveBeenCalledWith('m1', expect.objectContaining({ isSettled: false }));
    expect(mockRevalidatePath).toHaveBeenCalledWith('/reserve-fund');
  });

  it('returns error when updateMeeting returns null', async () => {
    mockGetMeetingById.mockResolvedValue(makeMeeting({ creatorId: 'u1' }));
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeUser({ id: 'u1' })
    });
    mockUpdateMeeting.mockResolvedValue(null);

    const result = await updateMeetingAction('m1', { name: '수정' }, 'u1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('모임 업데이트에 실패했습니다');
  });
});

describe('deleteMeetingAction', () => {
  beforeEach(() => {
    mockEnsureUserPermission.mockReset();
    mockGetMeetingById.mockReset();
    mockDeleteMeeting.mockReset();
    mockRevalidatePath.mockReset();
  });

  it('returns error when meeting does not exist', async () => {
    mockGetMeetingById.mockResolvedValue(null);
    const result = await deleteMeetingAction('m1', 'u1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('삭제할 모임을 찾을 수 없습니다');
  });

  it('deletes meeting when authorized', async () => {
    mockGetMeetingById.mockResolvedValue({
      id: 'm1',
      creatorId: 'u1'
    });
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeUser({ id: 'u1' })
    });

    const result = await deleteMeetingAction('m1', 'u1');

    expect(result.success).toBe(true);
    expect(mockDeleteMeeting).toHaveBeenCalledWith('m1');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/meetings');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/');
  });

  it('returns error when deleteMeeting throws', async () => {
    mockGetMeetingById.mockResolvedValue({ id: 'm1', creatorId: 'u1' });
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeUser({ id: 'u1' })
    });
    mockDeleteMeeting.mockRejectedValue(new Error('nope'));

    const result = await deleteMeetingAction('m1', 'u1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('nope');
  });
});

describe('getMeetingsForUserAction', () => {
  beforeEach(() => {
    mockGetUserById.mockReset();
    mockGetMeetings.mockReset();
  });

  it('returns error when user is not found', async () => {
    mockGetUserById.mockResolvedValue(null);
    const result = await getMeetingsForUserAction({ requestingUserId: 'missing' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('User not found');
  });

  it('passes no filters for admin', async () => {
    mockGetUserById.mockResolvedValue({
      ...makeAdmin()
    });
    mockGetMeetings.mockResolvedValue({ meetings: [], totalCount: 0, availableYears: [] });

    const result = await getMeetingsForUserAction({ requestingUserId: 'admin-1' });

    expect(result.success).toBe(true);
    expect(mockGetMeetings).toHaveBeenCalledWith({
      year: undefined,
      page: undefined,
      limitParam: undefined,
      userId: undefined,
      userFriendGroupIds: undefined
    });
  });

  it('passes user filters for non-admin', async () => {
    mockGetUserById.mockResolvedValue({
      ...makeUser({ id: 'u1', friendGroupIds: ['g1'] })
    });
    mockGetMeetings.mockResolvedValue({ meetings: [], totalCount: 0, availableYears: [] });

    const result = await getMeetingsForUserAction({ requestingUserId: 'u1' });

    expect(result.success).toBe(true);
    expect(mockGetMeetings).toHaveBeenCalledWith({
      year: undefined,
      page: undefined,
      limitParam: undefined,
      userId: 'u1',
      userFriendGroupIds: ['g1']
    });
  });

  it('returns error when data-store throws', async () => {
    mockGetUserById.mockResolvedValue(makeUser({ id: 'u1' }));
    mockGetMeetings.mockRejectedValue(new Error('db error'));

    const result = await getMeetingsForUserAction({ requestingUserId: 'u1' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('db error');
  });
});
