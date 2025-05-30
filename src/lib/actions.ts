
'use server';

import { revalidatePath } from 'next/cache';
import {
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
  dbSetReserveFundBalance, // Renamed in data-store
  dbRecordMeetingDeduction, // Renamed in data-store
  dbRevertMeetingDeduction, // Renamed in data-store
  getExpenseById as dbGetExpenseById,
  updateUser as dbUpdateUser, // For updating user roles
  getUserById as dbGetUserById, // To check admin role for actions
} from './data-store';
import type { Friend, Meeting, Expense, ReserveFundTransaction, User } from './types';
import { Timestamp } from 'firebase/firestore';
import { nanoid } from 'nanoid';
import { addDays } from 'date-fns';


// Friend Actions
export async function createFriendAction(nickname: string, name?: string) {
  try {
    // Assuming this action can only be called by an admin (UI controlled)
    // For true security, verify caller's admin role here using their UID
    const newFriend = await dbAddFriend({ nickname, name }); // No role field
    revalidatePath('/friends');
    revalidatePath('/meetings/new');
    return { success: true, friend: newFriend };
  } catch (error) {
    console.error("createFriendAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create friend';
    return { success: false, error: errorMessage };
  }
}

export async function updateFriendAction(id: string, updates: Partial<Omit<Friend, 'id' | 'createdAt'>>) {
  try {
    // Assuming admin-only action
    const updatedFriend = await dbUpdateFriend(id, updates); // No role field in updates
    if (!updatedFriend) throw new Error('Friend not found for update');
    revalidatePath('/friends');
    revalidatePath(`/meetings`);
    return { success: true, friend: updatedFriend };
  } catch (error) {
    console.error("updateFriendAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update friend';
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
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete friend';
    return { success: false, error: errorMessage };
  }
}

// Meeting Actions
export async function createMeetingAction(
  meetingData: Omit<Meeting, 'id' | 'createdAt' | 'isSettled' | 'isShareEnabled' | 'shareToken' | 'shareExpiryDate'>,
  currentUserId?: string | null // Added for permission check
) {
  if (!currentUserId) {
    return { success: false, error: "인증되지 않은 사용자입니다. 로그인이 필요합니다." };
  }
  // Optional: Check if currentUserId is admin based on Firestore role
  // const callingUser = await dbGetUserById(currentUserId);
  // if (!callingUser || callingUser.role !== 'admin') {
  //   return { success: false, error: "모임 생성 권한이 없습니다." };
  // }

  try {
    const newMeeting = await dbAddMeeting({
      ...meetingData,
      creatorId: currentUserId, // Ensure creatorId is set to the authenticated user
    });
    revalidatePath('/meetings');
    revalidatePath('/');
    revalidatePath(`/meetings/${newMeeting.id}`);
    return { success: true, meeting: newMeeting };
  } catch (error) {
    console.error("createMeetingAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create meeting';
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
      return { success: false, error: "모임을 찾을 수 없습니다." };
    }

    const callingUser = await dbGetUserById(currentUserId);
    const isAdminUser = callingUser?.role === 'admin';

    if (meetingToUpdate.creatorId !== currentUserId && !isAdminUser) {
      return { success: false, error: "모임 수정 권한이 없습니다." };
    }

    if (meetingToUpdate.isSettled && (updates.useReserveFund !== undefined || updates.partialReserveFundAmount !== undefined)) {
      await dbRevertMeetingDeduction(id);
      (updates as any).isSettled = false;
    }

    const updatedMeeting = await dbUpdateMeeting(id, updates);
    if (!updatedMeeting) throw new Error('Meeting not found after update attempt.');

    revalidatePath('/meetings');
    revalidatePath(`/meetings/${id}`);
    if (updates.useReserveFund !== undefined || updates.partialReserveFundAmount !== undefined || (updates.isSettled !== undefined && !updates.isSettled)) {
      revalidatePath('/reserve-fund');
    }
    return { success: true, meeting: updatedMeeting };
  } catch (error) {
    console.error("updateMeetingAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update meeting';
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

    await dbDeleteMeeting(id);
    revalidatePath('/meetings');
    revalidatePath('/');
    revalidatePath('/reserve-fund');
    return { success: true };
  } catch (error) {
    console.error("deleteMeetingAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete meeting';
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
    revalidatePath(`/meetings/${expenseData.meetingId}`);

    if (meeting.isSettled) {
      await dbUpdateMeeting(expenseData.meetingId, { isSettled: false });
      await dbRevertMeetingDeduction(expenseData.meetingId);
      revalidatePath('/reserve-fund');
    }
    return { success: true, expense: newExpense };
  } catch (error) {
    console.error("createExpenseAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create expense';
    return { success: false, error: errorMessage };
  }
}

export async function updateExpenseAction(
  meetingId: string,
  expenseId: string,
  updates: Partial<Omit<Expense, 'id' | 'createdAt' | 'meetingId'>>,
  currentUserId?: string | null
) {
  if (!currentUserId) {
    return { success: false, error: "인증되지 않은 사용자입니다. 로그인이 필요합니다." };
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
    if (!updatedExpense) throw new Error('Expense not found for update');
    revalidatePath(`/meetings/${meetingId}`);

    if (meeting.isSettled) {
      await dbUpdateMeeting(meetingId, { isSettled: false });
      await dbRevertMeetingDeduction(meetingId);
      revalidatePath('/reserve-fund');
    }
    return { success: true, expense: updatedExpense };
  } catch (error) {
    console.error("updateExpenseAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update expense';
    return { success: false, error: errorMessage };
  }
}

export async function deleteExpenseAction(meetingId: string, expenseId: string, currentUserId?: string | null) {
  if (!currentUserId) {
    return { success: false, error: "인증되지 않은 사용자입니다. 로그인이 필요합니다." };
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
    revalidatePath(`/meetings/${meetingId}`);

    if (meeting.isSettled) {
      await dbUpdateMeeting(meetingId, { isSettled: false });
      await dbRevertMeetingDeduction(meetingId);
      revalidatePath('/reserve-fund');
    }
    return { success: true };
  } catch (error) {
    console.error("deleteExpenseAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete expense';
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
    revalidatePath('/');
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
  if (!callingUser || callingUser.role !== 'admin') {
    return { success: false, error: "정산 확정 권한이 없습니다." };
  }

  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) return { success: false, error: '모임을 찾을 수 없습니다.' };
    if (meeting.isSettled) return { success: true, meeting, message: "이미 정산이 확정된 모임입니다." };

    let message = `모임 (${meeting.name}) 정산이 확정되었습니다.`;

    if (meeting.useReserveFund && meeting.partialReserveFundAmount && meeting.partialReserveFundAmount > 0) {
      const expenses = await dbGetExpensesByMeetingId(meetingId);
      if (expenses.length === 0) {
         message = `모임 (${meeting.name}) 정산 확정. 지출 내역이 없어 회비는 사용되지 않았습니다.`;
      } else {
        const currentReserveBalance = await getReserveFundBalance();
        const amountToDeduct = meeting.partialReserveFundAmount;
        const actualDeduction = Math.min(amountToDeduct, currentReserveBalance);

        await dbRevertMeetingDeduction(meeting.id);

        if (actualDeduction > 0.001) {
          await dbRecordMeetingDeduction(meeting.id, meeting.name, actualDeduction, meeting.dateTime instanceof Timestamp ? meeting.dateTime.toDate() : new Date(meeting.dateTime) );
          message = `모임 (${meeting.name}) 정산 확정. 회비에서 ${actualDeduction.toLocaleString()}원 사용.`;
          if (actualDeduction < amountToDeduct) {
            message += ` (회비 잔액 부족으로 부분 사용)`;
          }
        } else if (amountToDeduct > 0 && currentReserveBalance <= 0.001) {
          message = `모임 (${meeting.name}) 정산 확정. 회비 잔액 부족으로 설정된 금액을 사용할 수 없습니다.`;
        } else {
           message = `모임 (${meeting.name}) 정산 확정. 설정된 회비 사용액이 없거나 0원입니다.`;
        }
      }
    } else {
      message = `모임 (${meeting.name}) 정산 확정. 회비 사용 설정이 되어있지 않습니다.`;
    }

    const updatedMeeting = await dbUpdateMeeting(meetingId, { isSettled: true });
    if (!updatedMeeting) {
      return { success: false, error: '정산 상태 업데이트에 실패했습니다.' };
    }

    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath('/reserve-fund');
    revalidatePath('/');
    return { success: true, meeting: updatedMeeting, message };

  } catch (error) {
    console.error("finalizeMeetingSettlementAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '정산 확정 중 예기치 않은 오류가 발생했습니다.';
    try {
        await dbUpdateMeeting(meetingId, {isSettled: false});
        await dbRevertMeetingDeduction(meetingId);
    } catch (revertError) {
        console.error("Failed to revert settlement status after error:", revertError);
    }
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

    const user = await dbGetUserById(currentUserId);
    const isCreator = meeting.creatorId === currentUserId;
    const isAdmin = user?.role === 'admin';

    if (!isCreator && !isAdmin) {
      return { success: false, error: "공유 설정을 변경할 권한이 없습니다." };
    }

    let updates: Partial<Omit<Meeting, 'id' | 'createdAt'>>;

    if (enable) {
      const shareToken = nanoid(16); // Generate a 16-character token
      const shareExpiryDate = addDays(new Date(), expiryDays);
      updates = {
        isShareEnabled: true,
        shareToken: shareToken,
        shareExpiryDate: Timestamp.fromDate(shareExpiryDate),
      };
    } else {
      updates = {
        isShareEnabled: false,
        shareToken: null, // Use null to remove from Firestore
        shareExpiryDate: null,
      };
    }

    const updatedMeeting = await dbUpdateMeeting(meetingId, updates);
    if (!updatedMeeting) {
      return { success: false, error: "모임 공유 설정 업데이트에 실패했습니다." };
    }

    revalidatePath(`/meetings/${meetingId}`);
    return { success: true, meeting: updatedMeeting, shareToken: enable ? updatedMeeting.shareToken : null };

  } catch (error) {
    console.error("toggleMeetingShareAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '공유 설정 변경 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}
