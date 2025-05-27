
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
  increment,
  setDoc // For setting doc with specific ID
} from 'firebase/firestore';
import { db } from './firebase'; 
import type { Friend, Meeting, Expense, ReserveFundTransaction } from './types';

const FRIENDS_COLLECTION = 'friends';
const MEETINGS_COLLECTION = 'meetings';
const EXPENSES_SUBCOLLECTION = 'expenses'; 
const RESERVE_FUND_TRANSACTIONS_COLLECTION = 'reserveFundTransactions';
const RESERVE_FUND_CONFIG_DOC_ID = 'config'; // Using a specific ID for the balance document

// Helper function to convert Firestore snapshot to data with ID
const dataFromSnapshot = <T extends { id: string }>(snapshot: any): T | undefined => {
  if (!snapshot.exists()) return undefined;
  const data = snapshot.data();
  // Ensure all known date fields are converted
  const convertTimestampToDate = (field: any) => {
    if (field instanceof Timestamp) {
      return field.toDate();
    }
    return field;
  };

  return {
    ...data,
    id: snapshot.id,
    createdAt: data.createdAt ? convertTimestampToDate(data.createdAt) : undefined,
    dateTime: data.dateTime ? convertTimestampToDate(data.dateTime) : undefined,
    endTime: data.endTime ? convertTimestampToDate(data.endTime) : undefined,
    date: data.date ? convertTimestampToDate(data.date) : undefined,
  } as T;
};

// Helper function to convert Firestore query snapshot to array of data with IDs
const arrayFromSnapshot = <T extends { id: string }>(snapshot: any): T[] => {
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
  if (!id) return undefined;
  const friendDocRef = doc(db, FRIENDS_COLLECTION, id);
  const snapshot = await getDoc(friendDocRef);
  return dataFromSnapshot<Friend>(snapshot);
};

export const addFriend = async (nickname: string, name?: string): Promise<Friend> => {
  const newFriendData = {
    nickname,
    name: name || '',
    createdAt: Timestamp.now(),
  };
  const friendsCollectionRef = collection(db, FRIENDS_COLLECTION);
  const docRef = await addDoc(friendsCollectionRef, newFriendData);
  const createdDate = (newFriendData.createdAt as Timestamp).toDate();
  return { ...newFriendData, id: docRef.id, createdAt: createdDate };
};

export const updateFriend = async (id: string, updates: Partial<Omit<Friend, 'id' | 'createdAt'>>): Promise<Friend | null> => {
  const friendDocRef = doc(db, FRIENDS_COLLECTION, id);
  await updateDoc(friendDocRef, updates);
  const updatedSnapshot = await getDoc(friendDocRef);
  return dataFromSnapshot<Friend>(updatedSnapshot) || null;
};

export const deleteFriend = async (id: string): Promise<void> => {
  const batch = writeBatch(db);
  const friendDocRef = doc(db, FRIENDS_COLLECTION, id);
  batch.delete(friendDocRef);

  const meetingsCollectionRef = collection(db, MEETINGS_COLLECTION);
  
  // Query for meetings where the friend is in participantIds
  const participantQuery = query(meetingsCollectionRef, where('participantIds', 'array-contains', id));
  const participantSnapshot = await getDocs(participantQuery);
  participantSnapshot.forEach(meetingDocSnapshot => {
    batch.update(meetingDocSnapshot.ref, { participantIds: arrayRemove(id) });
  });

  // Query for meetings where the friend is in nonReserveFundParticipants
  const nonReserveQuery = query(meetingsCollectionRef, where('nonReserveFundParticipants', 'array-contains', id));
  const nonReserveSnapshot = await getDocs(nonReserveQuery);
  nonReserveSnapshot.forEach(meetingDocSnapshot => {
    batch.update(meetingDocSnapshot.ref, { nonReserveFundParticipants: arrayRemove(id) });
  });
  
  // TODO: Consider implications if the deleted friend paid for an expense or was part of a custom split.
  // This might require more complex logic to re-calculate settlements or archive data.

  await batch.commit();
};

// --- Meeting functions ---
export const getMeetings = async (): Promise<Meeting[]> => {
  const meetingsCollectionRef = collection(db, MEETINGS_COLLECTION);
  const q = query(meetingsCollectionRef, orderBy('dateTime', 'desc'));
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<Meeting>(snapshot);
};

export const getMeetingById = async (id: string): Promise<Meeting | undefined> => {
  if (!id) return undefined;
  const meetingDocRef = doc(db, MEETINGS_COLLECTION, id);
  const snapshot = await getDoc(meetingDocRef);
  return dataFromSnapshot<Meeting>(snapshot);
};

export const addMeeting = async (meetingData: Omit<Meeting, 'id' | 'createdAt' | 'isSettled'>): Promise<Meeting> => {
  const newMeetingData = {
    ...meetingData,
    dateTime: Timestamp.fromDate(new Date(meetingData.dateTime)),
    endTime: meetingData.endTime ? Timestamp.fromDate(new Date(meetingData.endTime)) : null, // Store null if undefined
    createdAt: Timestamp.now(),
    isSettled: false, // Default to not settled
    // Ensure nonReserveFundParticipants is an array, even if empty
    nonReserveFundParticipants: meetingData.nonReserveFundParticipants || [], 
  };
  const meetingsCollectionRef = collection(db, MEETINGS_COLLECTION);
  const docRef = await addDoc(meetingsCollectionRef, newMeetingData);
  
  const createdDate = (newMeetingData.createdAt as Timestamp).toDate();
  const dateTime = (newMeetingData.dateTime as Timestamp).toDate();
  const endTime = newMeetingData.endTime ? (newMeetingData.endTime as Timestamp).toDate() : undefined;

  return { ...newMeetingData, id: docRef.id, createdAt: createdDate, dateTime, endTime } as Meeting;
};

export const updateMeeting = async (id: string, updates: Partial<Omit<Meeting, 'id'>>): Promise<Meeting | null> => {
  const meetingDocRef = doc(db, MEETINGS_COLLECTION, id);
  const updateData: { [key: string]: any } = { ...updates };

  if (updates.dateTime) {
    updateData.dateTime = Timestamp.fromDate(new Date(updates.dateTime));
  }
  if (updates.hasOwnProperty('endTime')) { 
    updateData.endTime = updates.endTime ? Timestamp.fromDate(new Date(updates.endTime)) : null;
  }
   // Ensure nonReserveFundParticipants is always an array
  if (updates.hasOwnProperty('nonReserveFundParticipants') && !Array.isArray(updates.nonReserveFundParticipants)) {
    updateData.nonReserveFundParticipants = [];
  }


  await updateDoc(meetingDocRef, updateData);
  const updatedSnapshot = await getDoc(meetingDocRef);
  return dataFromSnapshot<Meeting>(updatedSnapshot) || null;
};

export const deleteMeeting = async (id: string): Promise<void> => {
  const batch = writeBatch(db);
  const meetingDocRef = doc(db, MEETINGS_COLLECTION, id);

  // Delete all expenses for this meeting
  const expensesCollectionRef = collection(db, MEETINGS_COLLECTION, id, EXPENSES_SUBCOLLECTION);
  const expensesSnapshot = await getDocs(expensesCollectionRef);
  expensesSnapshot.forEach(expenseDoc => {
    batch.delete(expenseDoc.ref);
  });

  batch.delete(meetingDocRef); // Delete the meeting itself

  // Revert any reserve fund transaction associated with this meeting
  await revertMeetingDeduction(id, batch); // Pass batch to use in transaction
  
  await batch.commit();
};

// --- Expense functions ---
export const getExpensesByMeetingId = async (meetingId: string): Promise<Expense[]> => {
  if (!meetingId) return [];
  const expensesCollectionRef = collection(db, MEETINGS_COLLECTION, meetingId, EXPENSES_SUBCOLLECTION);
  const q = query(expensesCollectionRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<Expense>(snapshot);
};

export const getExpenseById = async (meetingId: string, expenseId: string): Promise<Expense | undefined> => {
  if (!meetingId || !expenseId) return undefined;
  const expenseDocRef = doc(db, MEETINGS_COLLECTION, meetingId, EXPENSES_SUBCOLLECTION, expenseId);
  const snapshot = await getDoc(expenseDocRef);
  return dataFromSnapshot<Expense>(snapshot);
};

export const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> => {
  const newExpenseData = {
    ...expenseData,
    createdAt: Timestamp.now(),
  };
  const expensesCollectionRef = collection(db, MEETINGS_COLLECTION, expenseData.meetingId, EXPENSES_SUBCOLLECTION);
  const docRef = await addDoc(expensesCollectionRef, newExpenseData);
  
  const meeting = await getMeetingById(expenseData.meetingId);
  if (meeting?.isSettled) {
    const batch = writeBatch(db);
    await revertMeetingDeduction(expenseData.meetingId, batch);
    const meetingDocRef = doc(db, MEETINGS_COLLECTION, expenseData.meetingId);
    batch.update(meetingDocRef, { isSettled: false });
    await batch.commit();
  }
  const createdDate = (newExpenseData.createdAt as Timestamp).toDate();
  return { ...newExpenseData, id: docRef.id, createdAt: createdDate } as Expense;
};

export const updateExpense = async (meetingId: string, expenseId: string, updates: Partial<Omit<Expense, 'id' | 'createdAt' | 'meetingId'>>): Promise<Expense | null> => {
  if (!meetingId || !expenseId) return null;
  const expenseDocRef = doc(db, MEETINGS_COLLECTION, meetingId, EXPENSES_SUBCOLLECTION, expenseId);
  await updateDoc(expenseDocRef, updates);
  
  const meeting = await getMeetingById(meetingId);
  if (meeting?.isSettled) {
     const batch = writeBatch(db);
    await revertMeetingDeduction(meetingId, batch);
    const meetingDocRef = doc(db, MEETINGS_COLLECTION, meetingId);
    batch.update(meetingDocRef, { isSettled: false });
    await batch.commit();
  }

  const updatedSnapshot = await getDoc(expenseDocRef);
  return dataFromSnapshot<Expense>(updatedSnapshot) || null;
};

export const deleteExpense = async (meetingId: string, expenseId: string): Promise<void> => {
  if (!meetingId || !expenseId) return;
  const expenseDocRef = doc(db, MEETINGS_COLLECTION, meetingId, EXPENSES_SUBCOLLECTION, expenseId);
  await deleteDoc(expenseDocRef);

  const meeting = await getMeetingById(meetingId);
  if (meeting?.isSettled) {
    const batch = writeBatch(db);
    await revertMeetingDeduction(meetingId, batch);
    const meetingDocRef = doc(db, MEETINGS_COLLECTION, meetingId);
    batch.update(meetingDocRef, { isSettled: false });
    await batch.commit();
  }
};


// --- Reserve Fund Functions ---
const getReserveFundBalanceDocRef = () => doc(db, RESERVE_FUND_TRANSACTIONS_COLLECTION, RESERVE_FUND_CONFIG_DOC_ID);

export const getReserveFundBalance = async (): Promise<number> => {
  const balanceDocRef = getReserveFundBalanceDocRef();
  const balanceSnap = await getDoc(balanceDocRef);
  if (balanceSnap.exists()) {
    return balanceSnap.data()?.balance || 0;
  }
  // Initialize if doesn't exist
  await setDoc(balanceDocRef, { balance: 0 });
  return 0;
};

export const getLoggedReserveFundTransactions = async (): Promise<ReserveFundTransaction[]> => {
  const transactionsCollectionRef = collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION);
  const q = query(
    transactionsCollectionRef, 
    where('__name__', '!=', RESERVE_FUND_CONFIG_DOC_ID), // Exclude the config doc
    orderBy('date', 'desc')
  );
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<ReserveFundTransaction>(snapshot);
};

export const setReserveFundBalance = async (newBalance: number, description: string): Promise<void> => {
  const batch = writeBatch(db);
  const balanceDocRef = getReserveFundBalanceDocRef();
  
  batch.set(balanceDocRef, { balance: newBalance }, { merge: true });

  const logEntry: Omit<ReserveFundTransaction, 'id'> = {
    type: 'balance_update',
    amount: newBalance, 
    description: description || `잔액 ${newBalance.toLocaleString()}원으로 설정됨`,
    date: Timestamp.now(),
  };
  const newLogDocRef = doc(collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION)); // Auto-generate ID
  batch.set(newLogDocRef, logEntry);

  await batch.commit();
};

export const recordMeetingDeduction = async (meetingId: string, meetingName: string, amountDeducted: number, date: Date, batch?: any): Promise<void> => {
  if (amountDeducted <= 0) return;

  const useExistingBatch = !!batch;
  const currentBatch = useExistingBatch ? batch : writeBatch(db);

  const balanceDocRef = getReserveFundBalanceDocRef();
  
  const balanceSnap = await getDoc(balanceDocRef);
  if (!balanceSnap.exists()) {
    currentBatch.set(balanceDocRef, { balance: 0 }); 
  }
  currentBatch.update(balanceDocRef, { balance: increment(-amountDeducted) });

  const logEntry: Omit<ReserveFundTransaction, 'id'> = {
    type: 'meeting_deduction',
    amount: -amountDeducted, 
    description: `모임 (${meetingName}) 회비 사용`,
    date: Timestamp.fromDate(new Date(date)),
    meetingId: meetingId,
  };
  const newLogDocRef = doc(collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION));
  currentBatch.set(newLogDocRef, logEntry);

  if (!useExistingBatch) {
    await currentBatch.commit();
  }
};

export const revertMeetingDeduction = async (meetingId: string, batch?: any): Promise<void> => {
  const useExistingBatch = !!batch;
  const currentBatch = useExistingBatch ? batch : writeBatch(db);

  const transactionsCollectionRef = collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION);
  const q = query(transactionsCollectionRef, where('meetingId', '==', meetingId), where('type', '==', 'meeting_deduction'));
  
  const snapshot = await getDocs(q);
  let totalRevertedAmount = 0;

  if (!snapshot.empty) {
    snapshot.forEach(txDoc => {
      const txData = txDoc.data() as ReserveFundTransaction;
      totalRevertedAmount += Math.abs(txData.amount); // amount is negative
      currentBatch.delete(txDoc.ref); 
    });

    if (totalRevertedAmount > 0) {
      const balanceDocRef = getReserveFundBalanceDocRef();
      const balanceSnap = await getDoc(balanceDocRef);
      if (!balanceSnap.exists()) {
        currentBatch.set(balanceDocRef, { balance: 0 });
      }
      currentBatch.update(balanceDocRef, { balance: increment(totalRevertedAmount) }); 
    }
  }
  
  if (!useExistingBatch && totalRevertedAmount > 0) { // Only commit if we made changes and are not part of a larger batch
    await currentBatch.commit();
  }
};

// Removed getSpendingDataForMeeting and getAllSpendingDataForYear

// Used by MeetingDetailsClient (no longer needed if AI tab is removed)
// export const getMeetingExpenses = async (meetingId: string): Promise<Expense[]> => {
//     return getExpensesByMeetingId(meetingId);
// }
