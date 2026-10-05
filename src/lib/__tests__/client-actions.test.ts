import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMeetingAction, updateExpenseAction, updateMeetingPrepAction } from '../client-actions';
import * as actions from '../actions';
import { invalidateAppData } from '../app-query-client';
import { makeMeeting } from '../actions/__tests__/fixtures';

vi.mock('../actions', () => ({ createMeetingAction: vi.fn(), updateExpenseAction: vi.fn(), updateMeetingPrepAction: vi.fn() }));
vi.mock('../app-query-client', () => ({ invalidateAppData: vi.fn(), getAppQueryClient: vi.fn(), appQueryKey: vi.fn(), currentDataScope: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
describe('client mutation cache invalidation', () => {
  it('invalidates list, dashboard and edit data only after the mutation succeeds', async () => {
    const meeting = makeMeeting();
    vi.mocked(actions.createMeetingAction).mockResolvedValue({ success: true, meeting });
    await createMeetingAction(meeting, 'u1');
    expect(invalidateAppData).toHaveBeenCalledWith(['meetings', 'dashboard', 'meeting-edit']);
  });
  it('does not invalidate cached data for a rejected change', async () => {
    vi.mocked(actions.updateExpenseAction).mockResolvedValue({ success: false, error: '확정된 정산입니다.' });
    const result = await updateExpenseAction('e1', 'm1', { totalAmount: 1 }, 'u1');
    expect(result.success).toBe(false);
    expect(invalidateAppData).not.toHaveBeenCalled();
  });
  it('invalidates both prep list and detail after editing a prep', async () => {
    vi.mocked(actions.updateMeetingPrepAction).mockResolvedValue({ success: true, meetingPrep: { id: 'p1', title: '준비', memo: '', creatorId: 'u1', friendGroupId: 'g1', participantFriendIds: [], selectedMonths: [], createdAt: new Date() } });
    await updateMeetingPrepAction('p1', { title: '수정한 준비' }, 'u1');
    expect(invalidateAppData).toHaveBeenCalledWith(['preps', 'prep-detail']);
  });
});
