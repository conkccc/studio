'use server';

import { revalidatePath } from 'next/cache';
import { addFriend, updateFriend, deleteFriend, getFriends, getFriendsByGroup, dbGetFriendsByUserFriendGroupIds, dbGetFriendById } from '../data-store';
import type { Friend } from '../types';
import { ensureUserPermission } from './permissions';
import { ensureGroupAccess, accessibleGroupIds } from '../services/access';

export async function createFriendAction(payload: { name: string; description?: string; groupId: string; currentUserId: string }) {
  if (!payload.name?.trim() || payload.name.length > 100) return { success: false, error: '친구 이름은 1~100자로 입력해주세요.' };
  if (!payload.groupId) return { success: false, error: '그룹 ID가 지정되지 않았습니다.' };
  try {
    const access = await ensureGroupAccess(payload.groupId, payload.currentUserId, true);
    if (!access.success) return access;
    const friend = await addFriend({ name: payload.name.trim(), description: payload.description?.slice(0, 500) || '', groupId: payload.groupId });
    revalidatePath('/friends');
    return { success: true, friend };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '친구 추가에 실패했습니다.' }; }
}

export async function getAllFriendsAction() {
  try {
    const access = await ensureUserPermission(undefined, { requiredRole: 'admin' });
    if (!access.success) return { success: false, error: access.error, friends: [] };
    return { success: true, friends: await getFriends() };
  } catch { return { success: false, error: '친구 목록을 불러오지 못했습니다.', friends: [] }; }
}

export async function getFriendsForUserAction(requestingUserId?: string) {
  try {
    const access = await ensureUserPermission(requestingUserId);
    if (!access.success || !access.user) return { success: false, error: access.error, friends: [] };
    const friends = access.user.role === 'admin' ? await getFriends() : await dbGetFriendsByUserFriendGroupIds(await accessibleGroupIds(access.user));
    return { success: true, friends };
  } catch { return { success: false, error: '친구 목록을 불러오지 못했습니다.', friends: [] }; }
}

export async function updateFriendAction(id: string, updates: Partial<Omit<Friend, 'id' | 'createdAt'>>) {
  try {
    const friend = await dbGetFriendById(id);
    if (!friend) return { success: false, error: '친구를 찾을 수 없습니다.' };
    const access = await ensureGroupAccess(friend.groupId, undefined, true);
    if (!access.success) return access;
    if (!updates.name?.trim() || updates.name.length > 100) return { success: false, error: '친구 이름을 확인해주세요.' };
    const updated = await updateFriend(id, { name: updates.name.trim(), description: updates.description?.slice(0, 500) || '' });
    if (!updated) return { success: false, error: '친구를 찾을 수 없습니다.' };
    revalidatePath('/friends');
    return { success: true, friend: updated };
  } catch { return { success: false, error: '친구 정보 수정에 실패했습니다.' }; }
}

export async function deleteFriendAction(payload: { friendId: string; groupId: string; currentUserId: string }) {
  try {
    const access = await ensureGroupAccess(payload.groupId, payload.currentUserId, true);
    if (!access.success) return access;
    const friend = await dbGetFriendById(payload.friendId);
    if (!friend || friend.groupId !== payload.groupId) return { success: false, error: '그룹의 친구를 찾을 수 없습니다.' };
    await deleteFriend(payload.friendId);
    revalidatePath('/friends');
    return { success: true };
  } catch { return { success: false, error: '친구 삭제에 실패했습니다.' }; }
}

export async function getFriendsByGroupAction(groupId: string) {
  try {
    const access = await ensureGroupAccess(groupId);
    if (!access.success) return { success: false, error: access.error, friends: [] };
    return { success: true, friends: await getFriendsByGroup(groupId) };
  } catch { return { success: false, error: '그룹 친구 목록을 불러오지 못했습니다.', friends: [] }; }
}
