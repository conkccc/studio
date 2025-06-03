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
} from './data-store';
import type { Friend, Meeting, Expense, ReserveFundTransaction, User, FriendGroup } from './types';
import { Timestamp } from 'firebase/firestore';
import { nanoid } from 'nanoid';
import { addDays } from 'date-fns';
import { db } from './firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';


// Friend Actions
export async function createFriendAction(name: string, groupId: string, description?: string) {
  try {
    // 1. 친구 추가
    if (!groupId || groupId.trim() === '') {
      throw new Error('그룹이 선택되지 않았습니다.');
    }
    const newFriend = await dbAddFriend({ name, description, groupId });
    // 2. 그룹의 memberIds에 친구 id 추가
    if (groupId) {
      // 기존 그룹 정보 가져오기
      // 서버/클라이언트 환경에 따라 db 인스턴스 사용
      const groupDocRef = doc(db, 'friendGroups', groupId);
      const groupSnap = await getDoc(groupDocRef);
      if (groupSnap.exists()) {
        const groupData = groupSnap.data();
        const memberIds: string[] = Array.isArray(groupData.memberIds) ? groupData.memberIds : [];
        if (!memberIds.includes(newFriend.id)) {
          memberIds.push(newFriend.id);
          await updateDoc(groupDocRef, { memberIds });
        }
      }
    }
    revalidatePath('/friends');
    revalidatePath(`/friends/${groupId}`); // 그룹별 친구 목록 경로도 갱신
    revalidatePath('/meetings/new'); // Friend list might be used here
    return { success: true, friend: newFriend };
  } catch (error) {
    console.error("createFriendAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '친구 추가에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function updateFriendAction(id: string, updates: Partial<Omit<Friend, 'id' | 'createdAt'>>) {
  try {
    // Assuming admin-only action based on UI and Firestore rules
    const updatedFriend = await dbUpdateFriend(id, updates);
    if (!updatedFriend) throw new Error('친구를 찾을 수 없습니다.');
    revalidatePath('/friends');
    revalidatePath(`/meetings`); // participant lists might need update
    return { success: true, friend: updatedFriend };
  } catch (error) {
    console.error("updateFriendAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '친구 정보 수정에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function deleteFriendAction(id: string) {
  try {
    // Assuming admin-only action
    await dbDeleteFriend(id);
    revalidatePath('/friends');
    revalidatePath('/meetings');
    return { success: true };
  } catch (error) {
    console.error("deleteFriendAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '친구 삭제에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

// Meeting Actions
export async function createMeetingAction(
  payload: Omit<Meeting, 'id' | 'createdAt' | 'isSettled' | 'isShareEnabled' | 'shareToken' | 'shareExpiryDate'>,
  currentUserId?: string | null
) {
  if (!currentUserId) {
    return { success: false, error: "인증되지 않은 사용자입니다. 로그인이 필요합니다." };
  }

  try {
    // Prepare base data, ensuring undefined coordinates become null
    const meetingDataToSave: Omit<Meeting, 'id' | 'createdAt' | 'isSettled'> = {
      name: payload.name,
      dateTime: payload.dateTime,
      endTime: payload.endTime, // Firestore handles Date or null for Timestamps
      locationName: payload.locationName || '', // Store empty string if undefined
      locationCoordinates: payload.locationCoordinates || null, // Store null if undefined
      creatorId: currentUserId,
      groupId: payload.groupId || '',
      memo: payload.memo || undefined,
      isTemporary: payload.isTemporary || false,
      // Default values for fields that might not be present if not set
      participantIds: [],
      useReserveFund: false,
      partialReserveFundAmount: undefined,
      nonReserveFundParticipants: [],
      temporaryParticipants: undefined,
      totalFee: undefined,
      feePerPerson: undefined,
      isShareEnabled: false, // Default for new meeting
      shareToken: null, // Default for new meeting
      shareExpiryDate: null, // Default for new meeting
      expenses: [], // Initialize expenses as an empty array for all new meetings
    };

    if (payload.isTemporary) {
      meetingDataToSave.temporaryParticipants = payload.temporaryParticipants || [];
      // totalFee 및 feePerPerson 처리 수정 for create
      if (payload.totalFee !== undefined && typeof payload.totalFee === 'number' && !isNaN(payload.totalFee)) {
        meetingDataToSave.totalFee = payload.totalFee;
        meetingDataToSave.feePerPerson = null; // totalFee가 있으면 feePerPerson은 null
      } else if (payload.feePerPerson !== undefined && typeof payload.feePerPerson === 'number' && !isNaN(payload.feePerPerson)) {
        meetingDataToSave.feePerPerson = payload.feePerPerson;
        meetingDataToSave.totalFee = null; // feePerPerson이 있으면 totalFee는 null
      } else {
        // 둘 다 입력 안 했거나 유효하지 않으면 둘 다 null로 설정 (undefined 방지)
        meetingDataToSave.totalFee = null;
        meetingDataToSave.feePerPerson = null;
      }
      // Ensure regular meeting fields are not set or are default
      meetingDataToSave.participantIds = [];
      meetingDataToSave.useReserveFund = false;
      meetingDataToSave.partialReserveFundAmount = null; // Explicitly null for temporary meetings
      meetingDataToSave.nonReserveFundParticipants = [];
    } else {
      // Regular meeting
      meetingDataToSave.participantIds = payload.participantIds || [];
      meetingDataToSave.useReserveFund = payload.useReserveFund || false; // Default to false if not provided

      if (meetingDataToSave.useReserveFund) {
        if (typeof payload.partialReserveFundAmount === 'number' && !isNaN(payload.partialReserveFundAmount)) {
          meetingDataToSave.partialReserveFundAmount = payload.partialReserveFundAmount;
        } else {
          meetingDataToSave.partialReserveFundAmount = 0; // Default to 0 if useReserveFund is true but amount is invalid/undefined
        }
      } else {
        meetingDataToSave.partialReserveFundAmount = null; // Set to null if useReserveFund is false
      }

      meetingDataToSave.nonReserveFundParticipants = payload.nonReserveFundParticipants || [];
      // Ensure temporary meeting fields are set to null for regular meetings
      meetingDataToSave.temporaryParticipants = null;
      meetingDataToSave.totalFee = null;
      meetingDataToSave.feePerPerson = null;
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
  payload: Partial<Omit<Meeting, 'id' | 'createdAt'>>, // Changed 'updates' to 'payload' for clarity
  currentUserId?: string | null
) {
  if (!currentUserId) {
    return { success: false, error: "인증되지 않은 사용자입니다. 로그인이 필요합니다." };
  }

  try {
    const meetingToUpdate = await dbGetMeetingById(id);
    if (!meetingToUpdate) {
      return { success: false, error: "수정할 모임을 찾을 수 없습니다." };
    }

    const callingUser = await dbGetUserById(currentUserId);
    const isAdminUser = callingUser?.role === 'admin';

    if (meetingToUpdate.creatorId !== currentUserId && !isAdminUser) {
      return { success: false, error: "모임 수정 권한이 없습니다." };
    }

    // If reserve fund settings change and meeting was settled, unsettle and revert deduction
    // Corrected 'updates' to 'payload' for consistency with function signature
    const reserveFundSettingsChanged = payload.useReserveFund !== undefined || payload.partialReserveFundAmount !== undefined || payload.nonReserveFundParticipants !== undefined;
    if (meetingToUpdate.isSettled && reserveFundSettingsChanged) {
      await dbRevertMeetingDeduction(id);
      (payload as any).isSettled = false; // Unset isSettled if fund settings change
       revalidatePath('/reserve-fund');
    }

    // Prepare data for update, respecting isTemporary status
    // We assume isTemporary itself is NOT changed during an update in this version.
    // The form logic would need to be more complex to allow switching meeting types.
    const meetingDataToUpdate: Partial<Omit<Meeting, 'id' | 'createdAt'>> = { ...payload };

    // Handle share settings if isShareEnabled is in payload
    if (payload.hasOwnProperty('isShareEnabled')) {
      if (payload.isShareEnabled === false) {
        meetingDataToUpdate.shareToken = null;
        meetingDataToUpdate.shareExpiryDate = null;
      } else if (payload.isShareEnabled === true) {
        // If enabling sharing here, but no token/expiry provided in payload,
        // rely on existing values or expect toggleMeetingShareAction to be used for proper setup.
        // For safety, ensure they are not accidentally nulled if they had values from ...payload spread
        // and payload.isShareEnabled was true but payload.shareToken/ExpiryDate were undefined.
        if (payload.shareToken === undefined && meetingToUpdate.shareToken) {
          meetingDataToUpdate.shareToken = meetingToUpdate.shareToken;
        } else if (payload.shareToken === undefined) {
           // This case implies enabling sharing without providing a token.
           // This should ideally be handled by toggleMeetingShareAction to generate a token.
           // For now, if it's enabled here without a token, we'll set to null,
           // assuming toggleMeetingShareAction will be used later.
           // Or, we prevent isShareEnabled:true if no token.
           // Let's stick to the prompt: if UI for shareExpiryDate is not present, it's not set here.
           // If isShareEnabled is true, and token/expiry are not in payload, they are left as is from ...payload spread.
        }
        if (payload.shareExpiryDate === undefined && meetingToUpdate.shareExpiryDate) {
          meetingDataToUpdate.shareExpiryDate = meetingToUpdate.shareExpiryDate;
        }
        // No explicit setting of shareExpiryDate to a default here if enabling,
        // as that's not the primary role of updateMeetingAction unless specific UI for expiry exists.
      }
    }


    // Handle location fields for Firestore compatibility
    if (meetingDataToUpdate.hasOwnProperty('locationName')) {
      meetingDataToUpdate.locationName = meetingDataToUpdate.locationName || '';
    }
    // If locationName is being set (even to empty) and locationCoordinates is not explicitly provided in payload,
    // or if locationName is cleared, locationCoordinates should be nulled out.
    if (meetingDataToUpdate.hasOwnProperty('locationCoordinates')) {
      meetingDataToUpdate.locationCoordinates = meetingDataToUpdate.locationCoordinates || null;
    } else if (meetingDataToUpdate.hasOwnProperty('locationName')) {
      // If locationName was changed/set, and coordinates are not in payload, set them to null
      // to ensure consistency, e.g. if a user clears a location search then types a name manually.
      meetingDataToUpdate.locationCoordinates = null;
    }


    if (meetingToUpdate.isTemporary) { // If existing meeting is temporary
      // Only update fields relevant to temporary meetings
      delete meetingDataToUpdate.participantIds;
      delete meetingDataToUpdate.useReserveFund;
      delete meetingDataToUpdate.partialReserveFundAmount;
      delete meetingDataToUpdate.nonReserveFundParticipants;

      // totalFee와 feePerPerson 업데이트 로직 for temporary meeting update
      let feeTypeSetInPayload = false;
      if (payload.hasOwnProperty('totalFee')) {
        if (payload.totalFee !== undefined && typeof payload.totalFee === 'number' && !isNaN(payload.totalFee)) {
          meetingDataToUpdate.totalFee = payload.totalFee;
          meetingDataToUpdate.feePerPerson = null;
          feeTypeSetInPayload = true;
        } else { // Explicitly set to null if undefined or null in payload
          meetingDataToUpdate.totalFee = null;
        }
      }

      if (payload.hasOwnProperty('feePerPerson')) {
        if (payload.feePerPerson !== undefined && typeof payload.feePerPerson === 'number' && !isNaN(payload.feePerPerson)) {
          meetingDataToUpdate.feePerPerson = payload.feePerPerson;
          // If totalFee was also in payload and valid, feePerPerson takes precedence or both are set (totalFee will be nulled by this path)
          // If totalFee was not in payload or was invalid, this will correctly set feePerPerson and nullify totalFee.
          meetingDataToUpdate.totalFee = null;
          feeTypeSetInPayload = true;
        } else { // Explicitly set to null if undefined or null in payload
          meetingDataToUpdate.feePerPerson = null;
        }
      }
      // If neither was in payload, existing values are kept unless one of them was already null and the other had a value.
      // This logic ensures that if one is actively set, the other is nulled.
      // If one is cleared (e.g. payload.totalFee = null) and the other is not in payload, the other remains.
      // If both are cleared in payload, both become null.

    } else { // If existing meeting is a regular meeting
      // Only update fields relevant to regular meetings
      delete meetingDataToUpdate.temporaryParticipants;
      // Ensure temporary fee fields are nulled if they are somehow in payload for a regular meeting
      if (payload.hasOwnProperty('totalFee')) meetingDataToUpdate.totalFee = null;
      if (payload.hasOwnProperty('feePerPerson')) meetingDataToUpdate.feePerPerson = null;

      // Handle useReserveFund and partialReserveFundAmount for regular meetings
      const willUseReserveFund = payload.hasOwnProperty('useReserveFund')
        ? !!payload.useReserveFund
        : meetingToUpdate.useReserveFund; // Fallback to existing value if not in payload

      if (payload.hasOwnProperty('useReserveFund')) { // If useReserveFund is explicitly in payload
        meetingDataToUpdate.useReserveFund = willUseReserveFund;
      }

      if (willUseReserveFund) {
        if (payload.hasOwnProperty('partialReserveFundAmount')) {
          if (typeof payload.partialReserveFundAmount === 'number' && !isNaN(payload.partialReserveFundAmount)) {
            meetingDataToUpdate.partialReserveFundAmount = payload.partialReserveFundAmount;
          } else {
            // Invalid amount in payload while useReserveFund is true (or becoming true)
            meetingDataToUpdate.partialReserveFundAmount = 0;
          }
        } else if (meetingDataToUpdate.useReserveFund && (meetingToUpdate.partialReserveFundAmount === undefined || typeof meetingToUpdate.partialReserveFundAmount !== 'number')) {
          // useReserveFund is true (or becoming true via payload), but no amount in payload, and existing amount is not a valid number
           if(payload.hasOwnProperty('useReserveFund') && !!payload.useReserveFund) { // only default to 0 if useReserveFund was explicitly set to true
            meetingDataToUpdate.partialReserveFundAmount = 0;
           } else if (!payload.hasOwnProperty('useReserveFund') && meetingToUpdate.useReserveFund && (meetingToUpdate.partialReserveFundAmount === null || typeof meetingToUpdate.partialReserveFundAmount !== 'number')) {
             // If useReserveFund was already true, and no amount in payload, and existing amount is null/invalid, set to 0
             meetingDataToUpdate.partialReserveFundAmount = 0;
           }
           // If useReserveFund was already true, and payload doesn't mention partialReserveFundAmount,
           // existing valid partialReserveFundAmount (already spread from ...payload) will be kept if it was part of the payload.
           // If payload.partialReserveFundAmount was undefined, it's now 0.
        }
         // If payload has no 'partialReserveFundAmount' and existing 'useReserveFund' is true,
         // meetingDataToUpdate.partialReserveFundAmount would have existing value from '...payload' spread.
         // Ensure it's not undefined if useReserveFund is true.
         if (meetingDataToUpdate.useReserveFund && meetingDataToUpdate.partialReserveFundAmount === undefined) {
           meetingDataToUpdate.partialReserveFundAmount = 0;
         }

      } else {
        // useReserveFund is false (either from payload or existing)
        meetingDataToUpdate.partialReserveFundAmount = null;
      }

      // If nonReserveFundParticipants is in payload and useReserveFund is false, it should be empty or null
      if (!willUseReserveFund && payload.hasOwnProperty('nonReserveFundParticipants')) {
        meetingDataToUpdate.nonReserveFundParticipants = [];
      } else if (!willUseReserveFund && !payload.hasOwnProperty('nonReserveFundParticipants')) {
        // If useReserveFund becomes false, and nonReserveFundParticipants was not in payload, ensure it's cleared
        if (meetingToUpdate.nonReserveFundParticipants && meetingToUpdate.nonReserveFundParticipants.length > 0) {
            meetingDataToUpdate.nonReserveFundParticipants = [];
        }
      }
    }


    const updatedMeeting = await dbUpdateMeeting(id, meetingDataToUpdate);
    if (!updatedMeeting) throw new Error('모임 업데이트에 실패했습니다.');

    revalidatePath('/meetings');
    revalidatePath(`/meetings/${id}`);
    revalidatePath('/'); // Dashboard might show recent meeting
    if (reserveFundSettingsChanged || (payload.isSettled !== undefined && !payload.isSettled)) {
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
   if (!currentUserId) {
    return { success: false, error: "인증되지 않은 사용자입니다. 로그인이 필요합니다." };
  }
  try {
    const meetingToDelete = await dbGetMeetingById(id);
    if (!meetingToDelete) {
      return { success: false, error: "삭제할 모임을 찾을 수 없습니다." };
    }
    const callingUser = await dbGetUserById(currentUserId);
    const isAdminUser = callingUser?.role === 'admin';

    if (meetingToDelete.creatorId !== currentUserId && !isAdminUser) {
      return { success: false, error: "모임 삭제 권한이 없습니다." };
    }

    await dbDeleteMeeting(id); // This now also reverts fund deduction
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

// Expense Actions
export async function createExpenseAction(expenseData: Omit<Expense, 'id' | 'createdAt'>, currentUserId?: string | null) {
  if (!currentUserId) {
    return { success: false, error: "인증되지 않은 사용자입니다. 로그인이 필요합니다." };
  }
  try {
    const meeting = await dbGetMeetingById(expenseData.meetingId);
    if (!meeting) return { success: false, error: "모임을 찾을 수 없습니다." };

    const callingUser = await dbGetUserById(currentUserId);
    const isAdminUser = callingUser?.role === 'admin';
    const isCreator = meeting.creatorId === currentUserId;

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
  if (!currentUserId) {
    return { success: false, error: "인증되지 않은 사용자입니다. 로그인이 필요합니다." };
  }
  if (!meetingId || !expenseId) {
    return { success: false, error: "잘못된 요청입니다. 모임 ID 또는 지출 ID가 없습니다."};
  }
  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) return { success: false, error: "모임을 찾을 수 없습니다." };

    const callingUser = await dbGetUserById(currentUserId);
    const isAdminUser = callingUser?.role === 'admin';
    const isCreator = meeting.creatorId === currentUserId;

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
  if (!currentUserId) {
    return { success: false, error: "인증되지 않은 사용자입니다. 로그인이 필요합니다." };
  }
   if (!meetingId || !expenseId) {
    return { success: false, error: "잘못된 요청입니다. 모임 ID 또는 지출 ID가 없습니다."};
  }
  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) return { success: false, error: "모임을 찾을 수 없습니다." };
    
    const callingUser = await dbGetUserById(currentUserId);
    const isAdminUser = callingUser?.role === 'admin';
    const isCreator = meeting.creatorId === currentUserId;

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

// Reserve Fund Actions
export async function setReserveFundBalanceAction(groupId: string, newBalance: number, description?: string, currentUserId?: string | null) {
  if (!currentUserId) {
    return { success: false, error: "인증되지 않은 사용자입니다. 로그인이 필요합니다." };
  }
  const callingUser = await dbGetUserById(currentUserId);
  if (!callingUser || callingUser.role !== 'admin') {
    return { success: false, error: "회비 잔액 설정 권한이 없습니다." };
  }

  try {
    await dbSetReserveFundBalance(groupId, newBalance, description || "수동 잔액 조정");
    revalidatePath('/reserve-fund');
    revalidatePath('/'); // Dashboard shows reserve balance
    return { success: true, newBalance };
  } catch (error) {
    console.error("setReserveFundBalanceAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '회비 잔액 업데이트에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function finalizeMeetingSettlementAction(meetingId: string, currentUserId?: string | null) {
  if (!currentUserId) {
    return { success: false, error: "인증되지 않은 사용자입니다. 로그인이 필요합니다." };
  }
  const callingUser = await dbGetUserById(currentUserId);
  if (!callingUser || callingUser.role !== 'admin') { // Only admins can finalize settlement now
    return { success: false, error: "정산 확정 권한이 없습니다." };
  }

  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) return { success: false, error: '모임을 찾을 수 없습니다.' };
    if (meeting.isSettled) return { success: true, meeting, message: "이미 정산이 확정된 모임입니다." };
    if (!meeting.useReserveFund || !meeting.partialReserveFundAmount || meeting.partialReserveFundAmount <= 0) {
      // If not using reserve fund or amount is zero, just mark as settled
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
    
    const currentReserveBalance = await getReserveFundBalance();
    const amountToDeduct = meeting.partialReserveFundAmount; // Already a number or undefined
    
    let message = "";
    let actualDeduction = 0;

    if (amountToDeduct && amountToDeduct > 0) {
        actualDeduction = Math.min(amountToDeduct, currentReserveBalance ?? 0);
        if (actualDeduction > 0.001) {
            // Revert any previous deduction for this meeting before recording a new one to prevent duplicates if action is retried
            await dbRevertMeetingDeduction(meeting.id); 
            await dbRecordMeetingDeduction(meeting.groupId, meeting.id, meeting.name, actualDeduction, meeting.dateTime); // groupId 전달
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
      // Attempt to revert deduction if settlement marking failed
      if(actualDeduction > 0.001) await dbRevertMeetingDeduction(meeting.id);
      return { success: false, error: '정산 상태 업데이트에 실패했습니다.' };
    }

    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath('/reserve-fund');
    revalidatePath('/');
    return { success: true, meeting: updatedMeeting, message };

  } catch (error) {
    console.error("finalizeMeetingSettlementAction Error:", error);
    // Attempt to revert and unsettle if error occurs mid-process
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

// User Role Management Action
export async function updateUserRoleAction(userIdToUpdate: string, newRole: User['role'], currentAdminId?: string | null) {
  if (!currentAdminId) {
    return { success: false, error: "인증되지 않은 사용자입니다. 관리자 로그인이 필요합니다." };
  }
  if (userIdToUpdate === currentAdminId) {
    return { success: false, error: "자신의 역할은 변경할 수 없습니다." };
  }

  try {
    const adminUser = await dbGetUserById(currentAdminId);
    if (!adminUser || adminUser.role !== 'admin') {
      return { success: false, error: "사용자 역할을 변경할 권한이 없습니다. 관리자만 가능합니다." };
    }

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

// Meeting Share Action
export async function toggleMeetingShareAction(meetingId: string, currentUserId: string, enable: boolean, expiryDays: number = 7) {
  if (!currentUserId) {
    return { success: false, error: "인증되지 않은 사용자입니다. 로그인이 필요합니다." };
  }

  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) {
      return { success: false, error: "모임을 찾을 수 없습니다." };
    }

    const user = await dbGetUserById(currentUserId); // Fetch user data from Firestore
    const isCreator = meeting.creatorId === currentUserId;
    const isAdmin = user?.role === 'admin';

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
        shareExpiryDate: shareExpiryDate, // Date 타입
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

// --- FriendGroup Actions ---
export async function createFriendGroupAction(
  name: string,
  ownerUserId: string,
  memberIds: string[] = []
) {
  try {
    const newGroup = await dbAddFriendGroup({ name, ownerUserId, memberIds });
    revalidatePath('/friends');
    revalidatePath('/meetings/new');
    return { success: true, group: newGroup };
  } catch (error) {
    console.error('createFriendGroupAction Error:', error);
    return { success: false, error: '친구 그룹 생성에 실패했습니다.' };
  }
}

export async function updateFriendGroupAction(
  id: string,
  updates: Partial<Omit<FriendGroup, 'id' | 'createdAt'>>
) {
  try {
    const updatedGroup = await dbUpdateFriendGroup(id, updates);
    return { success: true, group: updatedGroup };
  } catch (error) {
    console.error('updateFriendGroupAction Error:', error);
    return { success: false, error: '친구 그룹 수정에 실패했습니다.' };
  }
}

export async function deleteFriendGroupAction(id: string) {
  try {
    await dbDeleteFriendGroup(id);
    return { success: true };
  } catch (error) {
    console.error('deleteFriendGroupAction Error:', error);
    return { success: false, error: '친구 그룹 삭제에 실패했습니다.' };
  }
}

// 그룹별 친구 목록 조회
export async function getFriendsByGroupAction(groupId: string) {
  try {
    const friends = await (await import('./data-store')).getFriendsByGroup(groupId);
    return { success: true, friends: friends ?? [] };
  } catch (error) {
    return { success: false, error: '그룹별 친구 목록 조회에 실패했습니다.' };
  }
}
