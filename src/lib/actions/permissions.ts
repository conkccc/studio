import { getUserById as dbGetUserById } from '../data-store';
import type { User } from '../types';
import { getAuthenticatedUserId } from '../auth/session';
import { currentRequestUser } from '../auth/request-user';

export type UserRole = 'admin' | 'user' | 'viewer' | 'none';

interface PermissionCheckOptions {
  requiredRole?: UserRole | UserRole[];
  ownerId?: string;
  adminCanOverride?: boolean;
  entityName?: string;
}

interface PermissionCheckResult {
  success: boolean;
  user?: User;
  error?: string;
}

export async function ensureUserPermission(
  currentUserId: string | null | undefined,
  options: PermissionCheckOptions = {}
): Promise<PermissionCheckResult> {
  const verifiedUser = currentRequestUser();
  const authenticatedUserId = verifiedUser?.id || await getAuthenticatedUserId();
  if (!authenticatedUserId) {
    return { success: false, error: "인증되지 않은 사용자입니다. 로그인이 필요합니다." };
  }

  if (currentUserId && currentUserId !== authenticatedUserId) {
    return { success: false, error: '로그인한 사용자와 요청한 사용자 정보가 일치하지 않습니다.' };
  }
  const currentUser = verifiedUser || await dbGetUserById(authenticatedUserId);
  if (!currentUser) {
    return { success: false, error: "사용자 정보를 찾을 수 없습니다." };
  }
  if (!['admin', 'user', 'viewer', 'none'].includes(currentUser.role)) {
    return { success: false, error: '유효하지 않은 사용자 권한입니다.' };
  }

  const { requiredRole, ownerId, adminCanOverride = true, entityName = '작업' } = options;

  if (currentUser.role === 'none' && !(Array.isArray(requiredRole) ? requiredRole : [requiredRole]).includes('none')) {
    return { success: false, error: '관리자의 승인이 필요한 계정입니다.' };
  }

  if (requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!roles.includes(currentUser.role as UserRole)) {
      return {
        success: false,
        error: `${entityName}을(를) 수행할 권한이 없습니다. 필요한 역할: ${roles.join(', ')}`
      };
    }
  }

  if (ownerId && currentUser.id !== ownerId) {
    if (adminCanOverride && currentUser.role === 'admin') {
      // 관리자는 소유자 제한을 우회할 수 있음
    } else {
      return {
        success: false,
        error: `${entityName}은(는) 소유자 또는 관리자만 수행할 수 있습니다.`
      };
    }
  }

  return { success: true, user: currentUser };
}
