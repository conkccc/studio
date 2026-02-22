'use server';

import { revalidatePath } from 'next/cache';
import { doc, getDoc, updateDoc, arrayRemove as firestoreArrayRemove, arrayUnion as firestoreArrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import {
  addFriend as dbAddFriend,
  updateFriend as dbUpdateFriend,
  deleteFriend as dbDeleteFriend,
  getFriends as dbGetFriends,
  getFriendsByGroup as dbGetFriendsByGroup,
  dbGetFriendsByUserFriendGroupIds,
  getUserById as dbGetUserById,
} from '../data-store';
import type { Friend, FriendGroup } from '../types';
import { ensureUserPermission } from './permissions';

// 친구 관련 액션
export async function createFriendAction(payload: { name: string; description?: string; groupId: string; currentUserId: string }) {
  const { name, description, groupId, currentUserId } = payload;

  if (!name || name.trim() === '') {
    return { success: false, error: "친구 이름은 필수입니다." };
  }
  if (!groupId || groupId.trim() === '') {
    return { success: false, error: "그룹 ID가 지정되지 않았습니다." };
  }

  const permissionCheck = await ensureUserPermission(currentUserId, {
    requiredRole: ['user', 'admin'],
    entityName: '친구 추가'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const callingUser = permissionCheck.user!;

  try {
    const groupDocRef = doc(db, 'friendGroups', groupId);
    const groupSnap = await getDoc(groupDocRef);

    if (!groupSnap.exists()) {
      return { success: false, error: "친구를 추가할 그룹을 찾을 수 없습니다." };
    }
    const groupData = groupSnap.data() as FriendGroup;

    if (groupData.ownerUserId !== currentUserId && callingUser.role !== 'admin') {
      return { success: false, error: "이 그룹에 친구를 추가할 권한이 없습니다." };
    }

    const newFriend = await dbAddFriend({ name, description, groupId });

    await updateDoc(groupDocRef, {
      memberIds: firestoreArrayUnion(newFriend.id)
    });

    revalidatePath('/friends');
    return { success: true, friend: newFriend };
  } catch (error) {
    console.error("createFriendAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '친구 추가 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}

// 모든 친구 목록 가져오기
export async function getAllFriendsAction() {
  try {
    const friends = await dbGetFriends();
    return { success: true, friends };
  } catch (error) {
    console.error('getAllFriendsAction Error:', error);
    const errorMessage = error instanceof Error ? error.message : '모든 친구 목록을 가져오는데 실패했습니다.';
    return { success: false, error: errorMessage, friends: [] };
  }
}

// 사용자 접근 범위 기준 친구 목록 가져오기
export async function getFriendsForUserAction(requestingUserId: string) {
  if (!requestingUserId) {
    return { success: false, error: "User ID is required.", friends: [] };
  }

  const user = await dbGetUserById(requestingUserId);
  if (!user) {
    return { success: false, error: "User not found.", friends: [] };
  }

  try {
    if (user.role === 'admin') {
      const friends = await dbGetFriends();
      return { success: true, friends };
    }
    const friendGroupIds = user.friendGroupIds || [];
    const friends = await dbGetFriendsByUserFriendGroupIds(friendGroupIds);
    return { success: true, friends };
  } catch (error) {
    console.error('getFriendsForUserAction Error:', error);
    const errorMessage = error instanceof Error ? error.message : '친구 목록을 가져오는데 실패했습니다.';
    return { success: false, error: errorMessage, friends: [] };
  }
}

export async function updateFriendAction(id: string, updates: Partial<Omit<Friend, 'id' | 'createdAt'>>) {
  try {
    const updatedFriend = await dbUpdateFriend(id, updates);
    if (!updatedFriend) throw new Error('친구를 찾을 수 없습니다.');
    revalidatePath('/friends');
    revalidatePath(`/meetings`);
    return { success: true, friend: updatedFriend };
  } catch (error) {
    console.error("updateFriendAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '친구 정보 수정에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function deleteFriendAction(payload: { friendId: string; groupId: string; currentUserId: string }) {
  const { friendId, groupId, currentUserId } = payload;

  if (!friendId) {
    return { success: false, error: "삭제할 친구 ID가 필요합니다." };
  }
  if (!groupId) {
    return { success: false, error: "친구가 속한 그룹 ID가 필요합니다." };
  }

  const permissionCheck = await ensureUserPermission(currentUserId, {
    requiredRole: ['user', 'admin'],
    entityName: '친구 삭제'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const callingUser = permissionCheck.user!;

  try {
    const groupDocRef = doc(db, 'friendGroups', groupId);
    const groupSnap = await getDoc(groupDocRef);

    if (!groupSnap.exists()) {
      return { success: false, error: "친구 그룹을 찾을 수 없습니다." };
    }
    const group = groupSnap.data() as FriendGroup;

    if (group.ownerUserId !== currentUserId && callingUser.role !== 'admin') {
      return { success: false, error: "친구를 삭제할 권한이 없습니다. 그룹 소유자 또는 관리자만 가능합니다." };
    }

    await dbDeleteFriend(friendId);

    await updateDoc(groupDocRef, {
      memberIds: firestoreArrayRemove(friendId)
    });

    revalidatePath('/friends');
    return { success: true };

  } catch (error) {
    console.error("deleteFriendAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '친구 삭제 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}

// 그룹별 친구 목록 조회
export async function getFriendsByGroupAction(groupId: string) {
  try {
    const friends = await dbGetFriendsByGroup(groupId);
    return { success: true, friends: friends ?? [] };
  } catch (error) {
    console.error(`getFriendsByGroupAction Error for groupId ${groupId}:`, error);
    const errorMessage = error instanceof Error ? error.message : '그룹별 친구 목록 조회 중 알 수 없는 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}
