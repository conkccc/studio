import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMeetingEditDataAction } from '../page-data';
import { ensureMeetingAccess } from '../../services/access';
import { getExpensesByMeetingId, getMeetingFriends } from '../../data-store';
import { getFriendGroupsForUserAction } from '../friend-groups';
import { getFriendsByGroupAction } from '../friends';
import { makeMeeting, makeUser, makeFriend } from './fixtures';

vi.mock('../../services/access', () => ({ ensureMeetingAccess: vi.fn() }));
vi.mock('../../data-store', () => ({ getExpensesByMeetingId: vi.fn(), getMeetingFriends: vi.fn() }));
vi.mock('../friend-groups', () => ({ getFriendGroupsForUserAction: vi.fn() }));
vi.mock('../friends', () => ({ getFriendsByGroupAction: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ensureMeetingAccess).mockResolvedValue({ success: true, user: makeUser(), meeting: makeMeeting({ participantIds: ['f1'] }) });
  vi.mocked(getMeetingFriends).mockResolvedValue([makeFriend()]);
  vi.mocked(getFriendGroupsForUserAction).mockResolvedValue({ success: true, groups: [] });
  vi.mocked(getFriendsByGroupAction).mockResolvedValue({ success: true, friends: [makeFriend()] });
  vi.mocked(getExpensesByMeetingId).mockResolvedValue([]);
});
describe('meeting edit page bundle', () => {
  it('requires management access before reading page dependencies', async () => {
    vi.mocked(ensureMeetingAccess).mockResolvedValue({ success: false, error: '수정 권한 없음' });
    expect((await getMeetingEditDataAction('m1')).success).toBe(false);
    expect(ensureMeetingAccess).toHaveBeenCalledWith('m1', undefined, true);
    expect(getExpensesByMeetingId).not.toHaveBeenCalled();
    expect(getFriendsByGroupAction).not.toHaveBeenCalled();
  });
  it('starts independent reads together and only loads the selected group once', async () => {
    let complete!: () => void;
    vi.mocked(getExpensesByMeetingId).mockImplementation(() => new Promise(resolve => { complete = () => resolve([]); }));
    vi.mocked(getFriendsByGroupAction).mockImplementation(async () => { complete(); return { success: true, friends: [makeFriend()] }; });
    const result = await getMeetingEditDataAction('m1');
    expect(result.success).toBe(true);
    expect(getFriendsByGroupAction).toHaveBeenCalledOnce();
    expect(getFriendGroupsForUserAction).toHaveBeenCalledOnce();
  });
});
