import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accessibleGroupIds, ensureGroupAccess, ensureMeetingAccess } from '../access';
import { ensureUserPermission } from '../../actions/permissions';
import { getFriendGroupById, getFriendGroupsByUser, getMeetingById } from '../../data-store';
import { makeAdmin, makeFriendGroup, makeMeeting, makeUser } from '../../actions/__tests__/fixtures';

vi.mock('server-only', () => ({}));
vi.mock('../../actions/permissions', () => ({ ensureUserPermission: vi.fn() }));
vi.mock('../../data-store', () => ({ getFriendGroupById: vi.fn(), getFriendGroupsByUser: vi.fn(), getMeetingById: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeUser() });
  vi.mocked(getFriendGroupById).mockResolvedValue(makeFriendGroup());
  vi.mocked(getFriendGroupsByUser).mockResolvedValue([makeFriendGroup()]);
  vi.mocked(getMeetingById).mockResolvedValue(makeMeeting());
});

describe('accessibleGroupIds', () => {
  it('preserves archived ownership and explicit references for historical access', async () => {
    vi.mocked(getFriendGroupsByUser).mockResolvedValue([
      makeFriendGroup({ id: 'archived-owned', isArchived: true }),
      makeFriendGroup({ id: 'referenced', ownerUserId: 'someone-else' }),
    ]);
    const ids = await accessibleGroupIds(makeUser({ friendGroupIds: ['referenced', 'archived-reference'] }));
    expect(new Set(ids)).toEqual(new Set(['archived-owned', 'referenced', 'archived-reference']));
    expect(ids).toHaveLength(3);
    expect(getFriendGroupsByUser).toHaveBeenCalledWith('u1', true);
  });

  it('does not use previous ownership to expand a viewer account', async () => {
    expect(await accessibleGroupIds(makeUser({ role: 'viewer', friendGroupIds: ['readable'] }))).toEqual(['readable']);
    expect(getFriendGroupsByUser).not.toHaveBeenCalled();
    expect(await accessibleGroupIds(makeUser({ role: 'viewer' }))).toEqual([]);
  });
});

describe('group access', () => {
  it('does not query data after failed authentication', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: false, error: '로그인 필요' });
    expect(await ensureGroupAccess('g1')).toEqual({ success: false, error: '로그인 필요' });
    expect(getFriendGroupById).not.toHaveBeenCalled();
  });

  it('denies an unrelated user without returning group or user data', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeUser({ id: 'outsider' }) });
    const result = await ensureGroupAccess('g1', 'outsider');
    expect(result.success).toBe(false);
    expect(result).not.toHaveProperty('group');
    expect(result).not.toHaveProperty('user');
  });

  it('allows the owner to read and manage without requiring a reference', async () => {
    expect((await ensureGroupAccess('g1', 'u1')).success).toBe(true);
    expect((await ensureGroupAccess('g1', 'u1', true)).success).toBe(true);
    expect(ensureUserPermission).toHaveBeenLastCalledWith('u1', { requiredRole: ['user', 'admin'] });
  });

  it('allows referenced reads but does not turn references into management rights', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeUser({ id: 'reader', friendGroupIds: ['g1'] }) });
    expect((await ensureGroupAccess('g1', 'reader')).success).toBe(true);
    expect((await ensureGroupAccess('g1', 'reader', true)).success).toBe(false);
  });

  it('limits a viewer to references even when stored ownership matches', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeUser({ role: 'viewer' }) });
    expect((await ensureGroupAccess('g1', 'u1')).success).toBe(false);
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeUser({ role: 'viewer', friendGroupIds: ['g1'] }) });
    expect((await ensureGroupAccess('g1', 'u1')).success).toBe(true);
    expect((await ensureGroupAccess('g1', 'u1', true)).success).toBe(false);
  });

  it('keeps an archived group readable but blocks edits for owners and administrators', async () => {
    vi.mocked(getFriendGroupById).mockResolvedValue(makeFriendGroup({ isArchived: true }));
    expect((await ensureGroupAccess('g1', 'u1')).success).toBe(true);
    expect((await ensureGroupAccess('g1', 'u1', true)).success).toBe(false);
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeAdmin() });
    expect((await ensureGroupAccess('g1', 'admin-1')).success).toBe(true);
    expect((await ensureGroupAccess('g1', 'admin-1', true)).success).toBe(false);
  });
});

describe('meeting access', () => {
  it('does not query meetings after failed authentication', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: false, error: '로그인 필요' });
    expect((await ensureMeetingAccess('m1')).success).toBe(false);
    expect(getMeetingById).not.toHaveBeenCalled();
  });

  it('returns no meeting details or user information to an outsider', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeUser({ id: 'outsider' }) });
    vi.mocked(getFriendGroupsByUser).mockResolvedValue([]);
    const result = await ensureMeetingAccess('m1', 'outsider');
    expect(result.success).toBe(false);
    expect(result).not.toHaveProperty('meeting');
    expect(result).not.toHaveProperty('user');
  });

  it('allows a creator to read and manage even without group references', async () => {
    vi.mocked(getFriendGroupsByUser).mockResolvedValue([]);
    expect((await ensureMeetingAccess('m1', 'u1')).success).toBe(true);
    expect((await ensureMeetingAccess('m1', 'u1', true)).success).toBe(true);
    expect(getFriendGroupsByUser).not.toHaveBeenCalled();
  });

  it('allows a group owner to read a past meeting after its group is archived', async () => {
    vi.mocked(getMeetingById).mockResolvedValue(makeMeeting({ creatorId: 'someone-else', groupId: 'archived-group' }));
    vi.mocked(getFriendGroupsByUser).mockResolvedValue([makeFriendGroup({ id: 'archived-group', isArchived: true })]);
    expect((await ensureMeetingAccess('m1', 'u1')).success).toBe(true);
    expect(getFriendGroupsByUser).toHaveBeenCalledWith('u1', true);
    expect((await ensureMeetingAccess('m1', 'u1', true)).success).toBe(false);
  });

  it('lets a viewer read only referenced group meetings and never manage them', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeUser({ role: 'viewer', friendGroupIds: ['g1'] }) });
    expect((await ensureMeetingAccess('m1', 'u1')).success).toBe(true);
    expect((await ensureMeetingAccess('m1', 'u1', true)).success).toBe(false);
    vi.mocked(getMeetingById).mockResolvedValue(makeMeeting({ groupId: 'unreferenced' }));
    expect((await ensureMeetingAccess('m1', 'u1')).success).toBe(false);
    expect(getFriendGroupsByUser).not.toHaveBeenCalled();
  });

  it('allows an administrator across groups without querying their group list', async () => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: true, user: makeAdmin() });
    expect((await ensureMeetingAccess('m1', 'admin-1', true)).success).toBe(true);
    expect(getFriendGroupsByUser).not.toHaveBeenCalled();
  });
});
