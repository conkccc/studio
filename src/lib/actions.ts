
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
  deleteExpense as dbDeleteExpense, // Signature will change: deleteExpense(meetingId, expenseId)
  addReserveFundTransaction as dbAddReserveFundTransaction,
  getFriendById,
  getMeetingById as dbGetMeetingById,
  getExpensesByMeetingId as dbGetExpensesByMeetingId,
  getFriends as dbGetFriends,
  getReserveFundTransactions,
  getReserveFundBalance, // Added for finalizeMeetingSettlementAction
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
    // Consider revalidating specific meeting pages if friend participated
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
    // Revalidate all meeting detail pages if friend could have been a participant.
    // This is broad, but safer than trying to find all specific meetings.
    // For a production app, a more targeted revalidation might be needed.
    // revalidatePath('/meetings/[meetingId]', 'page'); // This syntax might be tricky for dynamic paths
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
    revalidatePath(`/meetings/${newMeeting.id}`); // Revalidate the new meeting's page
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
    revalidatePath('/reserve-fund'); // if fund usage changed
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
    const payerExists = await getFriendById(expenseData.paidById);
    if (!payerExists) {
      throw new Error('Payer (friend) does not exist.');
    }

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
    revalidatePath('/reserve-fund');
    return { success: true, expense: newExpense };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create expense' };
  }
}

export async function updateExpenseAction(id: string, updates: Partial<Expense>) {
  try {
    // Firestore update for subcollection needs meetingId.
    // The current signature doesn't provide it directly. Assuming updates contains meetingId.
    if (!updates.meetingId) {
        // This is a fallback, ideally the caller should provide meetingId
        // Or we need to change the function signature or find the expense first to get its meetingId
        // For now, let's assume it will fail if meetingId isn't in updates.
        // This part of the code needs a more robust way to get the original meetingId if not in updates.
        // For a prototype, we might require `updates.meetingId` to be present.
        throw new Error("meetingId is required in updates to update an expense in a subcollection.");
    }
    const updatedExpense = await dbUpdateExpense(id, updates); // dbUpdateExpense must handle subcollection logic
    if (!updatedExpense) throw new Error('Expense not found or meetingId missing in updates');
    revalidatePath(`/meetings/${updatedExpense.meetingId}`);
    revalidatePath('/reserve-fund');
    return { success: true, expense: updatedExpense };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update expense' };
  }
}

// Signature changed to include meetingId
export async function deleteExpenseAction(meetingId: string, expenseId: string) {
  try {
    const success = await dbDeleteExpense(meetingId, expenseId);
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
    revalidatePath('/');
    if (newTransaction.meetingId) {
      revalidatePath(`/meetings/${newTransaction.meetingId}`);
    }
    return { success: true, transaction: newTransaction };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to add reserve fund transaction' };
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
      // If no expenses, mark as settled without fund transaction
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

    let actualFundUsedForThisMeeting = 0;
    let transactionDescription = `모임 (${meeting.name}) 회비 전체 정산 사용`;

    if (calculatedFundToUse > 0) {
      const currentReserveBalance = await getReserveFundBalance();
      if (currentReserveBalance <= 0) {
        actualFundUsedForThisMeeting = 0;
        transactionDescription = `모임 (${meeting.name}) 정산: 회비 잔액 부족으로 사용 불가`;
      } else {
        actualFundUsedForThisMeeting = Math.min(calculatedFundToUse, currentReserveBalance);
        if (actualFundUsedForThisMeeting < calculatedFundToUse) {
            transactionDescription = `모임 (${meeting.name}) 회비 전체 정산 사용 (잔액 부족으로 부분 사용: ${actualFundUsedForThisMeeting.toLocaleString()}원)`;
        }
      }

      if (actualFundUsedForThisMeeting > 0) {
        // Check for existing 'all' type transaction to prevent duplicates
        const existingTransactions = await getReserveFundTransactions(); // Fetches all, then filters
        const duplicateTx = existingTransactions.find(
            tx => tx.meetingId === meetingId && 
                  tx.type === 'meeting_contribution' &&
                  tx.description.includes("전체 정산") // Heuristic for 'all' type
        );

        if (!duplicateTx) {
          await dbAddReserveFundTransaction({
            type: 'meeting_contribution',
            amount: -actualFundUsedForThisMeeting,
            description: transactionDescription,
            date: new Date(meeting.dateTime),
            meetingId: meetingId,
          });
        } else {
           console.warn("Settlement for this 'all' type meeting might have already been recorded.", duplicateTx);
           // Optionally, update the existing transaction if amount differs significantly, or just rely on it.
           // For now, we assume if one exists, it's handled.
        }
      }
    }

    const updatedMeeting = await dbUpdateMeeting(meetingId, { isSettled: true });
    if (!updatedMeeting) throw new Error('Failed to mark meeting as settled.');

    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath('/reserve-fund');
    revalidatePath('/');
    return { success: true, meeting: updatedMeeting, message: transactionDescription };

  } catch (error) {
    console.error("Finalize Meeting Settlement Error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to finalize meeting settlement' };
  }
}
