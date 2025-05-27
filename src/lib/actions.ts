
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
  getFriendById,
  getMeetingById as dbGetMeetingById,
  getExpensesByMeetingId as dbGetExpensesByMeetingId,
  getFriends as dbGetFriends,
  getReserveFundBalance,
  setReserveFundBalance as dbSetReserveFundBalance,
  recordMeetingDeduction as dbRecordMeetingDeduction,
  revertMeetingDeduction as dbRevertMeetingDeduction,
  getLoggedReserveFundTransactions,
  getExpenseById as dbGetExpenseById,
} from './data-store';
import type { Friend, Meeting, Expense, ReserveFundTransaction } from './types';

// Friend Actions
export async function createFriendAction(nickname: string, name?: string) {
  try {
    const newFriend = await dbAddFriend(nickname, name);
    revalidatePath('/friends');
    revalidatePath('/meetings/new');
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
    revalidatePath(`/meetings`);
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
    revalidatePath('/');
    revalidatePath(`/meetings/${newMeeting.id}`);
    return { success: true, meeting: newMeeting };
  } catch (error) {
    console.error("createMeetingAction Error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create meeting' };
  }
}

export async function updateMeetingAction(id: string, updates: Partial<Omit<Meeting, 'id' | 'createdAt' | 'isSettled'>>) {
  try {
    const updatedMeeting = await dbUpdateMeeting(id, updates);
    if (!updatedMeeting) throw new Error('Meeting not found for update');

    if (updatedMeeting.isSettled && (updates.useReserveFund !== undefined || updates.partialReserveFundAmount !== undefined)) {
      await dbRevertMeetingDeduction(id);
      await dbUpdateMeeting(id, { isSettled: false });
    }

    revalidatePath('/meetings');
    revalidatePath(`/meetings/${id}`);
    revalidatePath('/reserve-fund');
    return { success: true, meeting: updatedMeeting };
  } catch (error) {
    console.error("updateMeetingAction Error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update meeting' };
  }
}

export async function deleteMeetingAction(id: string) {
  try {
    await dbDeleteMeeting(id);
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

export async function updateExpenseAction(meetingId: string, expenseId: string, updates: Partial<Omit<Expense, 'id' | 'createdAt' | 'meetingId'>>) {
  try {
    const updatedExpense = await dbUpdateExpense(meetingId, expenseId, updates);
    if (!updatedExpense) throw new Error('Expense not found for update');
    revalidatePath(`/meetings/${meetingId}`);

    const meeting = await dbGetMeetingById(meetingId);
    if (meeting && meeting.isSettled) {
      await dbUpdateMeeting(meetingId, { isSettled: false });
      await dbRevertMeetingDeduction(meetingId);
      revalidatePath('/reserve-fund');
    }
    return { success: true, expense: updatedExpense };
  } catch (error) {
    console.error("updateExpenseAction Error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update expense' };
  }
}

export async function deleteExpenseAction(meetingId: string, expenseId: string) {
  try {
    await dbDeleteExpense(meetingId, expenseId);
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
    await dbSetReserveFundBalance(newBalance, description || "수동 잔액 설정");
    revalidatePath('/reserve-fund');
    revalidatePath('/');
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
      return { success: false, error: 'Meeting not found.' };
    }

    if (!meeting.useReserveFund) {
      const settledMeeting = await dbUpdateMeeting(meetingId, { isSettled: true });
      if (!settledMeeting) return { success: false, error: 'Failed to update meeting status.'};
      revalidatePath(`/meetings/${meetingId}`);
      return { success: true, meeting: settledMeeting, message: "모임 정산 완료 (회비 사용 안 함)." };
    }

    if (meeting.isSettled) {
      return { success: true, meeting, message: "이미 정산이 확정된 모임입니다." };
    }

    const amountToDeduct = meeting.partialReserveFundAmount;
    if (!amountToDeduct || amountToDeduct <= 0) {
      const settledMeetingNoFund = await dbUpdateMeeting(meetingId, { isSettled: true });
      if (!settledMeetingNoFund) return { success: false, error: 'Failed to update meeting status.'};
      revalidatePath(`/meetings/${meetingId}`);
      return { success: true, meeting: settledMeetingNoFund, message: "사용할 회비 금액이 설정되지 않아, 회비 사용 없이 정산 완료." };
    }

    const expenses = await dbGetExpensesByMeetingId(meetingId);
    if (expenses.length === 0) {
      const settledMeetingNoExpenses = await dbUpdateMeeting(meetingId, { isSettled: true });
       if (!settledMeetingNoExpenses) return { success: false, error: 'Failed to update meeting status.'};
      revalidatePath(`/meetings/${meetingId}`);
      return { success: true, meeting: settledMeetingNoExpenses, message: "지출 내역이 없어 회비 사용 없이 정산 완료." };
    }

    const currentReserveBalance = await getReserveFundBalance();
    const actualDeduction = Math.min(amountToDeduct, currentReserveBalance);
    let message = `모임 (${meeting.name}) 정산 완료.`;

    await dbRevertMeetingDeduction(meetingId); // Revert any previous deduction

    if (actualDeduction > 0.001) { // Check for a meaningful amount
      await dbRecordMeetingDeduction(meeting.id, meeting.name, actualDeduction, new Date(meeting.dateTime));
      message = `모임 (${meeting.name}) 정산 완료. 회비에서 ${actualDeduction.toLocaleString()}원 사용.`;
      if (actualDeduction < amountToDeduct) {
        message += ` (회비 잔액 부족으로 부분 사용)`;
      }
    } else if (amountToDeduct > 0 && currentReserveBalance <= 0) {
      message = `모임 (${meeting.name}) 정산 완료. 회비 잔액 부족으로 설정된 금액을 사용할 수 없습니다.`;
    } else {
      message = `모임 (${meeting.name}) 정산 완료. 설정된 회비 사용액이 없거나 0원입니다.`;
    }

    const updatedMeeting = await dbUpdateMeeting(meetingId, { isSettled: true });
    if (!updatedMeeting) {
      // Attempt to revert deduction if marking as settled failed, though this might be complex
      // For simplicity, we just return an error here. Proper transactionality would be better.
      return { success: false, error: 'Failed to mark meeting as settled after fund transaction.' };
    }

    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath('/reserve-fund');
    revalidatePath('/');
    return { success: true, meeting: updatedMeeting, message };

  } catch (error) {
    console.error("finalizeMeetingSettlementAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to finalize meeting settlement due to an unexpected error.';
    // Potentially try to revert any partial changes if possible, though complex without transactions
    return { success: false, error: errorMessage };
  }
}
