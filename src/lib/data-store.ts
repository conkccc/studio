
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
  startAfter as firestoreStartAfter,
  limit as firestoreLimit,
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
  return {
    ...friendData,
    id: docRef.id,
    createdAt: (dataToStore.createdAt as Timestamp).toDate(),
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

  const meetingsCollectionRef = collection(db, MEETINGS_COLLECTION);
  const participantQuery = query(meetingsCollectionRef, where('participantIds', 'array-contains', id));
  const participantSnapshot = await getDocs(participantQuery);
  participantSnapshot.forEach(meetingDocSnapshot => {
    batch.update(meetingDocSnapshot.ref, {
      participantIds: arrayRemove(id),
      nonReserveFundParticipants: arrayRemove(id)
    });
  });

  await batch.commit();
};

// --- Meeting functions ---
interface GetMeetingsParams {
  year?: number;
  limitParam?: number;
  page?: number;
}

interface GetMeetingsResult {
  meetings: Meeting[];
  totalCount: number;
  availableYears: number[];
}

export const getMeetings = async ({
  year,
  limitParam,
  page = 1,
}: GetMeetingsParams = {}): Promise<GetMeetingsResult> => {
  const meetingsCollectionRef = collection(db, MEETINGS_COLLECTION);

  // 1. Get available years (This can be inefficient for a large number of meetings as it fetches all docs)
  const allMeetingsSnapForYears = await getDocs(query(meetingsCollectionRef, orderBy('dateTime', 'desc')));
  const allMeetingsForYears = arrayFromSnapshot<Meeting>(allMeetingsSnapForYears);
  const yearsSet = new Set<number>();
  allMeetingsForYears.forEach(m => {
    // Ensure m.dateTime is a valid Date object before calling getFullYear
    if (m.dateTime && m.dateTime instanceof Date && !isNaN(m.dateTime.getTime())) {
      yearsSet.add(m.dateTime.getFullYear());
    }
  });
  const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

  // 2. Get total count based on year filter
  let countQuery = query(meetingsCollectionRef);
  if (year) {
    const startOfYear = Timestamp.fromDate(new Date(year, 0, 1));
    const endOfYear = Timestamp.fromDate(new Date(year + 1, 0, 1));
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
    if (page > 1) {
      // This "offset-like" pagination is inefficient for large page numbers in Firestore.
      // A cursor-based approach (passing the last document of the previous page) is better.
      const docsToSkip = (page - 1) * limitParam;
      if (docsToSkip > 0) {
        const skipperQuery = query(meetingsCollectionRef, orderBy('dateTime', 'desc'), firestoreLimit(docsToSkip)); // Note: year filter for skipper needs to be consistent
        if (year) {
            const startOfYear = Timestamp.fromDate(new Date(year, 0, 1));
            const endOfYear = Timestamp.fromDate(new Date(year + 1, 0, 1));
            // @ts-ignore // query constraints are applied one by one.
            skipperQuery = query(skipperQuery, where('dateTime', '>=', startOfYear), where('dateTime', '<', endOfYear));
        }
        const skipperSnapshot = await getDocs(skipperQuery);
        if (skipperSnapshot.docs.length === docsToSkip) {
          q = query(q, firestoreStartAfter(skipperSnapshot.docs[skipperSnapshot.docs.length - 1]));
        } else {
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
    isSettled: false,
    nonReserveFundParticipants: meetingData.nonReserveFundParticipants || [],
    useReserveFund: meetingData.useReserveFund || false,
    partialReserveFundAmount: meetingData.partialReserveFundAmount || 0,
  };
  if (meetingData.endTime) {
    dataToStore.endTime = Timestamp.fromDate(new Date(meetingData.endTime));
  } else {
    dataToStore.endTime = null;
  }

  const meetingsCollectionRef = collection(db, MEETINGS_COLLECTION);
  const docRef = await addDoc(meetingsCollectionRef, dataToStore);

  return {
    ...meetingData,
    id: docRef.id,
    createdAt: (dataToStore.createdAt as Timestamp).toDate(),
    dateTime: (dataToStore.dateTime as Timestamp).toDate(),
    endTime: dataToStore.endTime ? (dataToStore.endTime as Timestamp).toDate() : undefined,
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
    createdAt: (dataToStore.createdAt as Timestamp).toDate(),
  };
};

export const updateExpense = async (expenseId: string, meetingId: string, updates: Partial<Omit<Expense, 'id' | 'createdAt' | 'meetingId'>>): Promise<Expense | null> => {
  if (!meetingId || !expenseId) return null;
  const expenseDocRef = doc(db, MEETINGS_COLLECTION, meetingId, EXPENSES_SUBCOLLECTION, expenseId);
  const updateData = { ...updates };

  await updateDoc(expenseDocRef, updateData);

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

export const deleteExpense = async (expenseId: string, meetingId: string ): Promise<void> => {
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
const getReserveFundBalanceDocRef = () => doc(db, RESERVE_FUND_CONFIG_COLLECTION, RESERVE_FUND_BALANCE_DOC_ID);

export const getReserveFundBalance = async (): Promise<number> => {
  const balanceDocRef = getReserveFundBalanceDocRef();
  const balanceSnap = await getDoc(balanceDocRef);
  if (balanceSnap.exists() && typeof balanceSnap.data()?.balance === 'number') {
    return balanceSnap.data().balance;
  }
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
  // Ensure dates are converted for ReserveFundTransaction
  return snapshot.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      type: data.type,
      description: data.description,
      amount: data.amount,
      date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date), // Convert if Timestamp
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
    amount: newBalance,
    description: description || `잔액 ${newBalance.toLocaleString()}원으로 설정됨`,
    date: Timestamp.now().toDate(),
  };
  const newLogDocRef = doc(collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION));
  batch.set(newLogDocRef, logEntry);

  await batch.commit();
};

export const recordMeetingDeduction = async (meetingId: string, meetingName: string, amountDeducted: number, date: Date, batch?: any): Promise<void> => {
  if (amountDeducted <= 0.001) return;

  const useExistingBatch = !!batch;
  const currentBatch = useExistingBatch ? batch : writeBatch(db);

  const balanceDocRef = getReserveFundBalanceDocRef();
  if (!useExistingBatch) { // Only check existence if not part of a larger batch that might create it
    const balanceSnap = await getDoc(balanceDocRef);
    if (!balanceSnap.exists()) {
      currentBatch.set(balanceDocRef, { balance: 0 }); // Initialize if doesn't exist
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
       if (!useExistingBatch) { // Only check existence if not part of a larger batch
        const balanceSnap = await getDoc(balanceDocRef);
        if (!balanceSnap.exists()) {
           currentBatch.set(balanceDocRef, { balance: 0 }); // Initialize if doesn't exist
        }
      }
      currentBatch.update(balanceDocRef, { balance: increment(totalRevertedAmount) });
    }
  }

  if (!useExistingBatch && totalRevertedAmount > 0.001) {
    await currentBatch.commit();
  }
};

