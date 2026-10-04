import 'server-only';
import { getFriendGroupsByUser, getFriendGroupById, getMeetingById } from '../data-store';
import { ensureUserPermission } from '../actions/permissions';
import type { User } from '../types';

export async function accessibleGroupIds(user: User): Promise<string[]> {
  if (user.role === 'viewer') return user.friendGroupIds || [];
  const groups = await getFriendGroupsByUser(user.id, true);
  return Array.from(new Set([...(user.friendGroupIds || []), ...groups.map(group => group.id)]));
}

export async function ensureGroupAccess(id: string, clientUserId?: string | null, manage = false) {
  const permission = await ensureUserPermission(clientUserId, manage ? { requiredRole: ['user', 'admin'] } : {});
  if (!permission.success || !permission.user) return { success: false as const, error: permission.error };
  const group = await getFriendGroupById(id);
  if (!group) return { success: false as const, error: '친구 그룹을 찾을 수 없습니다.' };
  const user = permission.user;
  const permitted = user.role === 'admin' || (user.role !== 'viewer' && group.ownerUserId === user.id)
    || (!manage && (user.friendGroupIds || []).includes(id));
  if (!permitted) return { success: false as const, error: '이 친구 그룹에 접근할 권한이 없습니다.' };
  if (manage && group.isArchived) return { success: false as const, error: '보관된 친구 그룹은 수정할 수 없습니다.' };
  return { success: true as const, user, group };
}

export async function ensureMeetingAccess(id: string, clientUserId?: string | null, manage = false) {
  const permission = await ensureUserPermission(clientUserId, manage ? { requiredRole: ['user', 'admin'] } : {});
  if (!permission.success || !permission.user) return { success: false as const, error: permission.error };
  const meeting = await getMeetingById(id);
  if (!meeting) return { success: false as const, error: '모임을 찾을 수 없습니다.' };
  const user = permission.user;
  const permitted = user.role === 'admin' || (user.role !== 'viewer' && meeting.creatorId === user.id)
    || (!manage && (await accessibleGroupIds(user)).includes(meeting.groupId));
  if (!permitted) return { success: false as const, error: '이 모임에 접근할 권한이 없습니다.' };
  return { success: true as const, user, meeting };
}
