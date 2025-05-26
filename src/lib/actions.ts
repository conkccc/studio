
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
  addReserveFundTransaction as dbAddReserveFundTransaction,
  getFriendById,
  getMeetingById as dbGetMeetingById, // Renamed to avoid conflict
  getExpensesByMeetingId as dbGetExpensesByMeetingId,
  getFriends as dbGetFriends,
  getReserveFundTransactions,
} from './data-store';
import type { Friend, Meeting, Expense, ReserveFundTransaction } from './types';

// Friend Actions
export async function createFriendAction(nickname: string, name?: string) {
  try {
    const newFriend = await dbAddFriend(nickname, name);
    revalidatePath('/friends');
    revalidatePath('/meetings/new'); // For participant lists
    return { success: true, friend: newFriend };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create friend' };
  }
}

export async function updateFriendAction(id: string, updates: Partial<Friend>) {
  try {
    const updatedFriend = await dbUpdateFriend(id, updates);
    if (!updatedFriend) throw new Error('Friend not found');
    revalidatePath('/friends');
    revalidatePath(`/meetings`); // Friend names might appear in meeting participant lists
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
    revalidatePath('/'); // Dashboard might show recent meetings
    return { success: true, meeting: newMeeting };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create meeting' };
  }
}

export async function updateMeetingAction(id: string, updates: Partial<Omit<Meeting, 'isSettled'>>) {
  try {
    // isSettled should be updated via finalizeMeetingSettlementAction or if an expense is added/modified/deleted
    const { isSettled, ...otherUpdates } = updates as Partial<Meeting>; 
    const updatedMeeting = await dbUpdateMeeting(id, otherUpdates);
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
    // Validate paidById is a valid friend
    const payerExists = await getFriendById(expenseData.paidById);
    if (!payerExists) {
      throw new Error('Payer (friend) does not exist.');
    }

    // Validate participants exist if splitType is 'equally' or 'custom'
    if (expenseData.splitType === 'equally' && expenseData.splitAmongIds) {
      for (const friendId of expenseData.splitAmongIds) {
        if (!(await getFriendById(friendId))) {
          throw new Error(`Participant friend with ID ${friendId} does not exist.`);
        }
      }
    } else if (expenseData.splitType === 'custom' && expenseData.customSplits) {
       for (const split of expenseData.customSplits) {
        if (!(await getFriendById(split.friendId))) {
          throw new Error(`Participant friend with ID ${split.friendId} in custom split does not exist.`);
        }
      }
    }


    const newExpense = await dbAddExpense(expenseData);
    revalidatePath(`/meetings/${expenseData.meetingId}`);
    revalidatePath('/reserve-fund'); // Expenses can affect 'all' type settlement
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
    revalidatePath('/reserve-fund');
    return { success: true, expense: updatedExpense };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update expense' };
  }
}

export async function deleteExpenseAction(id: string, meetingId: string) {
  try {
    const success = await dbDeleteExpense(id, meetingId); // Pass meetingId to data-store
    if (!success) throw new Error('Failed to delete expense or expense not found');
    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath('/reserve-fund');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete expense' };
  }
}

// Reserve Fund Actions
export async function addReserveTransactionAction(transactionData: Omit<ReserveFundTransaction, 'id'>) {
  try {
    const newTransaction = await dbAddReserveFundTransaction(transactionData);
    revalidatePath('/reserve-fund');
    revalidatePath('/'); // Dashboard might show balance
    // If it's a meeting contribution, also revalidate that meeting page for settlement status.
    if (newTransaction.meetingId) {
      revalidatePath(`/meetings/${newTransaction.meetingId}`);
    }
    return { success: true, transaction: newTransaction };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to add reserve fund transaction' };
  }
}

// Finalize Meeting Settlement for 'all' type fund usage
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

    let actualFundUsedForThisMeeting = 0;
    benefitingParticipantIds.forEach(id => {
      if (initialPaymentLedger[id] < 0) { // If this benefiting participant owes money
        actualFundUsedForThisMeeting -= initialPaymentLedger[id]; // Add their debt (as a positive value) to fund usage
      }
    });
    
    actualFundUsedForThisMeeting = parseFloat(actualFundUsedForThisMeeting.toFixed(2)); // Sanitize potential floating point issues

    if (actualFundUsedForThisMeeting > 0) {
      // Check if a similar 'all' type transaction already exists to prevent duplicates
      const existingTransactions = await getReserveFundTransactions();
      const duplicateTx = existingTransactions.find(
          tx => tx.meetingId === meetingId && 
                tx.type === 'meeting_contribution' &&
                tx.description.includes("전체 정산") && // A way to identify 'all' type contributions
                Math.abs(tx.amount - actualFundUsedForThisMeeting) < 0.01 // Allow for small float diff
      );

      if (!duplicateTx) {
        await dbAddReserveFundTransaction({
          type: 'meeting_contribution',
          amount: -actualFundUsedForThisMeeting, // Negative as it's a withdrawal from fund
          description: `모임 (${meeting.name}) 회비 전체 정산 사용`,
          date: new Date(meeting.dateTime), // Use meeting date for transaction
          meetingId: meetingId,
        });
      }
    }

    const updatedMeeting = await dbUpdateMeeting(meetingId, { isSettled: true });
    if (!updatedMeeting) throw new Error('Failed to mark meeting as settled.');

    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath('/reserve-fund');
    revalidatePath('/');
    return { success: true, meeting: updatedMeeting };

  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to finalize meeting settlement' };
  }
}

    