
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
    date: data.date ? convertTimestampToDate(data.date) : undefined, // For ReserveFundTransaction
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
  
  const participantQuery = query(meetingsCollectionRef, where('participantIds', 'array-contains', id));
  const participantSnapshot = await getDocs(participantQuery);
  participantSnapshot.forEach(meetingDocSnapshot => {
    batch.update(meetingDocSnapshot.ref, { 
      participantIds: arrayRemove(id),
      // Also remove from nonReserveFundParticipants if present
      nonReserveFundParticipants: arrayRemove(id) 
    });
  });
  
  // If a friend is deleted, we might need to mark meetings they created as having an "unknown" creator
  // or handle expenses they paid. For simplicity, this is not handled here yet.

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
  const newMeetingData: any = { // Use any for temporary flexibility with Timestamp
    ...meetingData,
    dateTime: Timestamp.fromDate(new Date(meetingData.dateTime)),
    createdAt: Timestamp.now(),
    isSettled: false,
    nonReserveFundParticipants: meetingData.nonReserveFundParticipants || [],
  };
  if (meetingData.endTime) {
    newMeetingData.endTime = Timestamp.fromDate(new Date(meetingData.endTime));
  } else {
    newMeetingData.endTime = null; // Explicitly store null for undefined endTime
  }

  const meetingsCollectionRef = collection(db, MEETINGS_COLLECTION);
  const docRef = await addDoc(meetingsCollectionRef, newMeetingData);
  
  // Convert Timestamps back to Dates for the returned object
  return { 
    ...meetingData, 
    id: docRef.id, 
    createdAt: (newMeetingData.createdAt as Timestamp).toDate(),
    dateTime: (newMeetingData.dateTime as Timestamp).toDate(),
    endTime: newMeetingData.endTime ? (newMeetingData.endTime as Timestamp).toDate() : undefined,
    isSettled: false,
    nonReserveFundParticipants: meetingData.nonReserveFundParticipants || [],
  } as Meeting;
};

export const updateMeeting = async (id: string, updates: Partial<Omit<Meeting, 'id' | 'createdAt'>>): Promise<Meeting | null> => {
  const meetingDocRef = doc(db, MEETINGS_COLLECTION, id);
  const updateData: { [key: string]: any } = { ...updates };

  if (updates.dateTime) {
    updateData.dateTime = Timestamp.fromDate(new Date(updates.dateTime));
  }
  if (updates.hasOwnProperty('endTime')) { 
    updateData.endTime = updates.endTime ? Timestamp.fromDate(new Date(updates.endTime)) : null;
  }
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

  const expensesCollectionRef = collection(db, MEETINGS_COLLECTION, id, EXPENSES_SUBCOLLECTION);
  const expensesSnapshot = await getDocs(expensesCollectionRef);
  expensesSnapshot.forEach(expenseDoc => {
    batch.delete(expenseDoc.ref);
  });

  batch.delete(meetingDocRef);
  await revertMeetingDeduction(id, batch); 
  
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
  return { 
    ...expenseData, 
    id: docRef.id, 
    createdAt: (newExpenseData.createdAt as Timestamp).toDate() 
  };
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
  if (balanceSnap.exists() && typeof balanceSnap.data()?.balance === 'number') {
    return balanceSnap.data().balance;
  }
  await setDoc(balanceDocRef, { balance: 0 });
  return 0;
};

export const getLoggedReserveFundTransactions = async (): Promise<ReserveFundTransaction[]> => {
  const transactionsCollectionRef = collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION);
  const q = query(
    transactionsCollectionRef, 
    where(documentId(), '!=', RESERVE_FUND_CONFIG_DOC_ID), // Use documentId() for querying by ID
    orderBy('date', 'desc')
  );
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<ReserveFundTransaction>(snapshot);
};

// Helper for documentId() import if not auto-imported
import { documentId } from 'firebase/firestore'; 

export const setReserveFundBalance = async (newBalance: number, description: string): Promise<void> => {
  const batch = writeBatch(db);
  const balanceDocRef = getReserveFundBalanceDocRef();
  
  batch.set(balanceDocRef, { balance: newBalance }, { merge: true });

  const logEntry: Omit<ReserveFundTransaction, 'id'> = {
    type: 'balance_update',
    amount: newBalance, 
    description: description || `잔액 ${newBalance.toLocaleString()}원으로 설정됨`,
    date: Timestamp.now().toDate(), // Corrected line
  };
  const newLogDocRef = doc(collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION)); 
  batch.set(newLogDocRef, logEntry);

  await batch.commit();
};

export const recordMeetingDeduction = async (meetingId: string, meetingName: string, amountDeducted: number, date: Date, batch?: any): Promise<void> => {
  if (amountDeducted <= 0) return;

  const useExistingBatch = !!batch;
  const currentBatch = useExistingBatch ? batch : writeBatch(db);

  const balanceDocRef = getReserveFundBalanceDocRef();
  
  // Ensure the balance document exists before trying to update with increment
  const balanceSnap = await (useExistingBatch ? Promise.resolve(null) : getDoc(balanceDocRef)); // Avoid getDoc if in a transaction already for writeBatch
  if (!useExistingBatch && (!balanceSnap || !balanceSnap.exists())) {
    currentBatch.set(balanceDocRef, { balance: 0 }); 
  }
  currentBatch.update(balanceDocRef, { balance: increment(-amountDeducted) });

  const logEntry: Omit<ReserveFundTransaction, 'id'> = {
    type: 'meeting_deduction',
    amount: -amountDeducted, 
    description: `모임 (${meetingName}) 회비 사용`,
    date: Timestamp.fromDate(new Date(date)), // Convert JS Date to Timestamp for storing
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
  
  const snapshot = await getDocs(q); // This needs to happen outside batch if batch is passed for updates
  let totalRevertedAmount = 0;

  if (!snapshot.empty) {
    snapshot.forEach(txDoc => {
      const txData = txDoc.data() as ReserveFundTransaction;
      totalRevertedAmount += Math.abs(txData.amount); 
      currentBatch.delete(txDoc.ref); 
    });

    if (totalRevertedAmount > 0) {
      const balanceDocRef = getReserveFundBalanceDocRef();
      // Ensure balance doc exists for increment, similar to recordMeetingDeduction
      const balanceSnap = await (useExistingBatch ? Promise.resolve(null) : getDoc(balanceDocRef));
      if (!useExistingBatch && (!balanceSnap || !balanceSnap.exists())) {
         currentBatch.set(balanceDocRef, { balance: 0 });
      }
      currentBatch.update(balanceDocRef, { balance: increment(totalRevertedAmount) }); 
    }
  }
  
  if (!useExistingBatch && totalRevertedAmount > 0) { 
    await currentBatch.commit();
  }
};

// Helper to convert Firestore Timestamp to Date in returned data
const processTimestamps = (data: any): any => {
    if (!data) return data;
    const processedData = { ...data };
    for (const key in processedData) {
        if (processedData[key] instanceof Timestamp) {
            processedData[key] = processedData[key].toDate();
        }
    }
    return processedData;
};

    