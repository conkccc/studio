'use server';

import { revalidatePath } from 'next/cache';
import {
  addMeeting as dbAddMeeting,
  updateMeeting as dbUpdateMeeting,
  deleteMeeting as dbDeleteMeeting,
  getMeetingById as dbGetMeetingById,
  dbRevertMeetingDeduction,
  getMeetings as dbGetMeetings,
  getUserById as dbGetUserById,
} from '../data-store';
import type { Meeting } from '../types';
import { ensureUserPermission } from './permissions';

// ID로 특정 모임 정보 가져오기
export async function getMeetingByIdAction(meetingId: string) {
  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) {
      return { success: false, error: '모임을 찾을 수 없습니다.', meeting: null };
    }
    return { success: true, meeting };
  } catch (error) {
    console.error(`getMeetingByIdAction Error for meetingId ${meetingId}:`, error);
    const errorMessage = error instanceof Error ? error.message : '모임 정보를 가져오는 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage, meeting: null };
  }
}

// 모임 관련 액션
export async function createMeetingAction(
  payload: Omit<Meeting, 'id' | 'createdAt' | 'isSettled' | 'isShareEnabled' | 'shareToken' | 'shareExpiryDate'>,
  currentUserId?: string | null
) {
  const permissionCheck = await ensureUserPermission(currentUserId, {
    requiredRole: ['user', 'admin'],
    entityName: '모임 생성'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const creator = permissionCheck.user!;

  try {
    const {
      locationCoordinates,
      locationName,
      participantIds,
      nonReserveFundParticipants,
      temporaryParticipants,
      partialReserveFundAmount,
      memo,
      totalFee,
      feePerPerson,
      endTime,
      name,
      dateTime,
      groupId,
      isTemporary,
      useReserveFund,
    } = payload;

    if (!isTemporary && (!groupId || !groupId.trim())) {
      return { success: false, error: "일반 모임은 친구 그룹을 선택해야 합니다." };
    }

    const meetingDataToSaveBase = {
      name,
      dateTime,
      creatorId: creator.id,
      groupId: groupId || '',
      locationName: locationName || '',
      isTemporary: isTemporary || false,
      participantIds: participantIds || [],
      useReserveFund: useReserveFund || false,
      nonReserveFundParticipants: nonReserveFundParticipants || [],
      ...(endTime !== undefined && { endTime }),
      ...(locationCoordinates !== undefined && { locationCoordinates }),
      ...(memo !== undefined && { memo }),
      ...(partialReserveFundAmount !== undefined && { partialReserveFundAmount }),
      ...(temporaryParticipants !== undefined && { temporaryParticipants }),
    };

    type AddMeetingPayload = Parameters<typeof dbAddMeeting>[0];

    const meetingDataToSave: AddMeetingPayload = {
      ...meetingDataToSaveBase,
    };

    if (meetingDataToSave.isTemporary) {
      delete meetingDataToSave.participantIds;
      delete meetingDataToSave.useReserveFund;
      delete meetingDataToSave.partialReserveFundAmount;
      delete meetingDataToSave.nonReserveFundParticipants;

      meetingDataToSave.temporaryParticipants = temporaryParticipants || [];
      if (totalFee !== undefined) meetingDataToSave.totalFee = totalFee;
      if (feePerPerson !== undefined) meetingDataToSave.feePerPerson = feePerPerson;
    } else {
      if (meetingDataToSave.useReserveFund) {
        meetingDataToSave.partialReserveFundAmount = (typeof partialReserveFundAmount === 'number' && !isNaN(partialReserveFundAmount))
          ? partialReserveFundAmount
          : 0;
      } else {
         delete (meetingDataToSave as Partial<AddMeetingPayload>).partialReserveFundAmount;
      }
      delete (meetingDataToSave as Partial<AddMeetingPayload>).temporaryParticipants;
      delete (meetingDataToSave as Partial<AddMeetingPayload>).totalFee;
      delete (meetingDataToSave as Partial<AddMeetingPayload>).feePerPerson;
    }

    const newMeeting = await dbAddMeeting(meetingDataToSave);
    revalidatePath('/meetings');
    revalidatePath('/');
    revalidatePath(`/meetings/${newMeeting.id}`);
    return { success: true, meeting: newMeeting };
  } catch (error) {
    console.error("createMeetingAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '모임 생성에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function updateMeetingAction(
  id: string,
  payload: Partial<Omit<Meeting, 'id' | 'createdAt'>>,
  currentUserId?: string | null
) {
  const meetingToUpdate = await dbGetMeetingById(id);
  if (!meetingToUpdate) {
    return { success: false, error: "수정할 모임을 찾을 수 없습니다." };
  }

  const permissionCheck = await ensureUserPermission(currentUserId, {
    ownerId: meetingToUpdate.creatorId,
    adminCanOverride: true,
    entityName: '모임 수정'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }

  try {
    const {
      name, dateTime, groupId, locationName, locationCoordinates,
      participantIds, useReserveFund, nonReserveFundParticipants,
      partialReserveFundAmount, memo, endTime,
      totalFee, feePerPerson, temporaryParticipants,
      isShareEnabled, shareToken, shareExpiryDate, isSettled
    } = payload;

    if (!meetingToUpdate.isTemporary && Object.prototype.hasOwnProperty.call(payload, 'groupId') && (!groupId || !groupId.trim())) {
      return { success: false, error: "일반 모임은 친구 그룹을 선택해야 합니다." };
    }

    const meetingDataToUpdate: Partial<Omit<Meeting, 'id' | 'createdAt'>> = {};

    const reserveFundSettingsChanged = payload.useReserveFund !== undefined ||
                                     payload.partialReserveFundAmount !== undefined ||
                                     payload.nonReserveFundParticipants !== undefined;

    if (meetingToUpdate.isSettled && reserveFundSettingsChanged) {
      await dbRevertMeetingDeduction(id);
      meetingDataToUpdate.isSettled = false;
      revalidatePath('/reserve-fund');
    } else if (Object.prototype.hasOwnProperty.call(payload, 'isSettled')) {
      meetingDataToUpdate.isSettled = isSettled;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'name')) meetingDataToUpdate.name = name;
    if (Object.prototype.hasOwnProperty.call(payload, 'dateTime')) meetingDataToUpdate.dateTime = dateTime;
    if (Object.prototype.hasOwnProperty.call(payload, 'groupId')) meetingDataToUpdate.groupId = groupId;
    if (Object.prototype.hasOwnProperty.call(payload, 'locationName')) meetingDataToUpdate.locationName = locationName;
    if (Object.prototype.hasOwnProperty.call(payload, 'locationCoordinates')) meetingDataToUpdate.locationCoordinates = locationCoordinates;
    if (Object.prototype.hasOwnProperty.call(payload, 'participantIds')) meetingDataToUpdate.participantIds = participantIds;
    if (Object.prototype.hasOwnProperty.call(payload, 'useReserveFund')) meetingDataToUpdate.useReserveFund = useReserveFund;
    if (Object.prototype.hasOwnProperty.call(payload, 'nonReserveFundParticipants')) meetingDataToUpdate.nonReserveFundParticipants = nonReserveFundParticipants;
    if (Object.prototype.hasOwnProperty.call(payload, 'partialReserveFundAmount')) meetingDataToUpdate.partialReserveFundAmount = partialReserveFundAmount;
    if (Object.prototype.hasOwnProperty.call(payload, 'memo')) meetingDataToUpdate.memo = memo;
    if (Object.prototype.hasOwnProperty.call(payload, 'endTime')) meetingDataToUpdate.endTime = endTime;
    if (Object.prototype.hasOwnProperty.call(payload, 'totalFee')) meetingDataToUpdate.totalFee = totalFee;
    if (Object.prototype.hasOwnProperty.call(payload, 'feePerPerson')) meetingDataToUpdate.feePerPerson = feePerPerson;
    if (Object.prototype.hasOwnProperty.call(payload, 'temporaryParticipants')) meetingDataToUpdate.temporaryParticipants = temporaryParticipants;

    if (Object.prototype.hasOwnProperty.call(payload, 'isShareEnabled')) {
      meetingDataToUpdate.isShareEnabled = isShareEnabled;
      if (meetingDataToUpdate.isShareEnabled === false) {
        meetingDataToUpdate.shareToken = null;
        meetingDataToUpdate.shareExpiryDate = null;
      } else if (meetingDataToUpdate.isShareEnabled === true) {
        meetingDataToUpdate.shareToken = Object.prototype.hasOwnProperty.call(payload, 'shareToken') ? shareToken : meetingToUpdate.shareToken;
        meetingDataToUpdate.shareExpiryDate = Object.prototype.hasOwnProperty.call(payload, 'shareExpiryDate') ? shareExpiryDate : meetingToUpdate.shareExpiryDate;
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'locationName')) {
      meetingDataToUpdate.locationName = locationName || '';
      if (!Object.prototype.hasOwnProperty.call(payload, 'locationCoordinates') && !meetingDataToUpdate.locationName) {
        delete meetingDataToUpdate.locationCoordinates;
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'locationCoordinates')) {
      if (locationCoordinates)
        meetingDataToUpdate.locationCoordinates = locationCoordinates;
      else
        delete meetingDataToUpdate.locationCoordinates;
    }

    if (meetingToUpdate.isTemporary) {
      delete meetingDataToUpdate.participantIds;
      delete meetingDataToUpdate.useReserveFund;
      delete meetingDataToUpdate.partialReserveFundAmount;
      delete meetingDataToUpdate.nonReserveFundParticipants;

      if (Object.prototype.hasOwnProperty.call(payload, 'totalFee') && meetingDataToUpdate.totalFee !== undefined) {
        meetingDataToUpdate.feePerPerson = undefined;
      } else if (Object.prototype.hasOwnProperty.call(payload, 'feePerPerson') && meetingDataToUpdate.feePerPerson !== undefined) {
        meetingDataToUpdate.totalFee = undefined;
      }
    } else {
      delete meetingDataToUpdate.temporaryParticipants;
      if (Object.prototype.hasOwnProperty.call(payload, 'totalFee')) meetingDataToUpdate.totalFee = undefined;
      if (Object.prototype.hasOwnProperty.call(payload, 'feePerPerson')) meetingDataToUpdate.feePerPerson = undefined;

      const willUseReserveFundCurrent = meetingDataToUpdate.useReserveFund !== undefined ? meetingDataToUpdate.useReserveFund : meetingToUpdate.useReserveFund;

      if (willUseReserveFundCurrent) {
        if (meetingDataToUpdate.partialReserveFundAmount === undefined && !Object.prototype.hasOwnProperty.call(payload, 'partialReserveFundAmount')) {
           meetingDataToUpdate.partialReserveFundAmount = meetingToUpdate.partialReserveFundAmount !== undefined ? meetingToUpdate.partialReserveFundAmount : 0;
        } else if (meetingDataToUpdate.partialReserveFundAmount === undefined && Object.prototype.hasOwnProperty.call(payload, 'partialReserveFundAmount') && typeof payload.partialReserveFundAmount !== 'number' ){
            meetingDataToUpdate.partialReserveFundAmount = 0;
        }
      } else {
        meetingDataToUpdate.partialReserveFundAmount = undefined;
        meetingDataToUpdate.nonReserveFundParticipants = [];
      }

      if (meetingDataToUpdate.useReserveFund === false) {
        meetingDataToUpdate.nonReserveFundParticipants = [];
      }
    }

    const updatedMeeting = await dbUpdateMeeting(id, meetingDataToUpdate);
    if (!updatedMeeting) throw new Error('모임 업데이트에 실패했습니다.');

    revalidatePath('/meetings');
    revalidatePath(`/meetings/${id}`);
    revalidatePath('/');
    if ( (meetingToUpdate.isSettled && reserveFundSettingsChanged) || (payload.isSettled === false && meetingDataToUpdate.isSettled === false) ) {
      revalidatePath('/reserve-fund');
    }
    return { success: true, meeting: updatedMeeting };
  } catch (error) {
    console.error("updateMeetingAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '모임 수정에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function deleteMeetingAction(id: string, currentUserId?: string | null) {
  const meetingToDelete = await dbGetMeetingById(id);
  if (!meetingToDelete) {
    return { success: false, error: "삭제할 모임을 찾을 수 없습니다." };
  }

  const permissionCheck = await ensureUserPermission(currentUserId, {
    ownerId: meetingToDelete.creatorId,
    adminCanOverride: true,
    entityName: '모임 삭제'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }

  try {
    await dbDeleteMeeting(id);
    revalidatePath('/meetings');
    revalidatePath('/');
    revalidatePath('/reserve-fund');
    return { success: true };
  } catch (error) {
    console.error("deleteMeetingAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '모임 삭제에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function getMeetingsForUserAction(params: {
  year?: number;
  page?: number;
  limitParam?: number;
  requestingUserId: string;
}) {
  const { year, page, limitParam, requestingUserId } = params;

  if (!requestingUserId) {
    return { success: false, error: "User ID is required.", meetings: [], totalCount: 0, availableYears: [] };
  }

  const user = await dbGetUserById(requestingUserId);

  if (!user) {
    return { success: false, error: "User not found.", meetings: [], totalCount: 0, availableYears: [] };
  }

  let actualUserIdForFilter: string | undefined = undefined;
  let actualUserFriendGroupIdsForFilter: string[] | undefined = undefined;

  if (user.role !== 'admin') {
    actualUserIdForFilter = user.id;
    actualUserFriendGroupIdsForFilter = user.friendGroupIds && user.friendGroupIds.length > 0 ? user.friendGroupIds : undefined;
  }

  try {
    const result = await dbGetMeetings({
      year,
      page,
      limitParam,
      userId: actualUserIdForFilter,
      userFriendGroupIds: actualUserFriendGroupIdsForFilter,
    });
    return { success: true, ...result };
  } catch (error) {
    console.error("getMeetingsForUserAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch meetings.';
    return { success: false, error: errorMessage, meetings: [], totalCount: 0, availableYears: [] };
  }
}
