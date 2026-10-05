'use server';

import { revalidatePath } from 'next/cache';
import { addFriendGroup, updateFriendGroup, deleteFriendGroup, getFriendGroupsByUser, dbGetAllFriendGroups, getUserById } from '../data-store';
import type { FriendGroup } from '../types';
import { ensureUserPermission } from './permissions';
import { ensureGroupAccess } from '../services/access';

export async function getAllFriendGroupsAction() {
  try {
    const permission = await ensureUserPermission(undefined, { requiredRole: 'admin' });
    if (!permission.success) return { success: false, error: permission.error, groups: [] };
    return { success: true, groups: await dbGetAllFriendGroups() };
  } catch { return { success: false, error: '그룹 목록 조회에 실패했습니다.', groups: [] }; }
}

export async function getFriendGroupsForAdminUserAction(targetUserId: string) {
  try {
    const permission = await ensureUserPermission(undefined, { requiredRole: 'admin' });
    if (!permission.success) return { success: false, error: permission.error, groups: [] };
    if (!targetUserId || targetUserId.length > 128 || targetUserId.includes('/')) return { success: false, error: '사용자 정보를 확인해주세요.', groups: [] };
    return { success: true, groups: await getFriendGroupsByUser(targetUserId) };
  } catch { return { success: false, error: '사용자 그룹을 조회하지 못했습니다.', groups: [] }; }
}

export async function createFriendGroupAction(name: string, currentUserId: string, memberIds: string[] = []) {
  const permission = await ensureUserPermission(currentUserId, { requiredRole: ['user', 'admin'] });
  if (!permission.success || !permission.user) return { success: false, error: permission.error };
  if (!name?.trim() || name.length > 100) return { success: false, error: '그룹 이름은 1~100자로 입력해주세요.' };
  if (memberIds.length) return { success: false, error: '그룹을 만든 뒤 친구를 추가해주세요.' };
  try {
    const group = await addFriendGroup({ name: name.trim(), ownerUserId: permission.user.id, memberIds: [] });
    revalidatePath('/friends');
    return { success: true, group };
  } catch { return { success: false, error: '친구 그룹 생성에 실패했습니다.' }; }
}

export async function updateFriendGroupAction(id: string, updates: Partial<Omit<FriendGroup, 'id' | 'createdAt'>>, currentUserId: string) {
  try {
    const access = await ensureGroupAccess(id, currentUserId, true);
    if (!access.success) return access;
    if (!updates.name?.trim() || updates.name.length > 100) return { success: false, error: '그룹 이름을 확인해주세요.' };
    const group = await updateFriendGroup(id, { name: updates.name.trim() });
    if (!group) return { success: false, error: '친구 그룹을 찾을 수 없습니다.' };
    revalidatePath('/friends');
    return { success: true, group };
  } catch { return { success: false, error: '친구 그룹 수정에 실패했습니다.' }; }
}

export async function deleteFriendGroupAction(id: string, currentUserId: string) {
  try {
    const access = await ensureGroupAccess(id, currentUserId, true);
    if (!access.success) return access;
    await deleteFriendGroup(id);
    revalidatePath('/friends');
    return { success: true };
  } catch { return { success: false, error: '친구 그룹 삭제에 실패했습니다.' }; }
}

export async function getFriendGroupsForUserAction(currentUserId?: string) {
  try {
    const permission = await ensureUserPermission(currentUserId);
    if (!permission.success || !permission.user) return { success: false, error: permission.error, groups: [] };
    const user = permission.user;
    let groups = user.role === 'admin' ? await dbGetAllFriendGroups() : await getFriendGroupsByUser(user.id);
    if (user.role === 'viewer') groups = groups.filter(group => user.friendGroupIds?.includes(group.id));
    const ownerIds = Array.from(new Set(groups.map(group => group.ownerUserId))).filter(id => id !== user.id || !user.name?.trim());
    const owners = await Promise.all(ownerIds.map(id => getUserById(id)));
    const names = new Map(owners.filter(Boolean).map(owner => [owner!.id, owner!.name || '사용자']));
    if (user.name?.trim()) names.set(user.id, user.name);
    return { success: true, groups: groups.map(group => ({ ...group, ownerName: names.get(group.ownerUserId) || '사용자',
      isOwned: user.role !== 'viewer' && group.ownerUserId === user.id, isReferenced: user.friendGroupIds?.includes(group.id) || false })) };
  } catch { return { success: false, error: '친구 그룹 목록을 불러오지 못했습니다.', groups: [] }; }
}
