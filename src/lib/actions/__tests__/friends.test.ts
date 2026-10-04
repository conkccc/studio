import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFriendAction, deleteFriendAction, getAllFriendsAction, getFriendsByGroupAction, getFriendsForUserAction, updateFriendAction } from '../friends';
import { addFriend, dbGetFriendById, dbGetFriendsByUserFriendGroupIds, deleteFriend, getFriendGroupById, getFriendGroupsByUser, getFriends, getFriendsByGroup, updateFriend } from '../../data-store';
import { ensureUserPermission } from '../permissions';
import { makeAdmin, makeFriend, makeFriendGroup, makeUser } from './fixtures';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../permissions', () => ({ ensureUserPermission: vi.fn() }));
vi.mock('../../data-store', () => ({
  addFriend: vi.fn(), updateFriend: vi.fn(), deleteFriend: vi.fn(), getFriends: vi.fn(),
  getFriendsByGroup: vi.fn(), dbGetFriendsByUserFriendGroupIds: vi.fn(), dbGetFriendById: vi.fn(),
  getFriendGroupById: vi.fn(), getFriendGroupsByUser: vi.fn(), getMeetingById: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeUser() });
  vi.mocked(getFriendGroupById).mockResolvedValue(makeFriendGroup());
  vi.mocked(getFriendGroupsByUser).mockResolvedValue([makeFriendGroup()]);
  vi.mocked(dbGetFriendById).mockResolvedValue(makeFriend());
  vi.mocked(getFriendsByGroup).mockResolvedValue([makeFriend()]);
  vi.mocked(addFriend).mockResolvedValue(makeFriend());
  vi.mocked(updateFriend).mockResolvedValue(makeFriend());
  vi.mocked(dbGetFriendsByUserFriendGroupIds).mockResolvedValue([makeFriend()]);
  vi.mocked(getFriends).mockResolvedValue([makeFriend()]);
});

describe('authorized friend reads', () => {
  it('returns an empty denied result for an outsider without querying friends', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeUser({ id: 'outsider' }) });
    const result = await getFriendsByGroupAction('g1');
    expect(result.success).toBe(false);
    expect(result.friends).toEqual([]);
    expect(getFriendsByGroup).not.toHaveBeenCalled();
  });

  it('scopes viewer friend reads to explicit referenced group IDs', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeUser({ role: 'viewer', friendGroupIds: ['g1'] }) });
    expect((await getFriendsForUserAction('u1')).success).toBe(true);
    expect(dbGetFriendsByUserFriendGroupIds).toHaveBeenCalledWith(['g1']);
    expect(getFriends).not.toHaveBeenCalled();
    expect(getFriendGroupsByUser).not.toHaveBeenCalled();
  });

  it('does not query all friends unless an administrator passes verification', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: false, error: '관리자 권한 필요' });
    expect((await getAllFriendsAction()).success).toBe(false);
    expect(getFriends).not.toHaveBeenCalled();
    expect(ensureUserPermission).toHaveBeenCalledWith(undefined, { requiredRole: 'admin' });
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeAdmin() });
    expect((await getAllFriendsAction()).friends).toMatchObject([{ id: 'f1', name: '친구', groupId: 'g1' }]);
    expect(getFriends).toHaveBeenCalledTimes(1);
  });
});

describe('friend management', () => {
  it('denies adding a friend to an unrelated or read-only referenced group', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeUser({ id: 'reader', friendGroupIds: ['g1'] }) });
    expect((await createFriendAction({ name: '친구', groupId: 'g1', currentUserId: 'reader' })).success).toBe(false);
    expect(addFriend).not.toHaveBeenCalled();
  });

  it('allows a group owner to create a friend with normalized input', async () => {
    expect((await createFriendAction({ name: '  친구  ', description: '설명', groupId: 'g1', currentUserId: 'u1' })).success).toBe(true);
    expect(addFriend).toHaveBeenCalledWith({ name: '친구', description: '설명', groupId: 'g1' });
  });

  it('authorizes the stored group and ignores a payload attempting to move a friend', async () => {
    expect((await updateFriendAction('f1', { name: '  수정  ', groupId: 'attacker-group' })).success).toBe(true);
    expect(getFriendGroupById).toHaveBeenCalledWith('g1');
    expect(updateFriend).toHaveBeenCalledWith('f1', { name: '수정', description: '' });
  });

  it('does not report a successful update when the repository returns null', async () => {
    vi.mocked(updateFriend).mockResolvedValue(null);
    expect((await updateFriendAction('f1', { name: '수정' })).success).toBe(false);
  });

  it('denies archiving a friend from another group even when the request group is owned', async () => {
    vi.mocked(dbGetFriendById).mockResolvedValue(makeFriend({ groupId: 'other-group' }));
    expect((await deleteFriendAction({ friendId: 'f1', groupId: 'g1', currentUserId: 'u1' })).success).toBe(false);
    expect(deleteFriend).not.toHaveBeenCalled();
  });

  it('archives a friend only after group ownership and stored membership both pass', async () => {
    expect((await deleteFriendAction({ friendId: 'f1', groupId: 'g1', currentUserId: 'u1' })).success).toBe(true);
    expect(deleteFriend).toHaveBeenCalledWith('f1');
    expect(updateFriend).not.toHaveBeenCalled();
  });
});
