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
export async function createMeetingAction(meetingData: Omit<Meeting, 'id' | 'createdAt' | 'expenses'>) {
  try {
    const newMeeting = await dbAddMeeting(meetingData);
    revalidatePath('/meetings');
    revalidatePath('/'); // Dashboard might show recent meetings
    return { success: true, meeting: newMeeting };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create meeting' };
  }
}

export async function updateMeetingAction(id: string, updates: Partial<Omit<Meeting, 'expenses'>>) {
  try {
    const updatedMeeting = await dbUpdateMeeting(id, updates);
    if (!updatedMeeting) throw new Error('Meeting not found');
    revalidatePath('/meetings');
    revalidatePath(`/meetings/${id}`);
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
    return { success: true, expense: updatedExpense };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update expense' };
  }
}

export async function deleteExpenseAction(id: string, meetingId: string) {
  try {
    const success = await dbDeleteExpense(id);
    if (!success) throw new Error('Failed to delete expense or expense not found');
    revalidatePath(`/meetings/${meetingId}`);
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
    return { success: true, transaction: newTransaction };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to add reserve fund transaction' };
  }
}
