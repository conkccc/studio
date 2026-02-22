import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assignFriendGroupsToUserAction, updateUserRoleAction } from '../users';
import { updateUser } from '../../data-store';
import { ensureUserPermission } from '../permissions';
import { revalidatePath } from 'next/cache';
import { makeAdmin } from './fixtures';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

vi.mock('../permissions', () => ({
  ensureUserPermission: vi.fn()
}));

vi.mock('../../data-store', () => ({
  getUsers: vi.fn(),
  updateUser: vi.fn()
}));

const mockEnsureUserPermission = vi.mocked(ensureUserPermission);
const mockUpdateUser = vi.mocked(updateUser);
const mockRevalidatePath = vi.mocked(revalidatePath);

describe('assignFriendGroupsToUserAction', () => {
  beforeEach(() => {
    mockEnsureUserPermission.mockReset();
    mockUpdateUser.mockReset();
    mockRevalidatePath.mockReset();
  });

  it('returns error when targetUserId is missing', async () => {
    const result = await assignFriendGroupsToUserAction({
      adminUserId: 'admin-1',
      targetUserId: null,
      friendGroupIds: []
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('대상 사용자 ID가 필요합니다');
  });

  it('returns error when friendGroupIds is missing', async () => {
    const result = await assignFriendGroupsToUserAction({
      adminUserId: 'admin-1',
      targetUserId: 'u1'
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('할당할 그룹 목록 정보가 필요합니다');
  });

  it('returns permission error when not admin', async () => {
    mockEnsureUserPermission.mockResolvedValue({ success: false, error: '권한 없음' });
    const result = await assignFriendGroupsToUserAction({
      adminUserId: 'u1',
      targetUserId: 'u2',
      friendGroupIds: []
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('권한 없음');
  });

  it('updates friend groups and revalidates paths', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin()
    });
    mockUpdateUser.mockResolvedValue({ id: 'u2' });

    const result = await assignFriendGroupsToUserAction({
      adminUserId: 'admin-1',
      targetUserId: 'u2',
      friendGroupIds: ['g1', 'g2']
    });

    expect(result.success).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith('u2', { friendGroupIds: ['g1', 'g2'] });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/users');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/users/u2');
  });

  it('returns error when updateUser returns null', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin()
    });
    mockUpdateUser.mockResolvedValue(null);

    const result = await assignFriendGroupsToUserAction({
      adminUserId: 'admin-1',
      targetUserId: 'u2',
      friendGroupIds: []
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('대상 사용자 정보 업데이트에 실패했습니다');
  });
});

describe('updateUserRoleAction', () => {
  beforeEach(() => {
    mockEnsureUserPermission.mockReset();
    mockUpdateUser.mockReset();
    mockRevalidatePath.mockReset();
  });

  it('blocks updating own role', async () => {
    const result = await updateUserRoleAction('admin-1', 'user', 'admin-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('자신의 역할은 변경할 수 없습니다');
  });

  it('returns permission error when not admin', async () => {
    mockEnsureUserPermission.mockResolvedValue({ success: false, error: '권한 없음' });
    const result = await updateUserRoleAction('u1', 'user', 'not-admin');
    expect(result.success).toBe(false);
    expect(result.error).toBe('권한 없음');
  });

  it('updates role and revalidates users path', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin()
    });
    mockUpdateUser.mockResolvedValue({ id: 'u1', role: 'viewer' });

    const result = await updateUserRoleAction('u1', 'viewer', 'admin-1');

    expect(result.success).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith('u1', { role: 'viewer' });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/users');
  });

  it('returns error when updateUser returns null', async () => {
    mockEnsureUserPermission.mockResolvedValue({
      success: true,
      user: makeAdmin()
    });
    mockUpdateUser.mockResolvedValue(null);

    const result = await updateUserRoleAction('u1', 'viewer', 'admin-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('사용자 역할 업데이트에 실패했습니다');
  });
});
