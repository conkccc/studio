
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
  increment,
  QuerySnapshot,
  setDoc,
  limit as firestoreLimit, // Aliased to avoid collision with parameter name
  startAfter as firestoreStartAfter, // Aliased
  getCountFromServer,
  documentId,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Friend, Meeting, Expense, ReserveFundTransaction } from './types';

// Firestore collection names
const FRIENDS_COLLECTION = 'friends';
const MEETINGS_COLLECTION = 'meetings';
const EXPENSES_SUBCOLLECTION = 'expenses'; // Used as a subcollection name
const RESERVE_FUND_CONFIG_COLLECTION = 'config';
const RESERVE_FUND_BALANCE_DOC_ID = 'reserveBalance';
const RESERVE_FUND_TRANSACTIONS_COLLECTION = 'reserveFundTransactions';


// Helper function to convert Firestore snapshot to data with ID
const dataFromSnapshot = <T extends { id: string }>(snapshot: any): T | undefined => {
  if (!snapshot.exists()) return undefined;
  let data = snapshot.data();

  if (typeof data !== 'object' || data === null) {
    console.warn(`Snapshot data for ID ${snapshot.id} is not an object:`, data);
    data = {};
  }

  const convertTimestampToDate = (field: any) => {
    if (field instanceof Timestamp) {
      return field.toDate();
    }
    if (typeof field === 'string' || typeof field === 'number') {
        const d = new Date(field);
        if (!isNaN(d.getTime())) return d;
    }
    return field;
  };

  const processedData: any = { ...data };
  const dateFields: string[] = ['createdAt', 'dateTime', 'endTime', 'date'];

  for (const field of dateFields) {
    if (processedData.hasOwnProperty(field) && processedData[field]) {
      processedData[field] = convertTimestampToDate(processedData[field]);
    }
  }

  return {
    ...processedData,
    id: snapshot.id,
  } as T;
};

const arrayFromSnapshot = <T extends { id: string }>(snapshot: QuerySnapshot): T[] => {
  return snapshot.docs.map((doc: any) => dataFromSnapshot<T>(doc)).filter((item: T | undefined): item is T => item !== undefined);
};


// --- Friend functions ---
export const getFriends = async (): Promise<Friend[]> => {
  const friendsCollectionRef = collection(db, FRIENDS_COLLECTION);
  const q = query(friendsCollectionRef, orderBy('nickname', 'asc'));
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<Friend>(snapshot);
};

export const getFriendById = async (id: string): Promise<Friend | undefined> => {
  if (!id) return undefined;
  const friendDocRef = doc(db, FRIENDS_COLLECTION, id);
  const snapshot = await getDoc(friendDocRef);
  return dataFromSnapshot<Friend>(snapshot);
};

export const addFriend = async (friendData: Omit<Friend, 'id' | 'createdAt'>): Promise<Friend> => {
  const dataToStore = {
    ...friendData,
    createdAt: Timestamp.now(),
  };
  const friendsCollectionRef = collection(db, FRIENDS_COLLECTION);
  const docRef = await addDoc(friendsCollectionRef, dataToStore);
  const newFriendData = {
    ...friendData,
    id: docRef.id,
    createdAt: (dataToStore.createdAt as Timestamp).toDate(),
  };
  return newFriendData;
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
      nonReserveFundParticipants: arrayRemove(id)
    });
  });

  // Also remove friend from expenses (paidById, splitAmongIds, customSplits.friendId)
  // This is more complex as it requires iterating through subcollections.
  // For simplicity here, we'll assume this is handled by other logic or not strictly required for this prototype.
  // In a real app, you'd query all meetings, then for each meeting, query its expenses and update/remove the friend.

  await batch.commit();
};

// --- Meeting functions ---
interface GetMeetingsParams {
  year?: number;
  limitParam?: number; // Renamed from 'limit' to avoid clash with firestore 'limit'
  page?: number;
}

interface GetMeetingsResult {
  meetings: Meeting[];
  totalCount: number;
  availableYears: number[];
}

export const getMeetings = async ({
  year,
  limitParam, // Renamed
  page = 1,
}: GetMeetingsParams = {}): Promise<GetMeetingsResult> => {
  const meetingsCollectionRef = collection(db, MEETINGS_COLLECTION);

  // 1. Get available years
  // This is inefficient for many meetings as it fetches all docs. Consider optimizing in a real app.
  const allMeetingsSnapForYears = await getDocs(query(meetingsCollectionRef, orderBy('dateTime', 'desc')));
  const allMeetingsForYears = arrayFromSnapshot<Meeting>(allMeetingsSnapForYears);
  const yearsSet = new Set<number>();
  allMeetingsForYears.forEach(m => {
    if (m.dateTime && m.dateTime instanceof Date && !isNaN(m.dateTime.getTime())) {
      yearsSet.add(m.dateTime.getFullYear());
    }
  });
  const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

  // 2. Get total count based on year filter for pagination
  let countBaseQuery = query(meetingsCollectionRef);
  if (year) {
    const startOfYear = Timestamp.fromDate(new Date(year, 0, 1));
    const endOfYear = Timestamp.fromDate(new Date(year + 1, 0, 1));
    countBaseQuery = query(countBaseQuery, where('dateTime', '>=', startOfYear), where('dateTime', '<', endOfYear));
  }
  const totalCountSnapshot = await getCountFromServer(countBaseQuery);
  const totalCount = totalCountSnapshot.data().count;

  // 3. Get paginated meetings
  let q = query(meetingsCollectionRef);
  if (year) {
    const startOfYear = Timestamp.fromDate(new Date(year, 0, 1));
    const endOfYear = Timestamp.fromDate(new Date(year + 1, 0, 1));
    q = query(q, where('dateTime', '>=', startOfYear), where('dateTime', '<', endOfYear));
  }
  q = query(q, orderBy('dateTime', 'desc'));

  if (limitParam) {
    if (page > 1) {
      // This "offset-like" pagination is inefficient for large page numbers in Firestore.
      // A cursor-based approach (passing the last document of the previous page) is better.
      const docsToSkip = (page - 1) * limitParam;
      if (docsToSkip > 0) {
        // Declare skipperQuery with let to allow reassignment
        let skipperQuery = query(meetingsCollectionRef, orderBy('dateTime', 'desc'), firestoreLimit(docsToSkip));
        if (year) {
            const startOfYear = Timestamp.fromDate(new Date(year, 0, 1));
            const endOfYear = Timestamp.fromDate(new Date(year + 1, 0, 1));
            // @ts-ignore // query constraints are applied one by one.
            skipperQuery = query(skipperQuery, where('dateTime', '>=', startOfYear), where('dateTime', '<', endOfYear));
        }
        const skipperSnapshot = await getDocs(skipperQuery);
        if (skipperSnapshot.docs.length === docsToSkip && skipperSnapshot.docs.length > 0) {
          q = query(q, firestoreStartAfter(skipperSnapshot.docs[skipperSnapshot.docs.length - 1]));
        } else if (skipperSnapshot.docs.length < docsToSkip) {
          // Not enough documents to skip, meaning current page is beyond available data
          return { meetings: [], totalCount, availableYears };
        }
      }
    }
    q = query(q, firestoreLimit(limitParam));
  }


  const snapshot = await getDocs(q);
  const meetings = arrayFromSnapshot<Meeting>(snapshot);

  return {
    meetings,
    totalCount,
    availableYears,
  };
};

export const getMeetingById = async (id: string): Promise<Meeting | undefined> => {
  if (!id) return undefined;
  const meetingDocRef = doc(db, MEETINGS_COLLECTION, id);
  const snapshot = await getDoc(meetingDocRef);
  return dataFromSnapshot<Meeting>(snapshot);
};

export const addMeeting = async (meetingData: Omit<Meeting, 'id' | 'createdAt' | 'isSettled'>): Promise<Meeting> => {
  const dataToStore: any = {
    ...meetingData,
    dateTime: Timestamp.fromDate(new Date(meetingData.dateTime)),
    createdAt: Timestamp.now(),
    isSettled: false, // New meetings are not settled by default
    nonReserveFundParticipants: meetingData.nonReserveFundParticipants || [],
    useReserveFund: meetingData.useReserveFund || false,
    partialReserveFundAmount: meetingData.partialReserveFundAmount === undefined ? undefined : Number(meetingData.partialReserveFundAmount),
  };
  if (meetingData.endTime) {
    dataToStore.endTime = Timestamp.fromDate(new Date(meetingData.endTime));
  } else {
    dataToStore.endTime = null; // Or 'undefined' if your schema allows it, null is common for Firestore
  }

  const meetingsCollectionRef = collection(db, MEETINGS_COLLECTION);
  const docRef = await addDoc(meetingsCollectionRef, dataToStore);

  const newMeeting = {
    ...meetingData,
    id: docRef.id,
    createdAt: (dataToStore.createdAt as Timestamp).toDate(),
    dateTime: (dataToStore.dateTime as Timestamp).toDate(),
    endTime: dataToStore.endTime ? (dataToStore.endTime as Timestamp).toDate() : undefined,
    isSettled: false,
    partialReserveFundAmount: meetingData.partialReserveFundAmount === undefined ? undefined : Number(meetingData.partialReserveFundAmount),
  };
  return newMeeting;
};

export const updateMeeting = async (id: string, updates: Partial<Omit<Meeting, 'id' | 'createdAt'>>): Promise<Meeting | null> => {
  const meetingDocRef = doc(db, MEETINGS_COLLECTION, id);
  const updateData: { [key: string]: any } = { ...updates };

  if (updates.dateTime) {
    updateData.dateTime = Timestamp.fromDate(new Date(updates.dateTime));
  }
  if (updates.hasOwnProperty('endTime')) { // Explicitly check if endTime is part of updates
    updateData.endTime = updates.endTime ? Timestamp.fromDate(new Date(updates.endTime)) : null;
  }
  if (updates.hasOwnProperty('partialReserveFundAmount')) {
     updateData.partialReserveFundAmount = updates.partialReserveFundAmount === undefined ? undefined : Number(updates.partialReserveFundAmount);
  }
  // isSettled is managed by finalizeMeetingSettlementAction or when expenses change

  await updateDoc(meetingDocRef, updateData);
  const updatedSnapshot = await getDoc(meetingDocRef);
  return dataFromSnapshot<Meeting>(updatedSnapshot) || null;
};

export const deleteMeeting = async (id: string): Promise<void> => {
  const batch = writeBatch(db);
  const meetingDocRef = doc(db, MEETINGS_COLLECTION, id);

  // Delete all expenses in the subcollection
  const expensesCollectionRef = collection(db, MEETINGS_COLLECTION, id, EXPENSES_SUBCOLLECTION);
  const expensesSnapshot = await getDocs(expensesCollectionRef);
  expensesSnapshot.forEach(expenseDoc => {
    batch.delete(expenseDoc.ref);
  });

  // Revert any reserve fund deduction associated with this meeting
  await revertMeetingDeduction(id, batch);

  batch.delete(meetingDocRef);
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
  const dataToStore = {
    ...expenseData,
    createdAt: Timestamp.now(),
  };
  const expensesCollectionRef = collection(db, MEETINGS_COLLECTION, expenseData.meetingId, EXPENSES_SUBCOLLECTION);
  const docRef = await addDoc(expensesCollectionRef, dataToStore);

  const newExpense: Expense = {
    ...expenseData,
    id: docRef.id,
    createdAt: (dataToStore.createdAt as Timestamp).toDate(),
  };
  return newExpense;
};

export const updateExpense = async (expenseId: string, meetingId: string, updates: Partial<Omit<Expense, 'id' | 'createdAt' | 'meetingId'>>): Promise<Expense | null> => {
  if (!meetingId || !expenseId) return null;
  const expenseDocRef = doc(db, MEETINGS_COLLECTION, meetingId, EXPENSES_SUBCOLLECTION, expenseId);
  const updateData = { ...updates };

  await updateDoc(expenseDocRef, updateData);
  const updatedSnapshot = await getDoc(expenseDocRef);
  return dataFromSnapshot<Expense>(updatedSnapshot) || null;
};

export const deleteExpense = async (expenseId: string, meetingId: string ): Promise<void> => {
  if (!meetingId || !expenseId) return;
  const expenseDocRef = doc(db, MEETINGS_COLLECTION, meetingId, EXPENSES_SUBCOLLECTION, expenseId);
  await deleteDoc(expenseDocRef);
};


// --- Reserve Fund Functions ---
const getReserveFundBalanceDocRef = () => doc(db, RESERVE_FUND_CONFIG_COLLECTION, RESERVE_FUND_BALANCE_DOC_ID);

export const getReserveFundBalance = async (): Promise<number> => {
  const balanceDocRef = getReserveFundBalanceDocRef();
  const balanceSnap = await getDoc(balanceDocRef);
  if (balanceSnap.exists() && typeof balanceSnap.data()?.balance === 'number') {
    return balanceSnap.data().balance;
  }
  // If the document doesn't exist or balance is not a number, initialize it.
  try {
    await setDoc(balanceDocRef, { balance: 0 }, { merge: true }); // Use merge to be safe
  } catch (error) {
      console.error("Error initializing reserve fund balance:", error);
      // Depending on desired behavior, you might want to re-throw or handle differently
      return 0; // Return 0 if initialization fails
  }
  return 0; // Return 0 after initialization
};

export const getLoggedReserveFundTransactions = async (): Promise<ReserveFundTransaction[]> => {
  const transactionsCollectionRef = collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION);
  const q = query(
    transactionsCollectionRef,
    orderBy('date', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      type: data.type,
      description: data.description,
      amount: data.amount,
      date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
      meetingId: data.meetingId,
    } as ReserveFundTransaction;
  });
};


export const setReserveFundBalance = async (newBalance: number, description?: string): Promise<void> => {
  const batch = writeBatch(db);
  const balanceDocRef = getReserveFundBalanceDocRef();

  const balanceSnap = await getDoc(balanceDocRef);
  if (!balanceSnap.exists()) {
    batch.set(balanceDocRef, { balance: newBalance });
  } else {
    batch.update(balanceDocRef, { balance: newBalance });
  }
  
  const logEntry: Omit<ReserveFundTransaction, 'id'> = {
    type: 'balance_update',
    amount: newBalance, // For 'balance_update', amount IS the new balance.
    description: description || `잔액 ${newBalance.toLocaleString()}원으로 설정됨`,
    date: Timestamp.now().toDate(), // Store as JS Date, Firestore converts it
  };
  const newLogDocRef = doc(collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION)); // Auto-generate ID
  batch.set(newLogDocRef, logEntry);

  await batch.commit();
};

export const recordMeetingDeduction = async (meetingId: string, meetingName: string, amountDeducted: number, date: Date, batch?: any): Promise<void> => {
  if (amountDeducted <= 0.001) return; // No deduction if amount is negligible

  const useExistingBatch = !!batch;
  const currentBatch = useExistingBatch ? batch : writeBatch(db);

  const balanceDocRef = getReserveFundBalanceDocRef();
  if (!useExistingBatch) { // Only check existence if not part of a larger batch that might create it
    const balanceSnap = await getDoc(balanceDocRef);
    if (!balanceSnap.exists()) {
      // Initialize balance if document doesn't exist. This is crucial.
      currentBatch.set(balanceDocRef, { balance: 0 });
    }
  }
  currentBatch.update(balanceDocRef, { balance: increment(-amountDeducted) });

  const logEntry: Omit<ReserveFundTransaction, 'id'> = {
    type: 'meeting_deduction',
    amount: -amountDeducted, // Store the change (negative for deduction)
    description: `모임 (${meetingName}) 회비 사용`,
    date: date, // date is already a JS Date object
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
  // Query for transactions related to this meetingId and of type 'meeting_deduction'
  const q = query(transactionsCollectionRef, where('meetingId', '==', meetingId), where('type', '==', 'meeting_deduction'));

  const snapshot = await getDocs(q);
  let totalRevertedAmount = 0;

  if (!snapshot.empty) {
    snapshot.forEach(txDoc => {
      const txData = txDoc.data() as Partial<ReserveFundTransaction>;
      // Amount for deduction is stored as negative, so Math.abs gives the positive value to add back
      if (txData.amount && typeof txData.amount === 'number') {
        totalRevertedAmount += Math.abs(txData.amount); 
      }
      currentBatch.delete(txDoc.ref); // Delete the original deduction log
    });

    if (totalRevertedAmount > 0.001) { // Only update balance if a meaningful amount was reverted
      const balanceDocRef = getReserveFundBalanceDocRef();
       if (!useExistingBatch) { // Only check existence if not part of a larger batch
        const balanceSnap = await getDoc(balanceDocRef);
        if (!balanceSnap.exists()) {
           // Initialize balance if document doesn't exist. This is crucial.
           currentBatch.set(balanceDocRef, { balance: 0 });
        }
      }
      currentBatch.update(balanceDocRef, { balance: increment(totalRevertedAmount) });
    }
  }

  if (!useExistingBatch && totalRevertedAmount > 0.001) { // Commit only if changes were made and not part of an existing batch
    await currentBatch.commit();
  }
};

    