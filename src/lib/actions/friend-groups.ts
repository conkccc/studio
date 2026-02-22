'use server';

import { revalidatePath } from 'next/cache';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import {
  addFriendGroup as dbAddFriendGroup,
  updateFriendGroup as dbUpdateFriendGroup,
  deleteFriendGroup as dbDeleteFriendGroup,
  getFriendGroupsByUser as dbGetFriendGroupsByUser,
  dbGetAllFriendGroups,
  getUserById as dbGetUserById,
} from '../data-store';
import type { FriendGroup } from '../types';
import { ensureUserPermission } from './permissions';

// 모든 친구 그룹 목록 가져오기
export async function getAllFriendGroupsAction() {
  try {
    const groups = await dbGetAllFriendGroups();
    return { success: true, groups };
  } catch (error) {
    console.error('getAllFriendGroupsAction Error:', error);
    const errorMessage = error instanceof Error ? error.message : '모든 친구 그룹 목록을 가져오는데 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

// 친구 그룹 관련 액션
export async function createFriendGroupAction(
  name: string,
  currentUserId: string,
  memberIds: string[] = []
) {
  const permissionCheck = await ensureUserPermission(currentUserId, {
    requiredRole: ['user', 'admin'],
    entityName: '친구 그룹 생성'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }

  try {
    const newGroup = await dbAddFriendGroup({ name, ownerUserId: currentUserId, memberIds });
    revalidatePath('/friends');
    revalidatePath('/meetings/new');
    revalidatePath('/groups');
    return { success: true, group: newGroup };
  } catch (error) {
    console.error('createFriendGroupAction Error:', error);
    const errorMessage = error instanceof Error ? error.message : '친구 그룹 생성 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function updateFriendGroupAction(
  id: string,
  updates: Partial<Omit<FriendGroup, 'id' | 'createdAt'>>,
  currentUserId: string
) {
  const permissionCheck = await ensureUserPermission(currentUserId, { entityName: '친구 그룹 수정' });
  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const currentUser = permissionCheck.user!;

  try {
    const groupDocRef = doc(db, 'friendGroups', id);
    const groupSnap = await getDoc(groupDocRef);

    if (!groupSnap.exists()) {
      return { success: false, error: "수정할 친구 그룹을 찾을 수 없습니다." };
    }
    const groupData = groupSnap.data() as FriendGroup;

    if (currentUser.role !== 'admin' && groupData.ownerUserId !== currentUserId) {
      return { success: false, error: "친구 그룹을 수정할 권한이 없습니다." };
    }

    const updatedGroup = await dbUpdateFriendGroup(id, updates);
    if (!updatedGroup) {
        return { success: false, error: "친구 그룹 업데이트에 실패했습니다."};
    }
    revalidatePath('/friends');
    revalidatePath('/groups');
    revalidatePath(`/friends/${id}`);
    return { success: true, group: updatedGroup };
  } catch (error) {
    console.error('updateFriendGroupAction Error:', error);
    const errorMessage = error instanceof Error ? error.message : '친구 그룹 수정 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function deleteFriendGroupAction(id: string, currentUserId: string) {
  const permissionCheck = await ensureUserPermission(currentUserId, { entityName: '친구 그룹 삭제' });
  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const currentUser = permissionCheck.user!;

  try {
    const groupDocRef = doc(db, 'friendGroups', id);
    const groupSnap = await getDoc(groupDocRef);

    if (!groupSnap.exists()) {
      return { success: false, error: "삭제할 친구 그룹을 찾을 수 없습니다." };
    }
    const groupData = groupSnap.data() as FriendGroup;

    if (currentUser.role !== 'admin' && groupData.ownerUserId !== currentUserId) {
      return { success: false, error: "친구 그룹을 삭제할 권한이 없습니다." };
    }

    await dbDeleteFriendGroup(id);
    revalidatePath('/friends');
    revalidatePath('/groups');
    return { success: true };
  } catch (error) {
    console.error('deleteFriendGroupAction Error:', error);
    const errorMessage = error instanceof Error ? error.message : '친구 그룹 삭제 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function getFriendGroupsForUserAction(currentUserId: string) {
  try {
    if (!currentUserId) {
      return { success: false, error: "인증되지 않은 사용자입니다. 로그인이 필요합니다." };
    }
    const currentUser = await dbGetUserById(currentUserId);
    if (!currentUser) {
      return { success: false, error: "사용자 정보를 찾을 수 없습니다." };
    }

    let rawGroups: FriendGroup[] = [];
    if (currentUser.role === 'admin') {
      rawGroups = await dbGetAllFriendGroups();
    } else {
      rawGroups = await dbGetFriendGroupsByUser(currentUserId);
      if (currentUser.role === 'viewer') {
        const referencedIds = currentUser.friendGroupIds || [];
        rawGroups = rawGroups.filter(group => referencedIds.includes(group.id));
      }
    }

    const processedGroups = rawGroups.map(group => ({
      ...group,
      isOwned: group.ownerUserId === currentUserId,
      isReferenced: currentUser.friendGroupIds?.includes(group.id) || false,
    }));

    const sortedGroups = processedGroups.sort((a, b) => {
      const dateA = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const dateB = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return dateB - dateA;
    });

    return { success: true, groups: sortedGroups };

  } catch (error) {
    console.error('getFriendGroupsForUserAction Error:', error);
    const errorMessage = error instanceof Error ? error.message : '친구 그룹 목록 조회 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage, groups: [] };
  }
}
