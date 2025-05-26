
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
  // Reserve fund specific:
  getReserveFundBalance,
  setReserveFundBalance as dbSetReserveFundBalance,
  recordMeetingDeduction as dbRecordMeetingDeduction,
  revertMeetingDeduction as dbRevertMeetingDeduction,
  getLoggedReserveFundTransactions,

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

export async function updateFriendAction(id: string, updates: Partial<Omit<Friend, 'id'>>) {
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
    if (newMeeting.useReserveFund && newMeeting.reserveFundUsageType === 'partial' && (newMeeting.partialReserveFundAmount || 0) > 0) {
      revalidatePath('/reserve-fund');
    }
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
    // Validation already done in data-store or should be there
    const newExpense = await dbAddExpense(expenseData);
    revalidatePath(`/meetings/${expenseData.meetingId}`);
    
    const meeting = await dbGetMeetingById(expenseData.meetingId);
    if (meeting && meeting.isSettled && meeting.reserveFundUsageType === 'all') {
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
     if (meeting && meeting.isSettled && meeting.reserveFundUsageType === 'all') {
        revalidatePath('/reserve-fund');
    }
    return { success: true, expense: updatedExpense };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update expense' };
  }
}

export async function deleteExpenseAction(expenseId: string) {
  try {
    const expense = await getExpenseById(expenseId); // Get expense to find its meetingId for revalidation
    if (!expense) throw new Error('Expense not found for deletion');
    
    const success = await dbDeleteExpense(expenseId);
    if (!success) throw new Error('Failed to delete expense');
    
    revalidatePath(`/meetings/${expense.meetingId}`);
    const meeting = await dbGetMeetingById(expense.meetingId);
     if (meeting && meeting.isSettled && meeting.reserveFundUsageType === 'all') {
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
    revalidatePath('/'); // Balance might be shown on dashboard
    return { success: true, newBalance };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '회비 잔액 업데이트에 실패했습니다.' };
  }
}

export async function finalizeMeetingSettlementAction(meetingId: string) {
  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) throw new Error('Meeting not found.');
    if (!meeting.useReserveFund || meeting.reserveFundUsageType !== 'all') {
      return { success: false, error: "Meeting is not set to use reserve fund with 'all' type." };
    }
    if (meeting.isSettled) {
      return { success: false, error: "Meeting settlement is already finalized." };
    }

    const expenses = await dbGetExpensesByMeetingId(meetingId);
    if (expenses.length === 0) {
      const settledMeeting = await dbUpdateMeeting(meetingId, { isSettled: true });
      revalidatePath(`/meetings/${meetingId}`);
      return { success: true, meeting: settledMeeting, message: "No expenses to settle, marked as settled." };
    }

    const allFriends = await dbGetFriends();
    const participants = allFriends.filter(f => meeting.participantIds.includes(f.id));
    
    const participantIdsInMeeting = new Set(participants.map(p => p.id));
    const initialPaymentLedger: Record<string, number> = {};
    participants.forEach(p => { initialPaymentLedger[p.id] = 0; });

    expenses.forEach(expense => {
      if (participantIdsInMeeting.has(expense.paidById)) {
         initialPaymentLedger[expense.paidById] = (initialPaymentLedger[expense.paidById] || 0) + expense.totalAmount;
      }
      if (expense.splitType === 'equally' && expense.splitAmongIds && expense.splitAmongIds.length > 0) {
        const share = expense.totalAmount / expense.splitAmongIds.length;
        expense.splitAmongIds.forEach(friendId => {
          if (participantIdsInMeeting.has(friendId)) {
            initialPaymentLedger[friendId] = (initialPaymentLedger[friendId] || 0) - share;
          }
        });
      } else if (expense.splitType === 'custom' && expense.customSplits) {
        expense.customSplits.forEach(split => {
          if (participantIdsInMeeting.has(split.friendId)) {
            initialPaymentLedger[split.friendId] = (initialPaymentLedger[split.friendId] || 0) - split.amount;
          }
        });
      }
    });

    const benefitingParticipantIds = new Set(
      participants
        .map(p => p.id)
        .filter(id => !meeting.nonReserveFundParticipants.includes(id))
    );

    let calculatedFundToUse = 0;
    benefitingParticipantIds.forEach(id => {
      if (initialPaymentLedger[id] < 0) { 
        calculatedFundToUse -= initialPaymentLedger[id]; 
      }
    });
    
    calculatedFundToUse = parseFloat(calculatedFundToUse.toFixed(2));
    let message = `모임 (${meeting.name}) 정산 완료.`;

    if (calculatedFundToUse > 0) {
      const currentReserveBalance = await getReserveFundBalance();
      const amountToDeductFromFund = Math.min(calculatedFundToUse, currentReserveBalance);

      if (amountToDeductFromFund > 0) {
        await dbRecordMeetingDeduction(meeting.id, meeting.name, amountToDeductFromFund, new Date(meeting.dateTime));
        message = `모임 (${meeting.name}) 정산 완료. 회비에서 ${amountToDeductFromFund.toLocaleString()}원 사용.`;
        if (amountToDeductFromFund < calculatedFundToUse) {
          message += ` (잔액 부족으로 부분 사용)`;
        }
      } else if (currentReserveBalance <=0) {
        message = `모임 (${meeting.name}) 정산: 회비 잔액 부족으로 사용 불가.`;
      } else {
         message = `모임 (${meeting.name}) 정산: 회비 사용 대상자의 부담금이 없어 회비가 사용되지 않았습니다.`;
      }
    } else {
        message = `모임 (${meeting.name}) 정산: 회비 사용 대상자의 부담금이 없어 회비가 사용되지 않았습니다.`;
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
