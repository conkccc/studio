
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
  arrayRemove,
  arrayUnion,
  increment
} from 'firebase/firestore';
import { db } from './firebase'; // Firestore 인스턴스
import type { Friend, Meeting, Expense, ReserveFundTransaction } from './types';

const FRIENDS_COLLECTION = 'friends';
const MEETINGS_COLLECTION = 'meetings';
const EXPENSES_SUBCOLLECTION = 'expenses'; // Subcollection for expenses under a meeting
const RESERVE_FUND_TRANSACTIONS_COLLECTION = 'reserveFundTransactions';
const RESERVE_FUND_BALANCE_DOC = 'reserveFundBalance'; // Document ID for balance

// Helper function to convert Firestore snapshot to data with ID
const dataFromSnapshot = <T>(snapshot: any): T | undefined => {
  if (!snapshot.exists()) return undefined;
  const data = snapshot.data();
  return {
    ...data,
    id: snapshot.id,
    // Convert Timestamps to Dates
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
    dateTime: data.dateTime instanceof Timestamp ? data.dateTime.toDate() : data.dateTime,
    endTime: data.endTime instanceof Timestamp ? data.endTime.toDate() : data.endTime,
    date: data.date instanceof Timestamp ? data.date.toDate() : data.date,
  } as T;
};

// Helper function to convert Firestore query snapshot to array of data with IDs
const arrayFromSnapshot = <T>(snapshot: any): T[] => {
  return snapshot.docs.map((doc: any) => dataFromSnapshot<T>(doc)).filter((item: T | undefined): item is T => item !== undefined);
};


// --- Friend functions ---
export const getFriends = async (): Promise<Friend[]> => {
  const friendsCollection = collection(db, FRIENDS_COLLECTION);
  const q = query(friendsCollection, orderBy('nickname', 'asc'));
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<Friend>(snapshot);
};

export const getFriendById = async (id: string): Promise<Friend | undefined> => {
  const friendDoc = doc(db, FRIENDS_COLLECTION, id);
  const snapshot = await getDoc(friendDoc);
  return dataFromSnapshot<Friend>(snapshot);
};

export const addFriend = async (nickname: string, name?: string): Promise<Friend> => {
  const newFriendData = {
    nickname,
    name: name || '',
    createdAt: Timestamp.now(),
  };
  const friendsCollection = collection(db, FRIENDS_COLLECTION);
  const docRef = await addDoc(friendsCollection, newFriendData);
  return { ...newFriendData, id: docRef.id, createdAt: newFriendData.createdAt.toDate() };
};

export const updateFriend = async (id: string, updates: Partial<Omit<Friend, 'id' | 'createdAt'>>): Promise<Friend | null> => {
  const friendDoc = doc(db, FRIENDS_COLLECTION, id);
  await updateDoc(friendDoc, updates);
  const updatedSnapshot = await getDoc(friendDoc);
  return dataFromSnapshot<Friend>(updatedSnapshot) || null;
};

export const deleteFriend = async (id: string): Promise<boolean> => {
  const batch = writeBatch(db);
  const friendDoc = doc(db, FRIENDS_COLLECTION, id);
  batch.delete(friendDoc);

  // Remove friend from participantIds and nonReserveFundParticipants in all meetings
  const meetingsCollection = collection(db, MEETINGS_COLLECTION);
  const meetingsSnapshot = await getDocs(meetingsCollection);
  meetingsSnapshot.forEach(meetingDocSnapshot => {
    const meetingData = meetingDocSnapshot.data() as Meeting;
    if (meetingData.participantIds.includes(id) || (meetingData.nonReserveFundParticipants && meetingData.nonReserveFundParticipants.includes(id))) {
      const meetingRef = doc(db, MEETINGS_COLLECTION, meetingDocSnapshot.id);
      const updates: Partial<Meeting> = {};
      if (meetingData.participantIds.includes(id)) {
        updates.participantIds = arrayRemove(id);
      }
      if (meetingData.nonReserveFundParticipants && meetingData.nonReserveFundParticipants.includes(id)) {
        updates.nonReserveFundParticipants = arrayRemove(id);
      }
      batch.update(meetingRef, updates);
    }
  });

  // Potentially remove from expenses (paidById, splitAmongIds, customSplits)
  // This can be complex. For now, we'll leave expenses as is, or handle this if it becomes a strict requirement.
  // Deleting a friend who paid for an expense or was part of a split might require recalculating settlements.

  await batch.commit();
  return true; // Assume success, or add error handling
};

// --- Meeting functions ---
export const getMeetings = async (): Promise<Meeting[]> => {
  const meetingsCollection = collection(db, MEETINGS_COLLECTION);
  const q = query(meetingsCollection, orderBy('dateTime', 'desc'));
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<Meeting>(snapshot);
};

export const getMeetingById = async (id: string): Promise<Meeting | undefined> => {
  if (!id) return undefined;
  const meetingDoc = doc(db, MEETINGS_COLLECTION, id);
  const snapshot = await getDoc(meetingDoc);
  return dataFromSnapshot<Meeting>(snapshot);
};

export const addMeeting = async (meetingData: Omit<Meeting, 'id' | 'createdAt' | 'isSettled'>): Promise<Meeting> => {
  const newMeetingData = {
    ...meetingData,
    dateTime: Timestamp.fromDate(new Date(meetingData.dateTime)),
    endTime: meetingData.endTime ? Timestamp.fromDate(new Date(meetingData.endTime)) : undefined,
    createdAt: Timestamp.now(),
    isSettled: false,
  };
  const meetingsCollection = collection(db, MEETINGS_COLLECTION);
  const docRef = await addDoc(meetingsCollection, newMeetingData);
  return {
    ...newMeetingData,
    id: docRef.id,
    dateTime: newMeetingData.dateTime.toDate(),
    endTime: newMeetingData.endTime?.toDate(),
    createdAt: newMeetingData.createdAt.toDate(),
  } as Meeting;
};

export const updateMeeting = async (id: string, updates: Partial<Omit<Meeting, 'id'>>): Promise<Meeting | null> => {
  const meetingDoc = doc(db, MEETINGS_COLLECTION, id);
  const updateData: { [key: string]: any } = { ...updates };

  if (updates.dateTime) {
    updateData.dateTime = Timestamp.fromDate(new Date(updates.dateTime));
  }
  if (updates.hasOwnProperty('endTime')) { // Allows setting endTime to undefined
    updateData.endTime = updates.endTime ? Timestamp.fromDate(new Date(updates.endTime)) : null;
  }
  
  await updateDoc(meetingDoc, updateData);
  const updatedSnapshot = await getDoc(meetingDoc);
  return dataFromSnapshot<Meeting>(updatedSnapshot) || null;
};

export const deleteMeeting = async (id: string): Promise<boolean> => {
  const batch = writeBatch(db);

  // Delete all expenses for this meeting
  const expensesCollectionRef = collection(db, MEETINGS_COLLECTION, id, EXPENSES_SUBCOLLECTION);
  const expensesSnapshot = await getDocs(expensesCollectionRef);
  expensesSnapshot.forEach(expenseDoc => {
    batch.delete(expenseDoc.ref);
  });

  // Delete the meeting itself
  const meetingDoc = doc(db, MEETINGS_COLLECTION, id);
  batch.delete(meetingDoc);

  // Revert any reserve fund transaction associated with this meeting
  const reserveFundTransactionsRef = collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION);
  const q = query(reserveFundTransactionsRef, where('meetingId', '==', id), where('type', '==', 'meeting_deduction'));
  const fundTxSnapshot = await getDocs(q);
  
  let totalRevertedAmount = 0;
  fundTxSnapshot.forEach(txDoc => {
    const txData = txDoc.data() as ReserveFundTransaction;
    totalRevertedAmount += Math.abs(txData.amount); // amount is negative for deduction
    batch.delete(txDoc.ref);
  });

  if (totalRevertedAmount > 0) {
    const balanceDocRef = doc(db, RESERVE_FUND_TRANSACTIONS_COLLECTION, RESERVE_FUND_BALANCE_DOC);
    batch.update(balanceDocRef, { balance: increment(totalRevertedAmount) });
  }
  
  await batch.commit();
  return true;
};

// --- Expense functions ---
export const getExpensesByMeetingId = async (meetingId: string): Promise<Expense[]> => {
  const expensesCollectionRef = collection(db, MEETINGS_COLLECTION, meetingId, EXPENSES_SUBCOLLECTION);
  const q = query(expensesCollectionRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<Expense>(snapshot);
};

export const getExpenseById = async (meetingId: string, expenseId: string): Promise<Expense | undefined> => {
  if (!meetingId || !expenseId) return undefined;
  const expenseDoc = doc(db, MEETINGS_COLLECTION, meetingId, EXPENSES_SUBCOLLECTION, expenseId);
  const snapshot = await getDoc(expenseDoc);
  return dataFromSnapshot<Expense>(snapshot);
};

export const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> => {
  const newExpenseData = {
    ...expenseData,
    createdAt: Timestamp.now(),
  };
  const expensesCollectionRef = collection(db, MEETINGS_COLLECTION, expenseData.meetingId, EXPENSES_SUBCOLLECTION);
  const docRef = await addDoc(expensesCollectionRef, newExpenseData);
  
  // If meeting was settled, unsettle it as new expense changes calculation
  const meeting = await getMeetingById(expenseData.meetingId);
  if (meeting?.isSettled) {
    await updateMeeting(expenseData.meetingId, { isSettled: false });
    // If it was using reserve fund, we might need to revert the fund transaction here
    // This is handled more generically if `finalizeMeetingSettlementAction` is re-run
  }

  return { ...newExpenseData, id: docRef.id, createdAt: newExpenseData.createdAt.toDate() } as Expense;
};

export const updateExpense = async (meetingId: string, expenseId: string, updates: Partial<Omit<Expense, 'id' | 'createdAt' | 'meetingId'>>): Promise<Expense | null> => {
  const expenseDoc = doc(db, MEETINGS_COLLECTION, meetingId, EXPENSES_SUBCOLLECTION, expenseId);
  await updateDoc(expenseDoc, updates);
  
  const meeting = await getMeetingById(meetingId);
  if (meeting?.isSettled) {
    await updateMeeting(meetingId, { isSettled: false });
  }

  const updatedSnapshot = await getDoc(expenseDoc);
  return dataFromSnapshot<Expense>(updatedSnapshot) || null;
};

export const deleteExpense = async (meetingId: string, expenseId: string): Promise<boolean> => {
  const expenseDoc = doc(db, MEETINGS_COLLECTION, meetingId, EXPENSES_SUBCOLLECTION, expenseId);
  await deleteDoc(expenseDoc);

  const meeting = await getMeetingById(meetingId);
  if (meeting?.isSettled) {
    await updateMeeting(meetingId, { isSettled: false });
  }
  return true;
};


// --- Reserve Fund Functions ---
export const getReserveFundBalance = async (): Promise<number> => {
  const balanceDocRef = doc(db, RESERVE_FUND_TRANSACTIONS_COLLECTION, RESERVE_FUND_BALANCE_DOC);
  const balanceSnap = await getDoc(balanceDocRef);
  if (balanceSnap.exists()) {
    return balanceSnap.data().balance || 0;
  }
  // Initialize if doesn't exist
  await updateDoc(balanceDocRef, { balance: 0 }, { merge: true });
  return 0;
};

export const getLoggedReserveFundTransactions = async (): Promise<ReserveFundTransaction[]> => {
  const transactionsCollectionRef = collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION);
  // Exclude the balance document itself from transaction logs
  const q = query(transactionsCollectionRef, where('__name__', '!=', RESERVE_FUND_BALANCE_DOC), orderBy('date', 'desc'));
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<ReserveFundTransaction>(snapshot);
};

// For setting balance manually
export const setReserveFundBalance = async (newBalance: number, description: string): Promise<void> => {
  const batch = writeBatch(db);
  const balanceDocRef = doc(db, RESERVE_FUND_TRANSACTIONS_COLLECTION, RESERVE_FUND_BALANCE_DOC);
  const oldBalance = await getReserveFundBalance(); // Get current balance before setting
  
  batch.set(balanceDocRef, { balance: newBalance }, { merge: true });

  const logEntry: Omit<ReserveFundTransaction, 'id'> = {
    type: 'balance_update',
    amount: newBalance, // For 'balance_update', this IS the new balance.
    description: description || `잔액 ${oldBalance.toLocaleString()}원에서 ${newBalance.toLocaleString()}원으로 설정됨`,
    date: Timestamp.now(),
  };
  const transactionsLogRef = collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION);
  batch.set(doc(transactionsLogRef), logEntry); // Create a new doc for log

  await batch.commit();
};


export const recordMeetingDeduction = async (meetingId: string, meetingName: string, amountDeducted: number, date: Date): Promise<void> => {
  if (amountDeducted <= 0) return;

  const batch = writeBatch(db);
  const balanceDocRef = doc(db, RESERVE_FUND_TRANSACTIONS_COLLECTION, RESERVE_FUND_BALANCE_DOC);
  
  // Ensure balance document exists before trying to increment
  const balanceSnap = await getDoc(balanceDocRef);
  if (!balanceSnap.exists()) {
    batch.set(balanceDocRef, { balance: 0 }); // Initialize if not exists
  }
  batch.update(balanceDocRef, { balance: increment(-amountDeducted) });


  const logEntry: Omit<ReserveFundTransaction, 'id'> = {
    type: 'meeting_deduction',
    amount: -amountDeducted, // Store as negative
    description: `모임 (${meetingName}) 회비 사용`,
    date: Timestamp.fromDate(new Date(date)),
    meetingId: meetingId,
  };
  const transactionsLogRef = collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION);
  batch.set(doc(transactionsLogRef), logEntry);

  await batch.commit();
};


export const revertMeetingDeduction = async (meetingId: string): Promise<void> => {
  const batch = writeBatch(db);
  const transactionsCollectionRef = collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION);
  const q = query(transactionsCollectionRef, where('meetingId', '==', meetingId), where('type', '==', 'meeting_deduction'));
  
  const snapshot = await getDocs(q);
  let totalRevertedAmount = 0;

  snapshot.forEach(txDoc => {
    const txData = txDoc.data() as ReserveFundTransaction;
    totalRevertedAmount += Math.abs(txData.amount); // amount is negative
    batch.delete(txDoc.ref); // Delete the log entry
  });

  if (totalRevertedAmount > 0) {
    const balanceDocRef = doc(db, RESERVE_FUND_TRANSACTIONS_COLLECTION, RESERVE_FUND_BALANCE_DOC);
    // Ensure balance document exists before trying to increment
    const balanceSnap = await getDoc(balanceDocRef);
    if (!balanceSnap.exists()) {
      batch.set(balanceDocRef, { balance: 0 }); // Initialize if not exists
    }
    batch.update(balanceDocRef, { balance: increment(totalRevertedAmount) }); // Add back the amount
  }
  
  await batch.commit();
};

// --- Utility for AI analysis ---
export const getSpendingDataForMeeting = async (meetingId: string): Promise<string> => {
  const meeting = await getMeetingById(meetingId);
  if (!meeting) return "Meeting not found.";

  const meetingExpenses = await getExpensesByMeetingId(meetingId);
  if (meetingExpenses.length === 0) return `No expenses recorded for meeting: ${meeting.name}.`;

  let spendingDetails = `Meeting: ${meeting.name} on ${new Date(meeting.dateTime).toLocaleDateString()}\nLocation: ${meeting.locationName}\nParticipants: ${meeting.participantIds.length}\n\nExpenses:\n`;

  for (const expense of meetingExpenses) {
    const payer = await getFriendById(expense.paidById);
    spendingDetails += `- Description: ${expense.description}\n`;
    spendingDetails += `  Amount: ${expense.totalAmount.toLocaleString()} KRW\n`;
    spendingDetails += `  Paid by: ${payer?.nickname || 'Unknown'}\n`;
    spendingDetails += `  Split: ${expense.splitType}\n`;
    if (expense.splitType === 'equally' && expense.splitAmongIds) {
      const splitAmongFriendsPromises = expense.splitAmongIds.map(id => getFriendById(id));
      const splitAmongFriends = await Promise.all(splitAmongFriendsPromises);
      spendingDetails += `  Among: ${splitAmongFriends.map(f => f?.nickname).filter(Boolean).join(', ')}\n`;
    } else if (expense.splitType === 'custom' && expense.customSplits) {
      const customSplitDetailsPromises = expense.customSplits.map(async (split) => {
        const friend = await getFriendById(split.friendId);
        return `${friend?.nickname || 'Unknown'}: ${split.amount.toLocaleString()} KRW`;
      });
      const customSplitDetails = await Promise.all(customSplitDetailsPromises);
      spendingDetails += `  Custom Split: ${customSplitDetails.join('; ')}\n`;
    }
    spendingDetails += "\n";
  }
  return spendingDetails;
};

export const getAllSpendingDataForYear = async (year: number): Promise<string> => {
  const allMeetings = await getMeetings(); 
  const yearMeetings = allMeetings.filter(m => new Date(m.dateTime).getFullYear() === year);
  if (yearMeetings.length === 0) return `No meetings found for the year ${year}.`;

  let allSpendingDetails = `Spending data for the year ${year}:\n\n`;
  for (const meeting of yearMeetings) {
    allSpendingDetails += await getSpendingDataForMeeting(meeting.id) + "\n---\n";
  }
  return allSpendingDetails;
};

// Used by MeetingDetailsClient
export const getMeetingExpenses = async (meetingId: string): Promise<Expense[]> => {
    return getExpensesByMeetingId(meetingId);
}
