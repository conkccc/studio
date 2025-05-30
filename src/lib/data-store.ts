import type { User, Friend, Meeting, Expense, ReserveFundTransaction } from './types';
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
  limit as firestoreLimit,
  startAfter as firestoreStartAfter,
  getCountFromServer,
  deleteField,
  DocumentData,
  DocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
// 서버 환경에서만 adminDb import
let adminDb: import('firebase-admin/firestore').Firestore | undefined = undefined;
if (typeof window === 'undefined') {
  // 서버에서만 동적 import
  adminDb = require('./firebase-admin').adminDb;
}

// Firestore 인스턴스 선택 (서버: adminDb, 클라이언트: db)
export const firestore = typeof window === 'undefined' && adminDb ? adminDb : db;

// Firestore 컬렉션/서브컬렉션 상수 직접 선언 (types.ts에 없을 경우)
export const USERS_COLLECTION = 'users';
export const FRIENDS_COLLECTION = 'friends';
export const MEETINGS_COLLECTION = 'meetings';
export const EXPENSES_SUBCOLLECTION = 'expenses';
export const RESERVE_FUND_CONFIG_COLLECTION = 'reserveFundConfig';
export const RESERVE_FUND_BALANCE_DOC_ID = 'balance';
export const RESERVE_FUND_TRANSACTIONS_COLLECTION = 'reserveFundTransactions';

// Helper function to convert Firestore Timestamps to JS Dates in an object
const convertTimestampsToDates = (data: DocumentData): DocumentData => {
  const processedData: any = { ...data };
  const dateFields: string[] = ['createdAt', 'dateTime', 'endTime', 'date', 'shareExpiryDate'];

  for (const field of dateFields) {
    if (processedData.hasOwnProperty(field) && processedData[field] instanceof Timestamp) {
      processedData[field] = (processedData[field] as Timestamp).toDate();
    } else if (processedData.hasOwnProperty(field) && processedData[field] === null) {
      processedData[field] = null;
    } else if (processedData.hasOwnProperty(field) && typeof processedData[field] === 'string') {
      // Attempt to parse if it's a string representation of a date
      const parsedDate = new Date(processedData[field]);
      if (!isNaN(parsedDate.getTime())) {
        processedData[field] = parsedDate;
      }
    }
  }
  return processedData;
};

const dataFromSnapshot = <T extends { id: string }>(snapshot: DocumentSnapshot): T | undefined => {
  if (!snapshot.exists()) return undefined;
  const data = snapshot.data();
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }
  return {
    ...convertTimestampsToDates(data),
    id: snapshot.id,
  } as T;
};

const arrayFromSnapshot = <T extends { id: string }>(snapshot: QuerySnapshot): T[] => {
  return snapshot.docs.map((docSnap) => dataFromSnapshot<T>(docSnap)).filter((item): item is T => item !== undefined);
};


// --- User functions ---
export const getUserById = async (userId: string): Promise<User | undefined> => {
  if (!userId) return undefined;
  const userDocRef = doc(db, USERS_COLLECTION, userId);
  const snapshot = await getDoc(userDocRef);
  return dataFromSnapshot<User>(snapshot);
};

export const addUserOnLogin = async (userData: { id: string; email?: string | null; name?: string | null }): Promise<User> => {
  const userDocRef = doc(db, USERS_COLLECTION, userData.id);
  const userSnap = await getDoc(userDocRef);
  if (!userSnap.exists()) {
    const newUser: User = {
      id: userData.id,
      email: userData.email || null,
      name: userData.name || null,
      role: 'none', // Default role
      createdAt: new Date(),
    };
    await setDoc(userDocRef, {
      ...newUser,
      createdAt: Timestamp.fromDate(newUser.createdAt) // Store as Firestore Timestamp
    });
    return newUser; // Return with JS Date
  }
  const existingUser = dataFromSnapshot<User>(userSnap);
  if (!existingUser) {
    throw new Error("Failed to process existing user data after login.");
  }
  return existingUser;
};

export const updateUser = async (userId: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User | null> => {
  const userDocRef = doc(db, USERS_COLLECTION, userId);
  await updateDoc(userDocRef, updates);
  const updatedSnapshot = await getDoc(userDocRef);
  return dataFromSnapshot<User>(updatedSnapshot) || null;
};

export const getUsers = async (): Promise<User[]> => {
  const usersCollectionRef = collection(db, USERS_COLLECTION);
  const q = query(usersCollectionRef, orderBy('name', 'asc')); // Consider ordering by email if name is optional
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<User>(snapshot);
};

// --- Friend functions ---
export const getFriends = async (): Promise<Friend[]> => {
  const friendsCollectionRef = collection(db, FRIENDS_COLLECTION);
  const q = query(friendsCollectionRef, orderBy('nickname', 'asc'));
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<Friend>(snapshot);
};

export const addFriend = async (friendData: Omit<Friend, 'id' | 'createdAt'>): Promise<Friend> => {
  const newFriendData = {
    ...friendData,
    createdAt: new Date(),
  };
  const friendsCollectionRef = collection(db, FRIENDS_COLLECTION);
  const docRef = await addDoc(friendsCollectionRef, {
    ...newFriendData,
    createdAt: Timestamp.fromDate(newFriendData.createdAt)
  });
  return { ...newFriendData, id: docRef.id };
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
  let baseQueryConstraints = [];
  if (year) {
    const startOfYear = Timestamp.fromDate(new Date(year, 0, 1));
    const endOfYear = Timestamp.fromDate(new Date(year + 1, 0, 1));
    baseQueryConstraints.push(where('dateTime', '>=', startOfYear));
    baseQueryConstraints.push(where('dateTime', '<', endOfYear));
  }

  const allMeetingsQuery = query(meetingsCollectionRef, ...baseQueryConstraints);
  const allMeetingsSnap = await getDocs(allMeetingsQuery);
  const yearsSet = new Set<number>();
  allMeetingsSnap.docs.forEach(docSnap => {
    const m = dataFromSnapshot<Meeting>(docSnap);
    if (m && m.dateTime && m.dateTime instanceof Date && !isNaN(m.dateTime.getTime())) {
      yearsSet.add(m.dateTime.getFullYear());
    }
  });
  const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

  const countQuery = query(meetingsCollectionRef, ...baseQueryConstraints);
  const totalCountSnapshot = await getCountFromServer(countQuery);
  const totalCount = totalCountSnapshot.data().count;

  let qConstraints = [orderBy('dateTime', 'desc'), ...baseQueryConstraints];
  let finalQuery = query(meetingsCollectionRef, ...qConstraints as any);

  if (limitParam && page > 1) {
    const docsToSkip = (page - 1) * limitParam;
    let skipperQueryConstraints = [orderBy('dateTime', 'desc'), ...baseQueryConstraints, firestoreLimit(docsToSkip)];
    let skipperQuery = query(meetingsCollectionRef, ...skipperQueryConstraints as any);
    
    const skipperSnapshot = await getDocs(skipperQuery);
    if (skipperSnapshot.docs.length > 0 && skipperSnapshot.docs.length === docsToSkip) {
      finalQuery = query(meetingsCollectionRef, ...qConstraints as any, firestoreStartAfter(skipperSnapshot.docs[skipperSnapshot.docs.length - 1]));
    } else if (skipperSnapshot.docs.length < docsToSkip) {
        return { meetings: [], totalCount, availableYears };
    }
  }

  if (limitParam) {
    finalQuery = query(finalQuery, firestoreLimit(limitParam));
  }

  const snapshot = await getDocs(finalQuery);
  const meetings = arrayFromSnapshot<Meeting>(snapshot);
  return { meetings, totalCount, availableYears };
};

export const getMeetingById = async (id: string): Promise<Meeting | undefined> => {
  if (!id) return undefined;
  const meetingDocRef = doc(db, MEETINGS_COLLECTION, id);
  const snapshot = await getDoc(meetingDocRef);
  return dataFromSnapshot<Meeting>(snapshot);
};

export const addMeeting = async (meetingData: Omit<Meeting, 'id' | 'createdAt' | 'isSettled' | 'isShareEnabled' | 'shareToken' | 'shareExpiryDate'>): Promise<Meeting> => {
  const dataToStore = {
    ...meetingData,
    dateTime: Timestamp.fromDate(new Date(meetingData.dateTime)),
    endTime: meetingData.endTime ? Timestamp.fromDate(new Date(meetingData.endTime)) : null,
    createdAt: Timestamp.now(),
    isSettled: false,
    isShareEnabled: false,
    shareToken: null,
    shareExpiryDate: null,
    nonReserveFundParticipants: meetingData.nonReserveFundParticipants || [],
    useReserveFund: meetingData.useReserveFund || false,
    partialReserveFundAmount: meetingData.partialReserveFundAmount === undefined ? deleteField() : Number(meetingData.partialReserveFundAmount),
  };

  const meetingsCollectionRef = collection(db, MEETINGS_COLLECTION);
  const docRef = await addDoc(meetingsCollectionRef, dataToStore);
  const newMeetingDocSnap = await getDoc(docRef);
  return dataFromSnapshot<Meeting>(newMeetingDocSnap)!;
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
     updateData.partialReserveFundAmount = updates.partialReserveFundAmount === undefined ? deleteField() : Number(updates.partialReserveFundAmount);
  }
  if (updates.hasOwnProperty('shareExpiryDate')) {
    updateData.shareExpiryDate = updates.shareExpiryDate ? Timestamp.fromDate(new Date(updates.shareExpiryDate)) : null;
  }
   if (updates.hasOwnProperty('shareToken')) {
    updateData.shareToken = updates.shareToken === undefined ? null : updates.shareToken;
  }
  if (updates.hasOwnProperty('isShareEnabled') && updates.isShareEnabled === false) {
    updateData.shareToken = null;
    updateData.shareExpiryDate = null;
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
  expensesSnapshot.forEach(expenseDoc => batch.delete(expenseDoc.ref));

  await dbRevertMeetingDeduction(id, batch);

  batch.delete(meetingDocRef);
  await batch.commit();
};

export const getMeetingByShareToken = async (token: string): Promise<Meeting | undefined> => {
  if (!token) return undefined;
  const meetingsCollectionRef = collection(db, MEETINGS_COLLECTION);
  const q = query(meetingsCollectionRef, where('shareToken', '==', token), where('isShareEnabled', '==', true));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return undefined;

  const meetingDoc = snapshot.docs[0];
  const meeting = dataFromSnapshot<Meeting>(meetingDoc);

  if (meeting && meeting.shareExpiryDate) {
    if (meeting.shareExpiryDate < new Date()) {
      return undefined; // Expired
    }
  }
  return meeting;
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
  const newExpenseDocSnap = await getDoc(docRef);
  return dataFromSnapshot<Expense>(newExpenseDocSnap)!;
};

export const updateExpense = async (meetingId: string, expenseId: string, updates: Partial<Omit<Expense, 'id' | 'createdAt' | 'meetingId'>>): Promise<Expense | null> => {
  if (!meetingId || !expenseId) return null;
  const expenseDocRef = doc(db, MEETINGS_COLLECTION, meetingId, EXPENSES_SUBCOLLECTION, expenseId);
  await updateDoc(expenseDocRef, updates);
  const updatedSnapshot = await getDoc(expenseDocRef);
  return dataFromSnapshot<Expense>(updatedSnapshot) || null;
};

export const deleteExpense = async (meetingId: string, expenseId: string ): Promise<void> => {
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
  const q = query(transactionsCollectionRef, orderBy('date', 'desc'));
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<ReserveFundTransaction>(snapshot);
};

export const dbSetReserveFundBalance = async (newBalance: number, description?: string): Promise<void> => {
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
    date: new Date(), // JS Date, Firestore converts
  };
  const newLogDocRef = doc(collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION));
  batch.set(newLogDocRef, {
    ...logEntry,
    date: Timestamp.fromDate(logEntry.date) // Store as Timestamp
  });
  await batch.commit();
};

export const dbRecordMeetingDeduction = async (meetingId: string, meetingName: string, amountDeducted: number, date: Date, batch?: any): Promise<void> => {
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
    date: date, // JS Date
    meetingId: meetingId,
  };
  const newLogDocRef = doc(collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION));
  currentBatch.set(newLogDocRef, {
    ...logEntry,
    date: Timestamp.fromDate(logEntry.date) // Store as Timestamp
  });

  if (!useExistingBatch) {
    await currentBatch.commit();
  }
};

export const dbRevertMeetingDeduction = async (meetingId: string, batch?: any): Promise<void> => {
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

