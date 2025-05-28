
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
  setReserveFundBalance as dbSetReserveFundBalance,
  recordMeetingDeduction as dbRecordMeetingDeduction,
  revertMeetingDeduction as dbRevertMeetingDeduction,
  getExpenseById as dbGetExpenseById,
} from './data-store';
import type { Friend, Meeting, Expense, ReserveFundTransaction } from './types';

// Friend Actions
export async function createFriendAction(nickname: string, name?: string) {
  try {
    const newFriend = await dbAddFriend({ nickname, name, createdAt: new Date() });
    revalidatePath('/friends');
    revalidatePath('/meetings/new'); // Revalidate new meeting page as friends list might change
    return { success: true, friend: newFriend };
  } catch (error) {
    console.error("createFriendAction Error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create friend' };
  }
}

export async function updateFriendAction(id: string, updates: Partial<Omit<Friend, 'id' | 'createdAt'>>) {
  try {
    const updatedFriend = await dbUpdateFriend(id, updates);
    if (!updatedFriend) throw new Error('Friend not found for update');
    revalidatePath('/friends');
    revalidatePath(`/meetings`); // Revalidate all meetings in case participant names changed
    return { success: true, friend: updatedFriend };
  } catch (error) {
    console.error("updateFriendAction Error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update friend' };
  }
}

export async function deleteFriendAction(id: string) {
  try {
    await dbDeleteFriend(id);
    revalidatePath('/friends');
    revalidatePath('/meetings');
    return { success: true };
  } catch (error) {
    console.error("deleteFriendAction Error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete friend' };
  }
}

// Meeting Actions
export async function createMeetingAction(meetingData: Omit<Meeting, 'id' | 'createdAt' | 'isSettled'>) {
  try {
    const newMeeting = await dbAddMeeting(meetingData);
    revalidatePath('/meetings');
    revalidatePath('/'); // Revalidate dashboard
    revalidatePath(`/meetings/${newMeeting.id}`); // Revalidate specific new meeting page
    return { success: true, meeting: newMeeting };
  } catch (error) {
    console.error("createMeetingAction Error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create meeting' };
  }
}

export async function updateMeetingAction(id: string, updates: Partial<Omit<Meeting, 'id' | 'createdAt'>>) {
  try {
    const currentMeeting = await dbGetMeetingById(id);
    if (!currentMeeting) {
      return { success: false, error: 'Meeting not found for update.' };
    }

    // Check if reserve fund usage details are changing on an already settled meeting
    const reserveFundDetailsChanged = updates.useReserveFund !== undefined || updates.partialReserveFundAmount !== undefined;

    if (currentMeeting.isSettled && reserveFundDetailsChanged) {
      await dbRevertMeetingDeduction(id); // Revert previous deduction if any
      // Temporarily mark as unsettled. Finalize will handle new deduction if applicable.
      updates.isSettled = false; 
    }

    const updatedMeeting = await dbUpdateMeeting(id, updates);
    if (!updatedMeeting) throw new Error('Meeting not found after update attempt.');

    revalidatePath('/meetings');
    revalidatePath(`/meetings/${id}`);
    if (reserveFundDetailsChanged || (updates.isSettled !== undefined && !updates.isSettled)) {
      revalidatePath('/reserve-fund'); // Revalidate if fund usage or settlement status changes
    }
    return { success: true, meeting: updatedMeeting };
  } catch (error) {
    console.error("updateMeetingAction Error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update meeting' };
  }
}

export async function deleteMeetingAction(id: string) {
  try {
    await dbDeleteMeeting(id); // This already handles reverting fund deduction in data-store
    revalidatePath('/meetings');
    revalidatePath('/');
    revalidatePath('/reserve-fund');
    return { success: true };
  } catch (error) {
    console.error("deleteMeetingAction Error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete meeting' };
  }
}

// Expense Actions
export async function createExpenseAction(expenseData: Omit<Expense, 'id' | 'createdAt'>) {
  try {
    const newExpense = await dbAddExpense(expenseData);
    revalidatePath(`/meetings/${expenseData.meetingId}`);

    const meeting = await dbGetMeetingById(expenseData.meetingId);
    if (meeting && meeting.isSettled) {
      await dbUpdateMeeting(expenseData.meetingId, { isSettled: false });
      await dbRevertMeetingDeduction(expenseData.meetingId);
      revalidatePath('/reserve-fund');
    }
    return { success: true, expense: newExpense };
  } catch (error) {
    console.error("createExpenseAction Error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create expense' };
  }
}

export async function updateExpenseAction(expenseId: string, meetingId: string, updates: Partial<Omit<Expense, 'id' | 'createdAt' | 'meetingId'>>) {
  try {
    const updatedExpense = await dbUpdateExpense(expenseId, meetingId, updates);
    if (!updatedExpense) throw new Error('Expense not found for update');
    revalidatePath(`/meetings/${meetingId}`);

    const meeting = await dbGetMeetingById(meetingId);
    if (meeting && meeting.isSettled) {
      await dbUpdateMeeting(meetingId, { isSettled: false });
      await dbRevertMeetingDeduction(meetingId); // Revert deduction for the meeting
      revalidatePath('/reserve-fund');
    }
    return { success: true, expense: updatedExpense };
  } catch (error) {
    console.error("updateExpenseAction Error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update expense' };
  }
}


export async function deleteExpenseAction(expenseId: string, meetingId: string) {
  try {
    const expense = await dbGetExpenseById(expenseId, meetingId);
    if (!expense) {
        return { success: false, error: "Expense not found." };
    }
    await dbDeleteExpense(expenseId, meetingId);
    revalidatePath(`/meetings/${meetingId}`);

    const meeting = await dbGetMeetingById(meetingId);
    if (meeting && meeting.isSettled) {
      await dbUpdateMeeting(meetingId, { isSettled: false });
      await dbRevertMeetingDeduction(meetingId);
      revalidatePath('/reserve-fund');
    }
    return { success: true };
  } catch (error) {
    console.error("deleteExpenseAction Error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete expense' };
  }
}

// Reserve Fund Actions
export async function setReserveFundBalanceAction(newBalance: number, description?: string) {
  try {
    await dbSetReserveFundBalance(newBalance, description || "수동 잔액 조정");
    revalidatePath('/reserve-fund');
    revalidatePath('/'); // For dashboard balance display
    return { success: true, newBalance };
  } catch (error) {
    console.error("setReserveFundBalanceAction Error:", error);
    return { success: false, error: error instanceof Error ? error.message : '회비 잔액 업데이트에 실패했습니다.' };
  }
}

export async function finalizeMeetingSettlementAction(meetingId: string) {
  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) {
      return { success: false, error: '모임을 찾을 수 없습니다.' };
    }

    if (meeting.isSettled) {
      return { success: true, meeting, message: "이미 정산이 확정된 모임입니다." };
    }

    let message = `모임 (${meeting.name}) 정산이 확정되었습니다.`;

    if (meeting.useReserveFund && meeting.partialReserveFundAmount && meeting.partialReserveFundAmount > 0) {
      const expenses = await dbGetExpensesByMeetingId(meetingId);
      if (expenses.length === 0) {
         message = `모임 (${meeting.name}) 정산 확정. 지출 내역이 없어 회비는 사용되지 않았습니다.`;
      } else {
        const currentReserveBalance = await getReserveFundBalance();
        const amountToDeduct = meeting.partialReserveFundAmount;
        const actualDeduction = Math.min(amountToDeduct, currentReserveBalance);

        // Revert any previous deduction for this meeting to ensure idempotency before new record
        await dbRevertMeetingDeduction(meeting.id); 

        if (actualDeduction > 0.001) {
          await dbRecordMeetingDeduction(meeting.id, meeting.name, actualDeduction, new Date(meeting.dateTime));
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
      // This case should ideally not happen if the meeting existed before.
      // If it does, an attempt to revert any newly recorded deduction might be needed,
      // but it's complex without full transaction support across actions.
      return { success: false, error: '정산 상태 업데이트에 실패했습니다.' };
    }

    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath('/reserve-fund');
    revalidatePath('/'); // For dashboard balance display
    return { success: true, meeting: updatedMeeting, message };

  } catch (error) {
    console.error("finalizeMeetingSettlementAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '정산 확정 중 예기치 않은 오류가 발생했습니다.';
    // Attempt to revert meeting to unsettled if an error occurred after potential DB changes
    try {
        await dbUpdateMeeting(meetingId, {isSettled: false});
        await dbRevertMeetingDeduction(meetingId);
    } catch (revertError) {
        console.error("Failed to revert settlement status after error:", revertError);
    }
    return { success: false, error: errorMessage };
  }
}

    