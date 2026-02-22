'use server';

import { revalidatePath } from 'next/cache';
import { getUsers as dbGetUsers, updateUser as dbUpdateUser } from '../data-store';
import type { User } from '../types';
import { ensureUserPermission } from './permissions';

// 모든 사용자 목록 가져오기
export async function getAllUsersAction() {
  try {
    const users = await dbGetUsers();
    return { success: true, users };
  } catch (error) {
    console.error('getAllUsersAction Error:', error);
    const errorMessage = error instanceof Error ? error.message : '모든 사용자 목록을 가져오는데 실패했습니다.';
    return { success: false, error: errorMessage, users: [] };
  }
}

// Admin Action: Assign friend groups to a user
export async function assignFriendGroupsToUserAction(payload: {
  adminUserId?: string | null;
  targetUserId?: string | null;
  friendGroupIds?: string[] | null;
}) {
  const { targetUserId, friendGroupIds } = payload;

  if (!targetUserId) {
    return { success: false, error: "대상 사용자 ID가 필요합니다." };
  }
  if (friendGroupIds === null || friendGroupIds === undefined) {
    return { success: false, error: "할당할 그룹 목록 정보가 필요합니다 (빈 배열일 수 있음)." };
  }

  const permissionCheck = await ensureUserPermission(payload.adminUserId, {
    requiredRole: 'admin',
    entityName: '친구 그룹 할당'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }

  try {
    const validFriendGroupIds = Array.isArray(friendGroupIds) ? friendGroupIds : [];

    const updatedUser = await dbUpdateUser(targetUserId, { friendGroupIds: validFriendGroupIds });
    if (!updatedUser) {
      return { success: false, error: "대상 사용자 정보 업데이트에 실패했습니다. 사용자를 찾을 수 없거나 업데이트 중 오류가 발생했습니다." };
    }

    revalidatePath('/users');
    revalidatePath(`/users/${targetUserId}`);
    return { success: true, user: updatedUser };

  } catch (error) {
    console.error('assignFriendGroupsToUserAction Error:', error);
    const errorMessage = error instanceof Error ? error.message : '친구 그룹 할당 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}

// 사용자 역할 관리 액션
export async function updateUserRoleAction(userIdToUpdate: string, newRole: User['role'], currentAdminId?: string | null) {
  if (userIdToUpdate === currentAdminId) {
    return { success: false, error: "자신의 역할은 변경할 수 없습니다." };
  }

  const permissionCheck = await ensureUserPermission(currentAdminId, {
    requiredRole: 'admin',
    entityName: '사용자 역할 변경'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }

  try {
    const updatedUser = await dbUpdateUser(userIdToUpdate, { role: newRole });
    if (!updatedUser) {
      return { success: false, error: "사용자 역할 업데이트에 실패했습니다. 사용자를 찾을 수 없습니다." };
    }
    revalidatePath('/users');
    return { success: true, user: updatedUser };
  } catch (error) {
    console.error("updateUserRoleAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '사용자 역할 업데이트 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}
