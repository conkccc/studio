import { getUserById as dbGetUserById } from '../data-store';
import type { User } from '../types';

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
  if (!currentUserId) {
    return { success: false, error: "인증되지 않은 사용자입니다. 로그인이 필요합니다." };
  }

  const currentUser = await dbGetUserById(currentUserId);
  if (!currentUser) {
    return { success: false, error: "사용자 정보를 찾을 수 없습니다." };
  }

  const { requiredRole, ownerId, adminCanOverride = true, entityName = '작업' } = options;

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
