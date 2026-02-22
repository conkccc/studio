import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFriendGroupAction,
  deleteFriendGroupAction,
  getFriendGroupsForUserAction,
  updateFriendGroupAction
} from '../friend-groups';
import {
  addFriendGroup,
  updateFriendGroup,
  deleteFriendGroup,
  getFriendGroupsByUser,
  dbGetAllFriendGroups,
  getUserById
} from '../../data-store';
import { ensureUserPermission } from '../permissions';
import { revalidatePath } from 'next/cache';
import { doc, getDoc } from 'firebase/firestore';
import { makeAdmin, makeFriendGroup, makeUser } from './fixtures';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

vi.mock('../permissions', () => ({
  ensureUserPermission: vi.fn()
}));

vi.mock('../../data-store', () => ({
  addFriendGroup: vi.fn(),
  updateFriendGroup: vi.fn(),
  deleteFriendGroup: vi.fn(),
  getFriendGroupsByUser: vi.fn(),
  dbGetAllFriendGroups: vi.fn(),
  getUserById: vi.fn()
}));

vi.mock('firebase/firestore', () => {
  class TimestampMock {
    private ms: number;
    constructor(ms: number) {
      this.ms = ms;
    }
    toMillis() {
      return this.ms;
    }
    static fromMillis(ms: number) {
      return new TimestampMock(ms);
    }
  }

  return {
    doc: vi.fn(),
    getDoc: vi.fn(),
    Timestamp: TimestampMock
  };
});

vi.mock('../../firebase', () => ({
  db: {}
}));

const mockEnsureUserPermission = vi.mocked(ensureUserPermission);
const mockAddFriendGroup = vi.mocked(addFriendGroup);
const mockUpdateFriendGroup = vi.mocked(updateFriendGroup);
const mockDeleteFriendGroup = vi.mocked(deleteFriendGroup);
const mockGetFriendGroupsByUser = vi.mocked(getFriendGroupsByUser);
const mockGetAllFriendGroups = vi.mocked(dbGetAllFriendGroups);
const mockGetUserById = vi.mocked(getUserById);
const mockRevalidatePath = vi.mocked(revalidatePath);
const mockDoc = vi.mocked(doc);
const mockGetDoc = vi.mocked(getDoc);

describe('createFriendGroupAction', () => {
  beforeEach(() => {
    mockEnsureUserPermission.mockReset();
    mockAddFriendGroup.mockReset();
    mockRevalidatePath.mockReset();
  });

  it('returns permission error when not authorized', async () => {
    mockEnsureUserPermission.mockResolvedValue({ success: false, error: '권한 없음' });

    const result = await createFriendGroupAction('그룹', 'u1', []);

    expect(result.success).toBe(false);
    expect(result.error).toBe('권한 없음');
  });

  it('creates group and revalidates paths', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeUser({ id: 'u1' })
    });
    mockAddFriendGroup.mockResolvedValue({ id: 'g1' });

    const result = await createFriendGroupAction('그룹', 'u1', ['f1']);

    expect(result.success).toBe(true);
    expect(mockAddFriendGroup).toHaveBeenCalledWith({ name: '그룹', ownerUserId: 'u1', memberIds: ['f1'] });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/friends');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/meetings/new');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/groups');
  });
});

describe('updateFriendGroupAction', () => {
  beforeEach(() => {
    mockEnsureUserPermission.mockReset();
    mockUpdateFriendGroup.mockReset();
    mockDoc.mockReset();
    mockGetDoc.mockReset();
  });

  it('returns error when group does not exist', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeUser({ id: 'u1' })
    });
    mockDoc.mockReturnValue({} as ReturnType<typeof doc>);
    mockGetDoc.mockResolvedValue({ exists: () => false });

    const result = await updateFriendGroupAction('g1', { name: '수정' }, 'u1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('수정할 친구 그룹을 찾을 수 없습니다');
  });

  it('returns error when not owner or admin', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeUser({ id: 'u2' })
    });
    mockDoc.mockReturnValue({} as ReturnType<typeof doc>);
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerUserId: 'u1' })
    });

    const result = await updateFriendGroupAction('g1', { name: '수정' }, 'u2');

    expect(result.success).toBe(false);
    expect(result.error).toContain('친구 그룹을 수정할 권한이 없습니다');
  });

  it('updates group when owner', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeUser({ id: 'u1' })
    });
    mockDoc.mockReturnValue({} as ReturnType<typeof doc>);
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerUserId: 'u1' })
    });
    mockUpdateFriendGroup.mockResolvedValue({ id: 'g1', name: '수정' });

    const result = await updateFriendGroupAction('g1', { name: '수정' }, 'u1');

    expect(result.success).toBe(true);
    expect(mockUpdateFriendGroup).toHaveBeenCalledWith('g1', { name: '수정' });
  });

  it('returns error when updateFriendGroup returns null', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeUser({ id: 'u1' })
    });
    mockDoc.mockReturnValue({} as ReturnType<typeof doc>);
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerUserId: 'u1' })
    });
    mockUpdateFriendGroup.mockResolvedValue(null);

    const result = await updateFriendGroupAction('g1', { name: '수정' }, 'u1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('친구 그룹 업데이트에 실패했습니다');
  });
});

describe('deleteFriendGroupAction', () => {
  beforeEach(() => {
    mockEnsureUserPermission.mockReset();
    mockDeleteFriendGroup.mockReset();
    mockDoc.mockReset();
    mockGetDoc.mockReset();
  });

  it('returns error when group does not exist', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeUser({ id: 'u1' })
    });
    mockDoc.mockReturnValue({} as ReturnType<typeof doc>);
    mockGetDoc.mockResolvedValue({ exists: () => false });

    const result = await deleteFriendGroupAction('g1', 'u1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('삭제할 친구 그룹을 찾을 수 없습니다');
  });

  it('deletes group when admin', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin()
    });
    mockDoc.mockReturnValue({} as ReturnType<typeof doc>);
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerUserId: 'u1' })
    });

    const result = await deleteFriendGroupAction('g1', 'admin-1');

    expect(result.success).toBe(true);
    expect(mockDeleteFriendGroup).toHaveBeenCalledWith('g1');
  });

  it('returns error when deleteFriendGroup throws', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin()
    });
    mockDoc.mockReturnValue({} as ReturnType<typeof doc>);
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerUserId: 'u1' })
    });
    mockDeleteFriendGroup.mockRejectedValue(new Error('boom'));

    const result = await deleteFriendGroupAction('g1', 'admin-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
});

describe('getFriendGroupsForUserAction', () => {
  beforeEach(() => {
    mockGetUserById.mockReset();
    mockGetFriendGroupsByUser.mockReset();
    mockGetAllFriendGroups.mockReset();
  });

  it('returns error when user is missing', async () => {
    mockGetUserById.mockResolvedValue(null);
    const result = await getFriendGroupsForUserAction('missing');
    expect(result.success).toBe(false);
    expect(result.error).toContain('사용자 정보를 찾을 수 없습니다');
  });

  it('filters viewer groups by referenced ids and sorts by createdAt', async () => {
    const { Timestamp: TimestampMock } = await import('firebase/firestore');
    mockGetUserById.mockResolvedValue({
      ...makeUser({ id: 'viewer-1', role: 'viewer', friendGroupIds: ['g2'] })
    });
    mockGetFriendGroupsByUser.mockResolvedValue([
      { id: 'g1', ownerUserId: 'u1', createdAt: TimestampMock.fromMillis(1000) },
      { id: 'g2', ownerUserId: 'u1', createdAt: TimestampMock.fromMillis(2000) }
    ]);

    const result = await getFriendGroupsForUserAction('viewer-1');

    expect(result.success).toBe(true);
    expect(result.groups).toHaveLength(1);
    expect(result.groups?.[0].id).toBe('g2');
  });

  it('returns all groups for admin', async () => {
    mockGetUserById.mockResolvedValue({
      ...makeAdmin()
    });
    mockGetAllFriendGroups.mockResolvedValue([makeFriendGroup({ id: 'g1', ownerUserId: 'u1' })]);

    const result = await getFriendGroupsForUserAction('admin-1');

    expect(result.success).toBe(true);
    expect(mockGetAllFriendGroups).toHaveBeenCalled();
  });

  it('returns error when data-store throws', async () => {
    mockGetUserById.mockResolvedValue(makeUser({ id: 'u1' }));
    mockGetFriendGroupsByUser.mockRejectedValue(new Error('db error'));

    const result = await getFriendGroupsForUserAction('u1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('db error');
  });
});
