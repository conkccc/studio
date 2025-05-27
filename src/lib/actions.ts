
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
  getExpenseById, // Ensure this is imported
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
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create friend' };
  }
}

export async function updateFriendAction(id: string, updates: Partial<Omit<Friend, 'id' | 'createdAt'>>) {
  try {
    const updatedFriend = await dbUpdateFriend(id, updates);
    if (!updatedFriend) throw new Error('Friend not found');
    revalidatePath('/friends');
    revalidatePath(`/meetings`);
    return { success: true, friend: updatedFriend };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update friend' };
  }
}

export async function deleteFriendAction(id: string) {
  try {
    const success = await dbDeleteFriend(id);
    if (!success) throw new Error('Failed to delete friend or friend not found');
    revalidatePath('/friends');
    revalidatePath('/meetings');
    return { success: true };
  } catch (error) {
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
    // For '일정 금액 사용', the actual fund transaction happens at settlement.
    // So no immediate revalidatePath for /reserve-fund is needed here for meeting creation itself.
    return { success: true, meeting: newMeeting };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create meeting' };
  }
}

export async function updateMeetingAction(id: string, updates: Partial<Omit<Meeting, 'id' | 'isSettled'>>) {
  try {
    const updatedMeeting = await dbUpdateMeeting(id, updates);
    if (!updatedMeeting) throw new Error('Meeting not found');
    revalidatePath('/meetings');
    revalidatePath(`/meetings/${id}`);
    revalidatePath('/reserve-fund'); 
    return { success: true, meeting: updatedMeeting };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update meeting' };
  }
}

export async function deleteMeetingAction(id: string) {
  try {
    const success = await dbDeleteMeeting(id);
    if (!success) throw new Error('Failed to delete meeting or meeting not found');
    revalidatePath('/meetings');
    revalidatePath('/');
    revalidatePath('/reserve-fund');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete meeting' };
  }
}

// Expense Actions
export async function createExpenseAction(expenseData: Omit<Expense, 'id' | 'createdAt'>) {
  try {
    const newExpense = await dbAddExpense(expenseData);
    revalidatePath(`/meetings/${expenseData.meetingId}`);
    
    const meeting = await dbGetMeetingById(expenseData.meetingId);
    if (meeting && meeting.isSettled && meeting.useReserveFund) {
        revalidatePath('/reserve-fund');
    }
    return { success: true, expense: newExpense };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create expense' };
  }
}

export async function updateExpenseAction(id: string, updates: Partial<Expense>) {
  try {
    const updatedExpense = await dbUpdateExpense(id, updates);
    if (!updatedExpense) throw new Error('Expense not found');
    revalidatePath(`/meetings/${updatedExpense.meetingId}`);

    const meeting = await dbGetMeetingById(updatedExpense.meetingId);
     if (meeting && meeting.isSettled && meeting.useReserveFund) {
        revalidatePath('/reserve-fund');
    }
    return { success: true, expense: updatedExpense };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update expense' };
  }
}

export async function deleteExpenseAction(expenseId: string) {
  try {
    const expense = await getExpenseById(expenseId); 
    if (!expense) throw new Error('Expense not found for deletion');
    
    const success = await dbDeleteExpense(expenseId);
    if (!success) throw new Error('Failed to delete expense');
    
    revalidatePath(`/meetings/${expense.meetingId}`);
    const meeting = await dbGetMeetingById(expense.meetingId);
     if (meeting && meeting.isSettled && meeting.useReserveFund) {
        revalidatePath('/reserve-fund');
    }
    return { success: true };
  } catch (error) {
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
    return { success: false, error: error instanceof Error ? error.message : '회비 잔액 업데이트에 실패했습니다.' };
  }
}

export async function finalizeMeetingSettlementAction(meetingId: string) {
  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) throw new Error('Meeting not found.');

    if (!meeting.useReserveFund) {
      return { success: false, error: "This meeting is not set to use reserve fund." };
    }
    if (meeting.isSettled) {
      return { success: false, error: "Meeting settlement is already finalized." };
    }
    if (!meeting.partialReserveFundAmount || meeting.partialReserveFundAmount <= 0) {
      const settledMeetingNoFund = await dbUpdateMeeting(meetingId, { isSettled: true });
      revalidatePath(`/meetings/${meetingId}`);
      return { success: true, meeting: settledMeetingNoFund, message: "No reserve fund amount specified, marked as settled." };
    }

    const expenses = await dbGetExpensesByMeetingId(meetingId);
    if (expenses.length === 0) {
      // If there are no expenses, but partialReserveFundAmount was set, it's a bit ambiguous.
      // For now, let's assume no deduction if no expenses.
      const settledMeetingNoExpenses = await dbUpdateMeeting(meetingId, { isSettled: true });
      revalidatePath(`/meetings/${meetingId}`);
      return { success: true, meeting: settledMeetingNoExpenses, message: "No expenses to apply fund to, marked as settled." };
    }
    
    const currentReserveBalance = await getReserveFundBalance();
    const amountToDeductFromFund = Math.min(meeting.partialReserveFundAmount, currentReserveBalance);
    let message = `모임 (${meeting.name}) 정산 완료.`;

    if (amountToDeductFromFund > 0) {
      await dbRecordMeetingDeduction(meeting.id, meeting.name, amountToDeductFromFund, new Date(meeting.dateTime));
      message = `모임 (${meeting.name}) 정산 완료. 회비에서 ${amountToDeductFromFund.toLocaleString()}원 사용.`;
      if (amountToDeductFromFund < meeting.partialReserveFundAmount) {
        message += ` (회비 잔액 부족으로 부분 사용)`;
      }
    } else if (meeting.partialReserveFundAmount > 0 && currentReserveBalance <= 0) {
      message = `모임 (${meeting.name}) 정산: 회비 잔액 부족으로 설정된 금액을 사용할 수 없습니다.`;
    } else {
      message = `모임 (${meeting.name}) 정산: 설정된 회비 사용액이 없거나 0원입니다.`;
    }

    const updatedMeeting = await dbUpdateMeeting(meetingId, { isSettled: true });
    if (!updatedMeeting) throw new Error('Failed to mark meeting as settled.');

    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath('/reserve-fund');
    revalidatePath('/');
    return { success: true, meeting: updatedMeeting, message: message };

  } catch (error) {
    console.error("Finalize Meeting Settlement Error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to finalize meeting settlement' };
  }
}
