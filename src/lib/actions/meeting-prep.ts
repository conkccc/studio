'use server';

import { revalidatePath } from 'next/cache';
import { nanoid } from 'nanoid';
import { addDays } from 'date-fns';
import {
  dbAddMeetingPrep,
  dbGetMeetingPrepById,
  dbGetMeetingPrepsByUser,
  dbGetAllMeetingPreps,
  dbUpdateMeetingPrep,
  dbDeleteMeetingPrep,
  dbGetFriendsByUserFriendGroupIds,
} from '../data-store';
import type { MeetingPrep, Friend } from '../types';
import { ensureUserPermission } from './permissions';
import { getFriendsByGroupAction } from './friends';

// 모임 준비 관련 액션
export async function createMeetingPrepAction(
  payload: Omit<MeetingPrep, 'id' | 'createdAt' | 'isDeleted' | 'shareToken' | 'shareExpiryDate' | 'creatorId'> & { shareExpiryDays?: number },
  currentUserId?: string | null
) {
  const { shareExpiryDays, friendGroupId, ...restPayload } = payload;
  const permissionCheck = await ensureUserPermission(currentUserId, {
    requiredRole: ['user', 'admin'],
    entityName: '모임 준비 생성'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const creator = permissionCheck.user!;

  try {
    const shareToken = nanoid(16);
    const shareExpiryDate = addDays(new Date(), shareExpiryDays !== undefined ? shareExpiryDays : 7);

    const newMeetingPrep = await dbAddMeetingPrep({
      ...restPayload,
      friendGroupId,
      creatorId: creator.id,
      shareToken,
      shareExpiryDate,
    });
    revalidatePath('/meeting-prep');
    return { success: true, meetingPrep: newMeetingPrep };
  } catch (error) {
    console.error("createMeetingPrepAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '모임 준비 생성에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function getMeetingPrepsAction(currentUserId: string | null) {
  const permissionCheck = await ensureUserPermission(currentUserId, {
    requiredRole: ['user', 'admin'],
    entityName: '모임 준비 목록 조회'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error, meetingPreps: [] };
  }
  const user = permissionCheck.user!;

  try {
    let meetingPreps: MeetingPrep[] = [];
    if (user.role === 'admin') {
      meetingPreps = await dbGetAllMeetingPreps();
    } else {
      meetingPreps = await dbGetMeetingPrepsByUser(user.id, user.friendGroupIds || []);
    }

    const meetingPrepsWithFriends = await Promise.all(meetingPreps.map(async (prep) => {
      if (prep.friendGroupId && prep.participantFriendIds && prep.participantFriendIds.length > 0) {
        const friendsInGroupResult = await getFriendsByGroupAction(prep.friendGroupId);
        if (friendsInGroupResult.success && friendsInGroupResult.friends) {
          const participantFriends = friendsInGroupResult.friends.filter(friend => 
            prep.participantFriendIds.includes(friend.id)
          );
          return { ...prep, participantFriends };
        }
      }
      return { ...prep, participantFriends: [] };
    }));

    return { success: true, meetingPreps: meetingPrepsWithFriends };
  } catch (error) {
    console.error("getMeetingPrepsAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '모임 준비 목록 조회에 실패했습니다.';
    return { success: false, error: errorMessage, meetingPreps: [] };
  }
}

export async function getMeetingPrepByIdAction(meetingPrepId: string, currentUserId?: string | null) {
  try {
    const meetingPrep = await dbGetMeetingPrepById(meetingPrepId);
    if (!meetingPrep) {
      return { success: false, error: '모임 준비를 찾을 수 없습니다.', meetingPrep: null };
    }

    if (currentUserId) {
      const permissionCheck = await ensureUserPermission(currentUserId, {
        entityName: '모임 준비 상세 조회'
      });

      if (!permissionCheck.success) {
        return { success: false, error: permissionCheck.error, meetingPrep: null };
      }
      const user = permissionCheck.user!;

      const isCreator = meetingPrep.creatorId === user.id;
      const isAdmin = user.role === 'admin';
      const userFriends = await dbGetFriendsByUserFriendGroupIds(user.friendGroupIds || []);
      const isParticipant = userFriends.some((userFriend: Friend) => meetingPrep.participantFriendIds?.includes(userFriend.id));

      if (!isCreator && !isAdmin && !isParticipant) {
        return { success: false, error: "이 모임 준비를 조회할 권한이 없습니다.", meetingPrep: null };
      }
    }

    let participantFriends: Friend[] = [];
    if (meetingPrep.friendGroupId && meetingPrep.participantFriendIds && meetingPrep.participantFriendIds.length > 0) {
      const friendsInGroupResult = await getFriendsByGroupAction(meetingPrep.friendGroupId);
      if (friendsInGroupResult.success && friendsInGroupResult.friends) {
        participantFriends = friendsInGroupResult.friends.filter(friend => 
          meetingPrep.participantFriendIds.includes(friend.id)
        );
      }
    }

    return { success: true, meetingPrep: { ...meetingPrep, participantFriends } };
  } catch (error) {
    console.error(`getMeetingPrepByIdAction Error for meetingPrepId ${meetingPrepId}:`, error);
    const errorMessage = error instanceof Error ? error.message : '모임 준비 정보를 가져오는 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage, meetingPrep: null };
  }
}

export async function updateMeetingPrepAction(
  id: string,
  payload: Partial<Omit<MeetingPrep, 'id' | 'createdAt' | 'shareToken' | 'shareExpiryDate' | 'isDeleted' | 'creatorId'>> & { shareExpiryDays?: number },
  currentUserId?: string | null
) {
  const { shareExpiryDays, ...restPayload } = payload;
  const meetingPrepToUpdate = await dbGetMeetingPrepById(id);
  if (!meetingPrepToUpdate) {
    return { success: false, error: "수정할 모임 준비를 찾을 수 없습니다." };
  }

  const permissionCheck = await ensureUserPermission(currentUserId, {
    ownerId: meetingPrepToUpdate.creatorId,
    adminCanOverride: true,
    entityName: '모임 준비 수정'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }

  try {
    const updateData: Partial<Omit<MeetingPrep, 'id' | 'createdAt'>> = {
      ...restPayload,
    };

    if (shareExpiryDays !== undefined) {
      updateData.shareExpiryDate = addDays(new Date(), shareExpiryDays);
    }

    const updatedMeetingPrep = await dbUpdateMeetingPrep(id, updateData);
    if (!updatedMeetingPrep) throw new Error('모임 준비 업데이트에 실패했습니다.');

    revalidatePath('/meeting-prep');
    revalidatePath(`/meeting-prep/${id}`);
    return { success: true, meetingPrep: updatedMeetingPrep };
  } catch (error) {
    console.error("updateMeetingPrepAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '모임 준비 수정에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function deleteMeetingPrepAction(id: string, currentUserId?: string | null) {
  const meetingPrepToDelete = await dbGetMeetingPrepById(id);
  if (!meetingPrepToDelete) {
    return { success: false, error: "삭제할 모임을 찾을 수 없습니다." };
  }

  const permissionCheck = await ensureUserPermission(currentUserId, {
    ownerId: meetingPrepToDelete.creatorId,
    adminCanOverride: true,
    entityName: '모임 준비 삭제'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }

  try {
    await dbDeleteMeetingPrep(id);
    revalidatePath('/meeting-prep');
    return { success: true };
  } catch (error) {
    console.error("deleteMeetingPrepAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '모임 준비 삭제에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}
