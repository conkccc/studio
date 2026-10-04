import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureUserPermission } from '../permissions';
import { getUserById } from '../../data-store';
import { makeAdmin, makeUser } from './fixtures';
import { getAuthenticatedUserId } from '../../auth/session';

vi.mock('../../auth/session', () => ({ getAuthenticatedUserId: vi.fn() }));

vi.mock('../../data-store', () => ({
  getUserById: vi.fn()
}));

const mockGetUserById = vi.mocked(getUserById);
const mockGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);

describe('ensureUserPermission', () => {
  beforeEach(() => {
    mockGetUserById.mockReset();
    mockGetAuthenticatedUserId.mockReset();
    mockGetAuthenticatedUserId.mockResolvedValue('u1');
  });

  it('returns error when user is not authenticated', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null);
    const result = await ensureUserPermission(null);
    expect(result.success).toBe(false);
    expect(result.error).toContain('로그인이 필요합니다');
  });

  it('returns error when user cannot be found', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('missing-user');
    mockGetUserById.mockResolvedValue(undefined);
    const result = await ensureUserPermission('missing-user');
    expect(result.success).toBe(false);
    expect(result.error).toContain('사용자 정보를 찾을 수 없습니다');
  });

  it('returns error when required role is not satisfied', async () => {
    mockGetUserById.mockResolvedValue({
      ...makeUser({ id: 'u1' })
    });
    const result = await ensureUserPermission('u1', { requiredRole: 'admin', entityName: '테스트' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('필요한 역할: admin');
  });

  it('returns error when ownerId mismatch and not admin', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('u2');
    mockGetUserById.mockResolvedValue({
      ...makeUser({ id: 'u2' })
    });
    const result = await ensureUserPermission('u2', { ownerId: 'owner-id', entityName: '테스트' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('소유자 또는 관리자만');
  });

  it('allows admin to override ownerId mismatch when adminCanOverride is true', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('admin-1');
    mockGetUserById.mockResolvedValue({
      ...makeAdmin()
    });
    const result = await ensureUserPermission('admin-1', { ownerId: 'owner-id', entityName: '테스트' });
    expect(result.success).toBe(true);
    expect(result.user?.id).toBe('admin-1');
  });

  it('returns success when all checks pass', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('u3');
    mockGetUserById.mockResolvedValue({
      ...makeUser({ id: 'u3' })
    });
    const result = await ensureUserPermission('u3');
    expect(result.success).toBe(true);
    expect(result.user?.id).toBe('u3');
  });

  it('rejects a forged admin UID before loading its profile', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue('u1');
    const result = await ensureUserPermission('admin-1', { requiredRole: 'admin' });
    expect(result.success).toBe(false);
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('uses the verified session identity when a UID is omitted', async () => {
    mockGetUserById.mockResolvedValue(makeUser());
    const result = await ensureUserPermission(undefined);
    expect(result.success).toBe(true);
    expect(mockGetUserById).toHaveBeenCalledWith('u1');
  });

  it('blocks unapproved accounts even without an explicit required role', async () => {
    mockGetUserById.mockResolvedValue(makeUser({ role: 'none' }));
    expect((await ensureUserPermission('u1')).success).toBe(false);
  });

  it('rejects a malformed stored role instead of granting default access', async () => {
    mockGetUserById.mockResolvedValue(makeUser({ role: 'unexpected' as never }));
    expect((await ensureUserPermission('u1')).success).toBe(false);
  });
});
