'use server';

import { revalidatePath } from 'next/cache';
import {
  getUserById as dbGetUserById,
  addFriend as dbAddFriend,
  updateFriend as dbUpdateFriend,
  deleteFriend as dbDeleteFriend,
  addMeeting as dbAddMeeting,
  updateMeeting as dbUpdateMeeting,
  deleteMeeting as dbDeleteMeeting,
  addExpense as dbAddExpense,
  updateExpense as dbUpdateExpense,
  deleteExpense as dbDeleteExpense,
  getMeetingById as dbGetMeetingById,
  getExpensesByMeetingId as dbGetExpensesByMeetingId,
  getReserveFundBalance,
  dbSetReserveFundBalance,
  dbRecordMeetingDeduction,
  dbRevertMeetingDeduction,
  getExpenseById as dbGetExpenseById,
  updateUser as dbUpdateUser,
  addFriendGroup as dbAddFriendGroup,
  updateFriendGroup as dbUpdateFriendGroup,
  deleteFriendGroup as dbDeleteFriendGroup,
  getFriendGroupsByUser as dbGetFriendGroupsByUser,
  dbGetAllFriendGroups,
  getMeetings as dbGetMeetings, // 새로운 모임 액션을 위한 import
  getUsers as dbGetUsers, // getAllUsersAction을 위한 getUsers import
  getFriendsByGroup as dbGetFriendsByGroup, // 그룹별 친구 목록 조회를 위한 import
  getFriends as dbGetFriends, // getAllFriendsAction을 위한 import
} from './data-store';
import type { Friend, Meeting, Expense, ReserveFundTransaction, User, FriendGroup } from './types';
import { Timestamp, arrayRemove as firestoreArrayRemove, arrayUnion as firestoreArrayUnion, deleteField } from 'firebase/firestore';
import { nanoid } from 'nanoid';
import { addDays } from 'date-fns';
import { db } from './firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

// 사용자 역할 타입 정의 (실제 프로젝트 환경에 맞게 조정될 수 있음)
type UserRole = 'admin' | 'user' | 'viewer' | 'none';

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

async function _ensureUserPermission(
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


// 친구 관련 액션
export async function createFriendAction(payload: { name: string; description?: string; groupId: string; currentUserId: string }) {
  const { name, description, groupId, currentUserId } = payload;

  if (!name || name.trim() === '') {
    return { success: false, error: "친구 이름은 필수입니다." };
  }
  if (!groupId || groupId.trim() === '') {
    return { success: false, error: "그룹 ID가 지정되지 않았습니다." };
  }

  const permissionCheck = await _ensureUserPermission(currentUserId, {
    requiredRole: ['user', 'admin'], // 친구 생성에 필요한 역할
    entityName: '친구 추가'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const callingUser = permissionCheck.user!; // 권한 검사 성공 시 user 객체가 존재함

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

    // 1. 'friends' 컬렉션에 친구 문서 추가
    const newFriend = await dbAddFriend({ name, description, groupId });

    // 2. 그룹의 memberIds 배열에 친구 ID 추가
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

export async function getExpensesByMeetingIdAction(meetingId: string) {
  try {
    const expenses = await dbGetExpensesByMeetingId(meetingId);
    return { success: true, expenses };
  } catch (error) {
    console.error(`getExpensesByMeetingIdAction Error for meetingId ${meetingId}:`, error);
    const errorMessage = error instanceof Error ? error.message : '모임의 지출 내역을 가져오는 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage, expenses: [] };
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

// Admin Action: Assign friend groups to a user
export async function assignFriendGroupsToUserAction(payload: {
  adminUserId?: string | null;
  targetUserId?: string | null;
  friendGroupIds?: string[] | null;
}) {
  const { targetUserId, friendGroupIds } = payload; // adminUserId는 permissionCheck에서 사용

  if (!targetUserId) {
    return { success: false, error: "대상 사용자 ID가 필요합니다." };
  }
  if (friendGroupIds === null || friendGroupIds === undefined) {
    return { success: false, error: "할당할 그룹 목록 정보가 필요합니다 (빈 배열일 수 있음)." };
  }

  const permissionCheck = await _ensureUserPermission(payload.adminUserId, {
    requiredRole: 'admin',
    entityName: '친구 그룹 할당'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  // const adminUser = permissionCheck.user!; // 필요시 사용

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

  const permissionCheck = await _ensureUserPermission(currentUserId, {
    requiredRole: ['user', 'admin'], // 친구 삭제에 필요한 역할
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

    // 1. 친구 문서 삭제 (이 함수는 연결된 모임에서도 친구 정보를 제거합니다)
    await dbDeleteFriend(friendId);

    // 2. 그룹의 memberIds 배열에서 친구 ID 제거
    await updateDoc(groupDocRef, {
      memberIds: firestoreArrayRemove(friendId)
    });

    revalidatePath('/friends'); // 친구 관련 페이지 재검증
    return { success: true };

  } catch (error) {
    console.error("deleteFriendAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '친구 삭제 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}

// 모임 관련 액션
export async function createMeetingAction(
  payload: Omit<Meeting, 'id' | 'createdAt' | 'isSettled' | 'isShareEnabled' | 'shareToken' | 'shareExpiryDate'>,
  currentUserId?: string | null
) {
  const permissionCheck = await _ensureUserPermission(currentUserId, {
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

    let meetingDataToSave: AddMeetingPayload = {
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

  const permissionCheck = await _ensureUserPermission(currentUserId, {
    ownerId: meetingToUpdate.creatorId,
    adminCanOverride: true,
    entityName: '모임 수정'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  // const callingUser = permissionCheck.user!; // 필요시 사용 가능

  try {
    // payload에서 업데이트할 필드들을 추출 (isTemporary는 업데이트하지 않는다고 가정)
    const {
      name, dateTime, groupId, locationName, locationCoordinates,
      participantIds, useReserveFund, nonReserveFundParticipants,
      partialReserveFundAmount, memo, endTime,
      totalFee, feePerPerson, temporaryParticipants,
      isShareEnabled, shareToken, shareExpiryDate, isSettled
    } = payload;

    // 업데이트할 데이터를 담을 객체
    const meetingDataToUpdate: Partial<Omit<Meeting, 'id' | 'createdAt'>> = {};

    // 정산(isSettled) 상태 변경 로직: 회비 설정이 변경되면 정산 상태를 해제해야 할 수 있음
    const reserveFundSettingsChanged = payload.useReserveFund !== undefined ||
                                     payload.partialReserveFundAmount !== undefined ||
                                     payload.nonReserveFundParticipants !== undefined;

    if (meetingToUpdate.isSettled && reserveFundSettingsChanged) {
      await dbRevertMeetingDeduction(id); // 기존 정산에 따른 회비 차감액이 있다면 되돌림
      meetingDataToUpdate.isSettled = false;
      revalidatePath('/reserve-fund');
    } else if (payload.hasOwnProperty('isSettled')) {
      meetingDataToUpdate.isSettled = isSettled;
    }

    // 전달된 payload 속성들만 업데이트 객체에 추가
    if (payload.hasOwnProperty('name')) meetingDataToUpdate.name = name;
    if (payload.hasOwnProperty('dateTime')) meetingDataToUpdate.dateTime = dateTime;
    if (payload.hasOwnProperty('groupId')) meetingDataToUpdate.groupId = groupId;
    if (payload.hasOwnProperty('locationName')) meetingDataToUpdate.locationName = locationName;
    if (payload.hasOwnProperty('locationCoordinates')) meetingDataToUpdate.locationCoordinates = locationCoordinates;
    if (payload.hasOwnProperty('participantIds')) meetingDataToUpdate.participantIds = participantIds;
    if (payload.hasOwnProperty('useReserveFund')) meetingDataToUpdate.useReserveFund = useReserveFund;
    if (payload.hasOwnProperty('nonReserveFundParticipants')) meetingDataToUpdate.nonReserveFundParticipants = nonReserveFundParticipants;
    if (payload.hasOwnProperty('partialReserveFundAmount')) meetingDataToUpdate.partialReserveFundAmount = partialReserveFundAmount;
    if (payload.hasOwnProperty('memo')) meetingDataToUpdate.memo = memo;
    if (payload.hasOwnProperty('endTime')) meetingDataToUpdate.endTime = endTime;
    if (payload.hasOwnProperty('totalFee')) meetingDataToUpdate.totalFee = totalFee;
    if (payload.hasOwnProperty('feePerPerson')) meetingDataToUpdate.feePerPerson = feePerPerson;
    if (payload.hasOwnProperty('temporaryParticipants')) meetingDataToUpdate.temporaryParticipants = temporaryParticipants;

    if (payload.hasOwnProperty('isShareEnabled')) {
      meetingDataToUpdate.isShareEnabled = isShareEnabled;
      if (meetingDataToUpdate.isShareEnabled === false) {
        meetingDataToUpdate.shareToken = null;
        meetingDataToUpdate.shareExpiryDate = null;
      } else if (meetingDataToUpdate.isShareEnabled === true) {
        meetingDataToUpdate.shareToken = payload.hasOwnProperty('shareToken') ? shareToken : meetingToUpdate.shareToken;
        meetingDataToUpdate.shareExpiryDate = payload.hasOwnProperty('shareExpiryDate') ? shareExpiryDate : meetingToUpdate.shareExpiryDate;
      }
    }

    if (payload.hasOwnProperty('locationName')) {
      meetingDataToUpdate.locationName = locationName || '';
      if (!payload.hasOwnProperty('locationCoordinates') && !meetingDataToUpdate.locationName) {
        delete meetingDataToUpdate.locationCoordinates;
        //meetingDataToUpdate.locationCoordinates = undefined;
      }
    }
    if (payload.hasOwnProperty('locationCoordinates')) {
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

      if (payload.hasOwnProperty('totalFee') && meetingDataToUpdate.totalFee !== undefined) {
        meetingDataToUpdate.feePerPerson = undefined;
      } else if (payload.hasOwnProperty('feePerPerson') && meetingDataToUpdate.feePerPerson !== undefined) {
        meetingDataToUpdate.totalFee = undefined;
      }
    } else {
      delete meetingDataToUpdate.temporaryParticipants;
      if (payload.hasOwnProperty('totalFee')) meetingDataToUpdate.totalFee = undefined;
      if (payload.hasOwnProperty('feePerPerson')) meetingDataToUpdate.feePerPerson = undefined;

      const willUseReserveFundCurrent = meetingDataToUpdate.useReserveFund !== undefined ? meetingDataToUpdate.useReserveFund : meetingToUpdate.useReserveFund;

      if (willUseReserveFundCurrent) {
        if (meetingDataToUpdate.partialReserveFundAmount === undefined && !payload.hasOwnProperty('partialReserveFundAmount')) {
           meetingDataToUpdate.partialReserveFundAmount = meetingToUpdate.partialReserveFundAmount !== undefined ? meetingToUpdate.partialReserveFundAmount : 0;
        } else if (meetingDataToUpdate.partialReserveFundAmount === undefined && payload.hasOwnProperty('partialReserveFundAmount') && typeof payload.partialReserveFundAmount !== 'number' ){
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
    // 정산 상태가 false로 변경되었거나, payload에서 isSettled가 명시적으로 false로 전달된 경우 회비 관련 경로 재검증
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

  const permissionCheck = await _ensureUserPermission(currentUserId, {
    ownerId: meetingToDelete.creatorId,
    adminCanOverride: true,
    entityName: '모임 삭제'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }

  try {
    await dbDeleteMeeting(id); // 이 함수는 회비 차감액 되돌리기를 포함
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

// 지출 관련 액션
export async function createExpenseAction(expenseData: Omit<Expense, 'id' | 'createdAt'>, currentUserId?: string | null) {
  const permissionCheck = await _ensureUserPermission(currentUserId);
  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const callingUser = permissionCheck.user!;

  try {
    const meeting = await dbGetMeetingById(expenseData.meetingId);
    if (!meeting) return { success: false, error: "모임을 찾을 수 없습니다." };

    const isAdminUser = callingUser.role === 'admin';
    const isCreator = meeting.creatorId === callingUser.id;

    if (!isAdminUser && !isCreator) {
        return { success: false, error: "지출 항목 추가 권한이 없습니다." };
    }

    const newExpense = await dbAddExpense(expenseData);
    
    if (meeting.isSettled) {
      await dbUpdateMeeting(meeting.id, { isSettled: false });
      if (!meeting.isTemporary && meeting.useReserveFund && meeting.partialReserveFundAmount && meeting.partialReserveFundAmount > 0) {
        await dbRevertMeetingDeduction(meeting.id);
        revalidatePath('/reserve-fund');
      }
    }
    revalidatePath(`/meetings/${expenseData.meetingId}`);
    return { success: true, expense: newExpense };
  } catch (error) {
    console.error("createExpenseAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '지출 항목 추가에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function updateExpenseAction(
  expenseId: string, // expenseId first for consistency
  meetingId: string,
  updates: Partial<Omit<Expense, 'id' | 'createdAt' | 'meetingId'>>,
  currentUserId?: string | null
) {
  if (!meetingId || !expenseId) {
    return { success: false, error: "잘못된 요청입니다. 모임 ID 또는 지출 ID가 없습니다."};
  }

  const permissionCheck = await _ensureUserPermission(currentUserId);
  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const callingUser = permissionCheck.user!;

  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) return { success: false, error: "모임을 찾을 수 없습니다." };

    const isAdminUser = callingUser.role === 'admin';
    const isCreator = meeting.creatorId === callingUser.id;

    if (!isAdminUser && !isCreator) {
        return { success: false, error: "지출 항목 수정 권한이 없습니다." };
    }

    const updatedExpense = await dbUpdateExpense(meetingId, expenseId, updates);
    if (!updatedExpense) throw new Error('지출 항목 업데이트에 실패했습니다.');
    
    if (meeting.isSettled) {
      await dbUpdateMeeting(meeting.id, { isSettled: false });
      if (!meeting.isTemporary && meeting.useReserveFund && meeting.partialReserveFundAmount && meeting.partialReserveFundAmount > 0) {
        await dbRevertMeetingDeduction(meeting.id);
        revalidatePath('/reserve-fund');
      }
    }
    revalidatePath(`/meetings/${meetingId}`);
    return { success: true, expense: updatedExpense };
  } catch (error) {
    console.error("updateExpenseAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '지출 항목 수정에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function deleteExpenseAction(expenseId: string, meetingId: string, currentUserId?: string | null) {
   if (!meetingId || !expenseId) {
    return { success: false, error: "잘못된 요청입니다. 모임 ID 또는 지출 ID가 없습니다."};
  }

  const permissionCheck = await _ensureUserPermission(currentUserId);
  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const callingUser = permissionCheck.user!;

  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) return { success: false, error: "모임을 찾을 수 없습니다." };
    
    const isAdminUser = callingUser.role === 'admin';
    const isCreator = meeting.creatorId === callingUser.id;

    if (!isAdminUser && !isCreator) {
        return { success: false, error: "지출 항목 삭제 권한이 없습니다." };
    }

    await dbDeleteExpense(meetingId, expenseId);

    if (meeting.isSettled) {
      await dbUpdateMeeting(meeting.id, { isSettled: false });
      if (!meeting.isTemporary && meeting.useReserveFund && meeting.partialReserveFundAmount && meeting.partialReserveFundAmount > 0) {
        await dbRevertMeetingDeduction(meeting.id);
        revalidatePath('/reserve-fund');
      }
    }
    revalidatePath(`/meetings/${meetingId}`);
    return { success: true };
  } catch (error) {
    console.error("deleteExpenseAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '지출 항목 삭제에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

// 회비 관련 액션
export async function setReserveFundBalanceAction(groupId: string, newBalance: number, description?: string, currentUserId?: string | null) {
  if (!groupId) {
    return { success: false, error: "그룹 ID가 필요합니다." };
  }

  const permissionCheck = await _ensureUserPermission(currentUserId, { entityName: '회비 잔액 설정' });
  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const callingUser = permissionCheck.user!;

  try {
    let hasPermission = false;
    if (callingUser.role === 'admin') {
      hasPermission = true;
    } else if (callingUser.role === 'user') { // 'user' 역할 사용자는 그룹 소유자인지 확인
      const groupDocRef = doc(db, 'friendGroups', groupId);
      const groupSnap = await getDoc(groupDocRef);
      if (groupSnap.exists()) {
        const groupData = groupSnap.data() as FriendGroup;
        if (groupData.ownerUserId === callingUser.id) {
          hasPermission = true;
        }
      }
    }

    if (!hasPermission) {
      return { success: false, error: "회비 잔액을 설정할 권한이 없습니다. 그룹 소유자 또는 관리자만 가능합니다." };
    }

    await dbSetReserveFundBalance(groupId, newBalance, description || "수동 잔액 조정");
    revalidatePath('/reserve-fund');
    revalidatePath('/'); // 대시보드 등 회비 잔액을 표시하는 페이지 재검증
    return { success: true, newBalance };
  } catch (error) {
    console.error("setReserveFundBalanceAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '회비 잔액 업데이트에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function finalizeMeetingSettlementAction(meetingId: string, currentUserId?: string | null) {
  const permissionCheck = await _ensureUserPermission(currentUserId, {
    requiredRole: 'admin',
    entityName: '정산 확정'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  // const callingUser = permissionCheck.user!; // 현재는 사용되지 않음, 필요시 활용

  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) return { success: false, error: '모임을 찾을 수 없습니다.' };
    if (meeting.isSettled) return { success: true, meeting, message: "이미 정산이 확정된 모임입니다." };
    if (!meeting.useReserveFund || !meeting.partialReserveFundAmount || meeting.partialReserveFundAmount <= 0) {
      const updatedMeeting = await dbUpdateMeeting(meetingId, { isSettled: true });
      if (!updatedMeeting) return { success: false, error: '정산 상태 업데이트에 실패했습니다.' };
      revalidatePath(`/meetings/${meetingId}`);
      revalidatePath('/');
      return { success: true, meeting: updatedMeeting, message: `모임 (${meeting.name}) 정산이 확정되었습니다. (회비 사용 없음)` };
    }

    const expenses = await dbGetExpensesByMeetingId(meetingId);
    if (expenses.length === 0) {
       const updatedMeeting = await dbUpdateMeeting(meetingId, { isSettled: true });
       if (!updatedMeeting) return { success: false, error: '정산 상태 업데이트에 실패했습니다.' };
       revalidatePath(`/meetings/${meetingId}`);
       revalidatePath('/');
       return { success: true, meeting: updatedMeeting, message: `모임 (${meeting.name}) 정산 확정. 지출 내역이 없어 회비는 사용되지 않았습니다.` };
    }

    // meeting.groupId를 사용하여 해당 그룹의 회비 잔액을 가져옴
    const currentReserveBalance = await getReserveFundBalance(meeting.groupId);
    const amountToDeduct = meeting.partialReserveFundAmount;

    let message = "";
    let actualDeduction = 0;

    if (amountToDeduct && amountToDeduct > 0) {
        actualDeduction = Math.min(amountToDeduct, currentReserveBalance ?? 0);
        if (actualDeduction > 0.001) {
            await dbRevertMeetingDeduction(meeting.id); 
            await dbRecordMeetingDeduction(meeting.groupId, meeting.id, meeting.name, actualDeduction, meeting.dateTime);
            message = `모임 (${meeting.name}) 정산 확정. 회비에서 ${actualDeduction.toLocaleString()}원 사용.`;
            if (actualDeduction < amountToDeduct) {
                message += ` (설정된 금액보다 회비 잔액이 부족하여 부분 사용)`;
            }
        } else if (amountToDeduct > 0 && (currentReserveBalance ?? 0) <= 0.001) {
             message = `모임 (${meeting.name}) 정산 확정. 회비 잔액 부족으로 설정된 금액을 사용할 수 없습니다.`;
        } else {
            message = `모임 (${meeting.name}) 정산 확정. 설정된 회비 사용액이 없거나 0원입니다.`;
        }
    } else {
        message = `모임 (${meeting.name}) 정산 확정. 회비 사용 설정이 없거나 금액이 0원입니다.`;
    }

    const updatedMeeting = await dbUpdateMeeting(meetingId, { isSettled: true });
    if (!updatedMeeting) {
      if(actualDeduction > 0.001) await dbRevertMeetingDeduction(meeting.id);
      return { success: false, error: '정산 상태 업데이트에 실패했습니다.' };
    }

    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath('/reserve-fund');
    revalidatePath('/');
    return { success: true, meeting: updatedMeeting, message };

  } catch (error) {
    console.error("finalizeMeetingSettlementAction Error:", error);
    try {
        const meetingOnError = await dbGetMeetingById(meetingId);
        if (meetingOnError && meetingOnError.useReserveFund && meetingOnError.partialReserveFundAmount && meetingOnError.partialReserveFundAmount > 0) {
            await dbRevertMeetingDeduction(meetingId);
        }
        await dbUpdateMeeting(meetingId, {isSettled: false});
        revalidatePath(`/meetings/${meetingId}`);
        revalidatePath('/reserve-fund');
    } catch (revertError) {
        console.error("Failed to revert settlement status after error:", revertError);
    }
    const errorMessage = error instanceof Error ? error.message : '정산 확정 중 예기치 않은 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}

// 사용자 역할 관리 액션
export async function updateUserRoleAction(userIdToUpdate: string, newRole: User['role'], currentAdminId?: string | null) {
  if (userIdToUpdate === currentAdminId) {
    return { success: false, error: "자신의 역할은 변경할 수 없습니다." };
  }

  const permissionCheck = await _ensureUserPermission(currentAdminId, {
    requiredRole: 'admin',
    entityName: '사용자 역할 변경'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  // const adminUser = permissionCheck.user!; // 현재는 사용되지 않음, 필요시 활용

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

// 모임 공유 액션
export async function toggleMeetingShareAction(meetingId: string, currentUserId: string, enable: boolean, expiryDays: number = 7) {
  const permissionCheck = await _ensureUserPermission(currentUserId, { entityName: '공유 설정 변경' });
  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const user = permissionCheck.user!;

  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) {
      return { success: false, error: "모임을 찾을 수 없습니다." };
    }

    const isCreator = meeting.creatorId === user.id;
    const isAdmin = user.role === 'admin';

    if (!isCreator && !isAdmin) {
      return { success: false, error: "공유 설정을 변경할 권한이 없습니다." };
    }

    let updates: Partial<Omit<Meeting, 'id' | 'createdAt'>>;

    if (enable) {
      const shareToken = nanoid(16);
      const shareExpiryDate = addDays(new Date(), expiryDays);
      updates = {
        isShareEnabled: true,
        shareToken: shareToken,
        shareExpiryDate: shareExpiryDate,
      };
    } else {
      updates = {
        isShareEnabled: false,
        shareToken: null,
        shareExpiryDate: null,
      };
    }

    const updatedMeeting = await dbUpdateMeeting(meetingId, updates);
    if (!updatedMeeting) {
      return { success: false, error: "모임 공유 설정 업데이트에 실패했습니다." };
    }

    revalidatePath(`/meetings/${meetingId}`);
    return { success: true, meeting: updatedMeeting };

  } catch (error) {
    console.error("toggleMeetingShareAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '공유 설정 변경 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}

// 친구 그룹 관련 액션
export async function createFriendGroupAction(
  name: string,
  currentUserId: string,
  memberIds: string[] = []
) {
  const permissionCheck = await _ensureUserPermission(currentUserId, {
    requiredRole: ['user', 'admin'],
    entityName: '친구 그룹 생성'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  // const currentUser = permissionCheck.user!; // 현재는 사용되지 않음, _ensureUserPermission이 user 객체를 반환

  try {
    // 역할 검사는 _ensureUserPermission에서 이미 처리되었음
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
  const permissionCheck = await _ensureUserPermission(currentUserId, { entityName: '친구 그룹 수정' });
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
  const permissionCheck = await _ensureUserPermission(currentUserId, { entityName: '친구 그룹 삭제' });
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


// 그룹별 친구 목록 조회
export async function getFriendsByGroupAction(groupId: string) {
  try {
    const friends = await dbGetFriendsByGroup(groupId);
    // friends가 undefined일 경우를 대비하여 빈 배열로 기본값 설정
    return { success: true, friends: friends ?? [] };
  } catch (error) {
    console.error(`getFriendsByGroupAction Error for groupId ${groupId}:`, error);
    const errorMessage = error instanceof Error ? error.message : '그룹별 친구 목록 조회 중 알 수 없는 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}
