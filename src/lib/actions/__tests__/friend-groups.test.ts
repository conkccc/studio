import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFriendGroupAction, deleteFriendGroupAction, getAllFriendGroupsAction, getFriendGroupsForUserAction, updateFriendGroupAction } from '../friend-groups';
import { addFriendGroup, deleteFriendGroup, dbGetAllFriendGroups, getFriendGroupById, getFriendGroupsByUser, getUserById, updateFriendGroup } from '../../data-store';
import { ensureUserPermission } from '../permissions';
import { revalidatePath } from 'next/cache';
import { makeAdmin, makeFriendGroup, makeUser } from './fixtures';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../permissions', () => ({ ensureUserPermission: vi.fn() }));
vi.mock('../../data-store', () => ({
  addFriendGroup: vi.fn(), deleteFriendGroup: vi.fn(), dbGetAllFriendGroups: vi.fn(),
  getFriendGroupById: vi.fn(), getFriendGroupsByUser: vi.fn(), getUserById: vi.fn(),
  updateFriendGroup: vi.fn(), getMeetingById: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeUser() });
  vi.mocked(getFriendGroupById).mockResolvedValue(makeFriendGroup());
  vi.mocked(addFriendGroup).mockResolvedValue(makeFriendGroup());
  vi.mocked(updateFriendGroup).mockResolvedValue(makeFriendGroup({ name: '새 이름' }));
  vi.mocked(getFriendGroupsByUser).mockResolvedValue([makeFriendGroup()]);
  vi.mocked(dbGetAllFriendGroups).mockResolvedValue([makeFriendGroup()]);
  vi.mocked(getUserById).mockResolvedValue(makeUser({ name: '그룹 소유자', email: 'private@example.com', friendGroupIds: ['private-group'] }));
});

describe('friend group creation', () => {
  it('creates an empty group owned by the verified user and trims its name', async () => {
    const result = await createFriendGroupAction('  친구들  ', 'u1');
    expect(result.success).toBe(true);
    expect(addFriendGroup).toHaveBeenCalledWith({ name: '친구들', ownerUserId: 'u1', memberIds: [] });
    expect(ensureUserPermission).toHaveBeenCalledWith('u1', { requiredRole: ['user', 'admin'] });
    expect(revalidatePath).toHaveBeenCalledWith('/friends');
  });

  it('does not create a group for a denied user or import existing friend IDs', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: false, error: '권한 없음' });
    expect((await createFriendGroupAction('친구들', 'viewer')).success).toBe(false);
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeUser() });
    expect((await createFriendGroupAction('친구들', 'u1', ['another-groups-friend'])).success).toBe(false);
    expect(addFriendGroup).not.toHaveBeenCalled();
  });

  it('rejects empty and oversized names without a write', async () => {
    expect((await createFriendGroupAction('   ', 'u1')).success).toBe(false);
    expect((await createFriendGroupAction('x'.repeat(101), 'u1')).success).toBe(false);
    expect(addFriendGroup).not.toHaveBeenCalled();
  });
});

describe('friend group management', () => {
  it('denies changing and archiving an outsider group', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeUser({ id: 'outsider' }) });
    expect((await updateFriendGroupAction('g1', { name: '변경' }, 'outsider')).success).toBe(false);
    expect((await deleteFriendGroupAction('g1', 'outsider')).success).toBe(false);
    expect(updateFriendGroup).not.toHaveBeenCalled();
    expect(deleteFriendGroup).not.toHaveBeenCalled();
  });

  it('does not grant management rights through a read reference', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeUser({ id: 'reader', friendGroupIds: ['g1'] }) });
    expect((await updateFriendGroupAction('g1', { name: '변경' }, 'reader')).success).toBe(false);
    expect(updateFriendGroup).not.toHaveBeenCalled();
  });

  it('allows its owner to rename but does not forward ownership or member changes', async () => {
    const result = await updateFriendGroupAction('g1', { name: '  새 이름  ', ownerUserId: 'attacker', memberIds: ['injected-friend'] }, 'u1');
    expect(result.success).toBe(true);
    expect(updateFriendGroup).toHaveBeenCalledWith('g1', { name: '새 이름' });
    expect(result).toHaveProperty('group.ownerUserId', 'u1');
  });

  it('blocks management of an archived group while preserving its identity', async () => {
    vi.mocked(getFriendGroupById).mockResolvedValue(makeFriendGroup({ isArchived: true }));
    expect((await updateFriendGroupAction('g1', { name: '변경' }, 'u1')).success).toBe(false);
    expect((await deleteFriendGroupAction('g1', 'u1')).success).toBe(false);
    expect(updateFriendGroup).not.toHaveBeenCalled();
    expect(deleteFriendGroup).not.toHaveBeenCalled();
  });

  it('allows an admin to archive a group without changing user references', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeAdmin() });
    expect((await deleteFriendGroupAction('g1', 'admin-1')).success).toBe(true);
    expect(deleteFriendGroup).toHaveBeenCalledWith('g1');
    expect(updateFriendGroup).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/friends');
  });

  it('returns failure for a missing group or unsuccessful repository update', async () => {
    vi.mocked(getFriendGroupById).mockResolvedValue(undefined);
    expect((await updateFriendGroupAction('missing', { name: '변경' }, 'u1')).success).toBe(false);
    expect(updateFriendGroup).not.toHaveBeenCalled();
    vi.mocked(getFriendGroupById).mockResolvedValue(makeFriendGroup());
    vi.mocked(updateFriendGroup).mockResolvedValue(null);
    expect((await updateFriendGroupAction('g1', { name: '변경' }, 'u1')).success).toBe(false);
  });

  it('does not report success when archiving fails', async () => {
    vi.mocked(deleteFriendGroup).mockRejectedValue(new Error('database failure'));
    expect((await deleteFriendGroupAction('g1', 'u1')).success).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('authorized friend group lists', () => {
  it('does not read group or owner data when authentication is denied', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: false, error: '로그인 필요' });
    const result = await getFriendGroupsForUserAction('u1');
    expect(result.success).toBe(false);
    expect(result.groups).toEqual([]);
    expect(getFriendGroupsByUser).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
  });

  it('uses the verified user scope and sends only the owner display name', async () => {
    const user = makeUser({ friendGroupIds: ['referenced'] });
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user });
    vi.mocked(getFriendGroupsByUser).mockResolvedValue([
      makeFriendGroup(), makeFriendGroup({ id: 'referenced', ownerUserId: 'other-owner' }),
    ]);
    vi.mocked(getUserById).mockImplementation(async id => makeUser({ id, name: `${id} 이름`, email: 'private@example.com', friendGroupIds: ['private-group'] }));
    const result = await getFriendGroupsForUserAction();
    expect(result.success).toBe(true);
    expect(getFriendGroupsByUser).toHaveBeenCalledWith('u1');
    expect(dbGetAllFriendGroups).not.toHaveBeenCalled();
    expect(result.groups.map(group => group.id)).toEqual(['g1', 'referenced']);
    expect(result.groups[0]).toMatchObject({ ownerName: 'u1 이름', isOwned: true, isReferenced: false });
    expect(result.groups[1]).toMatchObject({ ownerName: 'other-owner 이름', isOwned: false, isReferenced: true });
    expect(JSON.stringify(result)).not.toContain('private@example.com');
    expect(JSON.stringify(result)).not.toContain('private-group');
    expect(result.groups[0]).not.toHaveProperty('owner');
  });

  it('limits a viewer to explicit references even if they previously owned a group', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeUser({ id: 'viewer', role: 'viewer', friendGroupIds: ['allowed'] }) });
    vi.mocked(getFriendGroupsByUser).mockResolvedValue([
      makeFriendGroup({ id: 'former-owned', ownerUserId: 'viewer' }),
      makeFriendGroup({ id: 'allowed', ownerUserId: 'other-owner' }),
    ]);
    const result = await getFriendGroupsForUserAction('viewer');
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ id: 'allowed', isOwned: false, isReferenced: true });
    expect(getUserById).toHaveBeenCalledTimes(1);
    expect(getUserById).toHaveBeenCalledWith('other-owner');
  });

  it('uses all-group lookup only for administrators', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeAdmin() });
    expect((await getFriendGroupsForUserAction('admin-1')).success).toBe(true);
    expect(dbGetAllFriendGroups).toHaveBeenCalledTimes(1);
    expect(getFriendGroupsByUser).not.toHaveBeenCalled();
  });

  it('guards the all-group action before querying the repository', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: false, error: '관리자 권한 필요' });
    const result = await getAllFriendGroupsAction();
    expect(result.groups).toEqual([]);
    expect(result.success).toBe(false);
    expect(ensureUserPermission).toHaveBeenCalledWith(undefined, { requiredRole: 'admin' });
    expect(dbGetAllFriendGroups).not.toHaveBeenCalled();
  });

  it('returns an empty failed list on a database error', async () => {
    vi.mocked(getFriendGroupsByUser).mockRejectedValue(new Error('database failure'));
    const result = await getFriendGroupsForUserAction('u1');
    expect(result.success).toBe(false);
    expect(result.groups).toEqual([]);
  });
});
