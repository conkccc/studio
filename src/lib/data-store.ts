
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
  startAfter as firestoreStartAfter, // Aliased to avoid confusion if a variable 'startAfter' is used
  limit as firestoreLimit, // Aliased to avoid confusion with parameter name
  getCountFromServer,
  documentId
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
    // Handle cases where dates might already be strings or numbers from an intermediate step
    // or if they were not stored as Timestamps initially (less likely with current setup but good for robustness)
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

export const addFriend = async (friendData: Omit<Friend, 'id'>): Promise<Friend> => {
  const dataToStore = {
    ...friendData,
    createdAt: Timestamp.fromDate(new Date(friendData.createdAt)), // Store as Firestore Timestamp
  };
  const friendsCollectionRef = collection(db, FRIENDS_COLLECTION);
  const docRef = await addDoc(friendsCollectionRef, dataToStore);
  return {
    ...friendData, // Original data with JS Date
    id: docRef.id,
  };
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

  // Remove friend from participantIds and nonReserveFundParticipants in all meetings
  const meetingsCollectionRef = collection(db, MEETINGS_COLLECTION);
  const participantQuery = query(meetingsCollectionRef, where('participantIds', 'array-contains', id));
  const participantSnapshot = await getDocs(participantQuery);
  participantSnapshot.forEach(meetingDocSnapshot => {
    batch.update(meetingDocSnapshot.ref, {
      participantIds: arrayRemove(id),
      nonReserveFundParticipants: arrayRemove(id) // Also remove from this list if present
    });
  });

  await batch.commit();
};

// --- Meeting functions ---
interface GetMeetingsParams {
  year?: number;
  limitParam?: number; // Renamed from limit to avoid conflict with firestore limit
  startAfterDoc?: any; // Firestore DocumentSnapshot for pagination
  page?: number; // For direct page-based pagination (alternative to startAfterDoc)
}

interface GetMeetingsResult {
  meetings: Meeting[];
  totalCount: number;
  availableYears: number[]; // Add this to return distinct years
  // lastVisible is removed as direct page/limit is simpler for now
}

export const getMeetings = async ({
  year,
  limitParam,
  page = 1, // Default to page 1
}: GetMeetingsParams = {}): Promise<GetMeetingsResult> => {
  const meetingsCollectionRef = collection(db, MEETINGS_COLLECTION);

  // 1. Get available years (can be optimized if many meetings)
  const allMeetingsSnapForYears = await getDocs(query(meetingsCollectionRef, orderBy('dateTime', 'desc')));
  const allMeetingsForYears = arrayFromSnapshot<Meeting>(allMeetingsSnapForYears);
  const yearsSet = new Set<number>();
  allMeetingsForYears.forEach(m => {
    if (m.dateTime instanceof Date) {
      yearsSet.add(m.dateTime.getFullYear());
    }
  });
  const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

  // 2. Get total count based on year filter
  let countQuery = query(meetingsCollectionRef);
  if (year) {
    const startOfYear = Timestamp.fromDate(new Date(year, 0, 1));
    const endOfYear = Timestamp.fromDate(new Date(year + 1, 0, 1)); // Exclusive end
    countQuery = query(countQuery, where('dateTime', '>=', startOfYear), where('dateTime', '<', endOfYear));
  }
  const totalCountSnapshot = await getCountFromServer(countQuery);
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
    q = query(q, firestoreLimit(limitParam));
    if (page > 1) {
      // For page-based pagination with limit, we need to fetch previous pages' last doc
      // This is simpler if we just fetch (page-1)*limit docs then startAfter that.
      // Or, for true cursor-based, client needs to pass lastVisibleDoc.
      // For simplicity, let's implement offset-like behavior if page > 1 by fetching
      // necessary prior docs to find the correct startAfter document.
      // This is NOT efficient for very large page numbers.
      // A more robust solution would use cursors passed from client.
      const docsToSkip = (page - 1) * limitParam;
      if (docsToSkip > 0) {
        const skipperQuery = query(q, firestoreLimit(docsToSkip)); // q already has year and orderBy
        const skipperSnapshot = await getDocs(skipperQuery);
        if (skipperSnapshot.docs.length === docsToSkip) {
          q = query(q, firestoreStartAfter(skipperSnapshot.docs[skipperSnapshot.docs.length - 1]));
        } else {
          // Requested page is out of bounds, return empty
          return { meetings: [], totalCount, availableYears };
        }
      }
    }
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
    isSettled: false,
    nonReserveFundParticipants: meetingData.nonReserveFundParticipants || [],
    useReserveFund: meetingData.useReserveFund || false,
    partialReserveFundAmount: meetingData.partialReserveFundAmount || 0, // Ensure it's a number
  };
  if (meetingData.endTime) {
    dataToStore.endTime = Timestamp.fromDate(new Date(meetingData.endTime));
  } else {
    dataToStore.endTime = null;
  }

  const meetingsCollectionRef = collection(db, MEETINGS_COLLECTION);
  const docRef = await addDoc(meetingsCollectionRef, dataToStore);

  // Return data with JS Dates
  return {
    ...meetingData,
    id: docRef.id,
    createdAt: dataToStore.createdAt.toDate(),
    dateTime: dataToStore.dateTime.toDate(),
    endTime: dataToStore.endTime ? dataToStore.endTime.toDate() : undefined,
    isSettled: false,
  };
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
   if (updates.hasOwnProperty('partialReserveFundAmount')) {
    updateData.partialReserveFundAmount = updates.partialReserveFundAmount || 0;
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

  // Revert reserve fund deduction if any
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

  // If meeting was settled, unsettle it and revert fund deduction
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
    createdAt: dataToStore.createdAt.toDate(),
  };
};

export const updateExpense = async (meetingId: string, expenseId: string, updates: Partial<Omit<Expense, 'id' | 'createdAt' | 'meetingId'>>): Promise<Expense | null> => {
  if (!meetingId || !expenseId) return null;
  const expenseDocRef = doc(db, MEETINGS_COLLECTION, meetingId, EXPENSES_SUBCOLLECTION, expenseId);
  const updateData = { ...updates };

  await updateDoc(expenseDocRef, updateData);

  // If meeting was settled, unsettle it and revert fund deduction
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

  // If meeting was settled, unsettle it and revert fund deduction
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
const getReserveFundBalanceDocRef = () => doc(db, RESERVE_FUND_CONFIG_COLLECTION, RESERVE_FUND_BALANCE_DOC_ID);

export const getReserveFundBalance = async (): Promise<number> => {
  const balanceDocRef = getReserveFundBalanceDocRef();
  const balanceSnap = await getDoc(balanceDocRef);
  if (balanceSnap.exists() && typeof balanceSnap.data()?.balance === 'number') {
    return balanceSnap.data().balance;
  }
  // If doc doesn't exist or balance field is missing/not a number, initialize it.
  try {
    await setDoc(balanceDocRef, { balance: 0 }, { merge: true });
  } catch (error) {
      console.error("Error initializing reserve fund balance:", error);
      return 0;
  }
  return 0;
};

export const getLoggedReserveFundTransactions = async (): Promise<ReserveFundTransaction[]> => {
  const transactionsCollectionRef = collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION);
  const q = query(
    transactionsCollectionRef,
    orderBy('date', 'desc')
  );
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<ReserveFundTransaction>(snapshot);
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
    amount: newBalance,
    description: description || `잔액 ${newBalance.toLocaleString()}원으로 설정됨`,
    date: Timestamp.now().toDate(), // Store as JS Date, Firestore converts to Timestamp
  };
  const newLogDocRef = doc(collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION)); // Auto-generate ID
  batch.set(newLogDocRef, logEntry);

  await batch.commit();
};

export const recordMeetingDeduction = async (meetingId: string, meetingName: string, amountDeducted: number, date: Date, batch?: any): Promise<void> => {
  if (amountDeducted <= 0.001) return;

  const useExistingBatch = !!batch;
  const currentBatch = useExistingBatch ? batch : writeBatch(db);

  const balanceDocRef = getReserveFundBalanceDocRef();
  if (!useExistingBatch) {
    const balanceSnap = await getDoc(balanceDocRef);
    if (!balanceSnap.exists()) {
      currentBatch.set(balanceDocRef, { balance: 0 });
    }
  }
  currentBatch.update(balanceDocRef, { balance: increment(-amountDeducted) });

  const logEntry: Omit<ReserveFundTransaction, 'id'> = {
    type: 'meeting_deduction',
    amount: -amountDeducted,
    description: `모임 (${meetingName}) 회비 사용`,
    date: date, // This is already a JS Date
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
      const txData = txDoc.data() as Partial<ReserveFundTransaction>;
      if (txData.amount && typeof txData.amount === 'number') {
        totalRevertedAmount += Math.abs(txData.amount);
      }
      currentBatch.delete(txDoc.ref);
    });

    if (totalRevertedAmount > 0.001) {
      const balanceDocRef = getReserveFundBalanceDocRef();
       if (!useExistingBatch) {
        const balanceSnap = await getDoc(balanceDocRef);
        if (!balanceSnap.exists()) {
           currentBatch.set(balanceDocRef, { balance: 0 });
        }
      }
      currentBatch.update(balanceDocRef, { balance: increment(totalRevertedAmount) });
    }
  }

  if (!useExistingBatch && totalRevertedAmount > 0.001) {
    await currentBatch.commit();
  }
};
