
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
} from './data-store';
import type { Friend, Meeting, Expense, ReserveFundTransaction, User } from './types';
import { Timestamp } from 'firebase/firestore';
import { nanoid } from 'nanoid';
import { addDays } from 'date-fns';


// Friend Actions
export async function createFriendAction(nickname: string, name?: string) {
  try {
    // Permission check should ideally be here if not using Firestore rules exclusively
    // For now, assuming UI and Firestore rules handle admin-only access
    const newFriend = await dbAddFriend({ nickname, name });
    revalidatePath('/friends');
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
  meetingData: Omit<Meeting, 'id' | 'createdAt' | 'isSettled' | 'isShareEnabled' | 'shareToken' | 'shareExpiryDate'>,
  currentUserId?: string | null
) {
  if (!currentUserId) {
    return { success: false, error: "인증되지 않은 사용자입니다. 로그인이 필요합니다." };
  }
  // Basic permission check (assuming only admins can create meetings based on UI)
  // For robust security, check user's role from Firestore here if needed.
  // const callingUser = await dbGetUserById(currentUserId);
  // if (!callingUser || callingUser.role !== 'admin') {
  // return { success: false, error: "모임 생성 권한이 없습니다." };
  // }

  try {
    const newMeeting = await dbAddMeeting({
      ...meetingData,
      creatorId: currentUserId, // Ensure creatorId is set
    });
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
  updates: Partial<Omit<Meeting, 'id' | 'createdAt'>>,
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
    const reserveFundSettingsChanged = updates.useReserveFund !== undefined || updates.partialReserveFundAmount !== undefined || updates.nonReserveFundParticipants !== undefined;
    if (meetingToUpdate.isSettled && reserveFundSettingsChanged) {
      await dbRevertMeetingDeduction(id);
      (updates as any).isSettled = false; // Unset isSettled if fund settings change
       revalidatePath('/reserve-fund');
    }


    const updatedMeeting = await dbUpdateMeeting(id, updates);
    if (!updatedMeeting) throw new Error('모임 업데이트에 실패했습니다.');

    revalidatePath('/meetings');
    revalidatePath(`/meetings/${id}`);
    revalidatePath('/'); // Dashboard might show recent meeting
    if (reserveFundSettingsChanged || (updates.isSettled !== undefined && !updates.isSettled)) {
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
      await dbUpdateMeeting(expenseData.meetingId, { isSettled: false });
      await dbRevertMeetingDeduction(expenseData.meetingId);
      revalidatePath('/reserve-fund');
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
      await dbUpdateMeeting(meetingId, { isSettled: false });
      await dbRevertMeetingDeduction(meetingId);
      revalidatePath('/reserve-fund');
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
      await dbUpdateMeeting(meetingId, { isSettled: false });
      await dbRevertMeetingDeduction(meetingId);
      revalidatePath('/reserve-fund');
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
export async function setReserveFundBalanceAction(newBalance: number, description?: string, currentUserId?: string | null) {
  if (!currentUserId) {
    return { success: false, error: "인증되지 않은 사용자입니다. 로그인이 필요합니다." };
  }
  const callingUser = await dbGetUserById(currentUserId);
  if (!callingUser || callingUser.role !== 'admin') {
    return { success: false, error: "회비 잔액 설정 권한이 없습니다." };
  }

  try {
    await dbSetReserveFundBalance(newBalance, description || "수동 잔액 조정");
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
        actualDeduction = Math.min(amountToDeduct, currentReserveBalance);
        if (actualDeduction > 0.001) {
            // Revert any previous deduction for this meeting before recording a new one to prevent duplicates if action is retried
            await dbRevertMeetingDeduction(meeting.id); 
            await dbRecordMeetingDeduction(meeting.id, meeting.name, actualDeduction, meeting.dateTime); // Pass meeting.dateTime as JS Date
            message = `모임 (${meeting.name}) 정산 확정. 회비에서 ${actualDeduction.toLocaleString()}원 사용.`;
            if (actualDeduction < amountToDeduct) {
                message += ` (설정된 금액보다 회비 잔액이 부족하여 부분 사용)`;
            }
        } else if (amountToDeduct > 0 && currentReserveBalance <= 0.001) {
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
        shareExpiryDate: Timestamp.fromDate(shareExpiryDate),
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
    // Return the updated meeting object, which now includes JS Date for shareExpiryDate if set
    return { success: true, meeting: updatedMeeting };

  } catch (error) {
    console.error("toggleMeetingShareAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '공유 설정 변경 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}
