import type { User, Friend, Meeting, Expense, ReserveFundTransaction, FriendGroup } from './types';
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
  FieldPath,
  QueryConstraint, // QueryConstraint import
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

// Firestore 컬렉션 및 서브컬렉션 이름 상수
export const USERS_COLLECTION = 'users';
export const FRIENDS_COLLECTION = 'friends';
export const MEETINGS_COLLECTION = 'meetings';
export const EXPENSES_SUBCOLLECTION = 'expenses';
export const RESERVE_FUND_CONFIG_COLLECTION = 'reserveFundConfig';
export const RESERVE_FUND_BALANCE_DOC_ID = 'balance';
export const RESERVE_FUND_TRANSACTIONS_COLLECTION = 'reserveFundTransactions';

// Firestore Timestamps를 JS Date 객체로 변환하는 헬퍼 함수
const convertTimestampsToDates = (data: DocumentData): DocumentData => {
  const processedData: Record<string, any> = { ...data }; // 'any' 대신 Record<string, any> 사용
  const dateFields: string[] = ['createdAt', 'dateTime', 'endTime', 'date', 'shareExpiryDate'];

  for (const field of dateFields) {
    if (processedData.hasOwnProperty(field) && processedData[field] instanceof Timestamp) {
      processedData[field] = (processedData[field] as Timestamp).toDate();
    } else if (processedData.hasOwnProperty(field) && processedData[field] === null) {
      processedData[field] = null;
    } else if (processedData.hasOwnProperty(field) && typeof processedData[field] === 'string') {
      const parsedDate = new Date(processedData[field]);
      if (!isNaN(parsedDate.getTime())) {
        processedData[field] = parsedDate;
      }
    }
  }
  return processedData;
};

// Firestore DocumentSnapshot으로부터 타입에 맞는 데이터를 추출하는 헬퍼 함수
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
      role: 'none',
      createdAt: new Date(),
    };
    await setDoc(userDocRef, {
      ...newUser,
      createdAt: Timestamp.fromDate(newUser.createdAt)
    });

    return newUser;
  }
  const existingUser = dataFromSnapshot<User>(userSnap);
  if (!existingUser) {
    throw new Error("Failed to process existing user data after login.");
  }
  return existingUser;
};

export const updateUser = async (userId: string, updates: Partial<Omit<User, 'id' | 'createdAt'> & { friendGroupIds?: string[] }>): Promise<User | null> => {
  const userDocRef = doc(db, USERS_COLLECTION, userId);
  await updateDoc(userDocRef, updates);
  const updatedSnapshot = await getDoc(userDocRef);
  return dataFromSnapshot<User>(updatedSnapshot) || null;
};

export const getUsers = async (): Promise<User[]> => {
  const usersCollectionRef = collection(db, USERS_COLLECTION);
  const q = query(usersCollectionRef, orderBy('name', 'asc'));
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<User>(snapshot);
};

// --- 친구 관련 함수 ---
export const getFriends = async (): Promise<Friend[]> => {
  const friendsCollectionRef = collection(db, FRIENDS_COLLECTION);
  const q = query(friendsCollectionRef, orderBy('name', 'asc'));
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

// 그룹별 친구 목록을 가져오는 함수
export const getFriendsByGroup = async (groupId: string): Promise<Friend[]> => {
  try {
    if (!groupId || typeof groupId !== 'string') throw new Error('유효하지 않은 그룹 ID입니다.');
    const friendsCollectionRef = collection(db, FRIENDS_COLLECTION);
    const q = query(friendsCollectionRef, where('groupId', '==', groupId));
    const snapshot = await getDocs(q);
    const friends = arrayFromSnapshot<Friend>(snapshot);
    return friends.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error('getFriendsByGroup 오류:', err);
    throw err;
  }
};

// --- Meeting functions ---
interface GetMeetingsParams {
  year?: number;
  limitParam?: number;
  page?: number;
  userId?: string;
  userFriendGroupIds?: string[];
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
  userId,
  userFriendGroupIds,
}: GetMeetingsParams = {}): Promise<GetMeetingsResult> => {
  const meetingsCollectionRef = collection(db, MEETINGS_COLLECTION);

  let yearFilterForAvailableYears: QueryConstraint[] = [];
  if (year) {
    const startOfYear = Timestamp.fromDate(new Date(year, 0, 1));
    const endOfYear = Timestamp.fromDate(new Date(year + 1, 0, 1));
    yearFilterForAvailableYears.push(where('dateTime', '>=', startOfYear));
    yearFilterForAvailableYears.push(where('dateTime', '<', endOfYear));
  }
  const availableYearsQuery = query(meetingsCollectionRef, ...yearFilterForAvailableYears);
  const availableYearsSnap = await getDocs(availableYearsQuery);
  const yearsSet = new Set<number>();
  availableYearsSnap.docs.forEach(docSnap => {
    const m = dataFromSnapshot<Meeting>(docSnap);
    if (m && m.dateTime && m.dateTime instanceof Date && !isNaN(m.dateTime.getTime())) {
      yearsSet.add(m.dateTime.getFullYear());
    }
  });
  const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

  let dateConstraints: QueryConstraint[] = [];
  if (year) {
    const startOfYear = Timestamp.fromDate(new Date(year, 0, 1));
    const endOfYear = Timestamp.fromDate(new Date(year + 1, 0, 1));
    dateConstraints.push(where('dateTime', '>=', startOfYear));
    dateConstraints.push(where('dateTime', '<', endOfYear));
  }

  let fetchedMeetings: Meeting[] = [];
  const meetingIds = new Set<string>();

  if (userId || (userFriendGroupIds && userFriendGroupIds.length > 0)) {
    if (userId) {
      const userMeetingsQuery = query(meetingsCollectionRef, where('creatorId', '==', userId), ...dateConstraints);
      const userMeetingsSnap = await getDocs(userMeetingsQuery);
      arrayFromSnapshot<Meeting>(userMeetingsSnap).forEach(m => {
        if (!meetingIds.has(m.id)) {
          fetchedMeetings.push(m);
          meetingIds.add(m.id);
        }
      });
    }

    if (userFriendGroupIds && userFriendGroupIds.length > 0) {
      const validGroupIds = userFriendGroupIds.filter(id => typeof id === 'string' && id.length > 0);
      if (validGroupIds.length > 0) {
        const MAX_IN_QUERIES = 30;
        const chunks = [];
        for (let i = 0; i < validGroupIds.length; i += MAX_IN_QUERIES) {
          chunks.push(validGroupIds.slice(i, i + MAX_IN_QUERIES));
        }
        for (const chunk of chunks) {
          if (chunk.length > 0) {
            const groupMeetingsQuery = query(meetingsCollectionRef, where('groupId', 'in', chunk), ...dateConstraints);
            const groupMeetingsSnap = await getDocs(groupMeetingsQuery);
            arrayFromSnapshot<Meeting>(groupMeetingsSnap).forEach(m => {
              if (!meetingIds.has(m.id)) {
                fetchedMeetings.push(m);
                meetingIds.add(m.id);
              }
            });
          }
        }
      }
    }
    fetchedMeetings.sort((a, b) => (b.dateTime?.getTime() || 0) - (a.dateTime?.getTime() || 0));

  } else {
    let qConstraints: QueryConstraint[] = [orderBy('dateTime', 'desc'), ...dateConstraints];
    let finalQuery = query(meetingsCollectionRef, ...qConstraints);

    const countQueryForPagination = query(meetingsCollectionRef, ...dateConstraints);
    const totalCountSnapshotForPagination = await getCountFromServer(countQueryForPagination);
    const totalCountForPagination = totalCountSnapshotForPagination.data().count;

    if (limitParam && page > 1) {
      const docsToSkip = (page - 1) * limitParam;
      let skipperQueryConstraints: QueryConstraint[] = [orderBy('dateTime', 'desc'), ...dateConstraints, firestoreLimit(docsToSkip)];
      let skipperQuery = query(meetingsCollectionRef, ...skipperQueryConstraints);

      const skipperSnapshot = await getDocs(skipperQuery);
      if (skipperSnapshot.docs.length > 0 && skipperSnapshot.docs.length === docsToSkip) {
        finalQuery = query(meetingsCollectionRef, ...qConstraints, firestoreStartAfter(skipperSnapshot.docs[skipperSnapshot.docs.length - 1]));
      } else if (skipperSnapshot.docs.length < docsToSkip) {
         return { meetings: [], totalCount: totalCountForPagination, availableYears };
      }
    }
    if (limitParam) {
      finalQuery = query(finalQuery, firestoreLimit(limitParam));
    }
    const snapshot = await getDocs(finalQuery);
    fetchedMeetings = arrayFromSnapshot<Meeting>(snapshot);
    return { meetings: fetchedMeetings, totalCount: totalCountForPagination, availableYears };
  }

  const totalCount = fetchedMeetings.length;

  let paginatedMeetings = fetchedMeetings;
  if (limitParam) {
    const startIndex = (page - 1) * limitParam;
    paginatedMeetings = fetchedMeetings.slice(startIndex, startIndex + limitParam);
  }

  return { meetings: paginatedMeetings, totalCount, availableYears };
};

export const getMeetingById = async (id: string): Promise<Meeting | undefined> => {
  if (!id) return undefined;
  const meetingDocRef = doc(db, MEETINGS_COLLECTION, id);
  const snapshot = await getDoc(meetingDocRef);
  return dataFromSnapshot<Meeting>(snapshot);
};

// actions.ts에서 createMeetingAction의 meetingDataToSave 타입과 호환되도록,
// 또는 db에 저장될 최종 형태와 가깝도록 타입을 정의합니다.
// 여기서는 DocumentData를 사용하고, 함수 내부에서 필드를 구체적으로 다룹니다.
export const addMeeting = async (
  meetingPayloadFromAction: Partial<Omit<Meeting, 'id' | 'createdAt' | 'isSettled' | 'isShareEnabled' | 'shareToken' | 'shareExpiryDate' | 'expenses'>> &
                            { creatorId: string; dateTime: Date | Timestamp }
): Promise<Meeting> => {

  const dataToStore: DocumentData = { // 'any' 대신 DocumentData 사용
    isSettled: false,
    isShareEnabled: false,
    shareToken: null,
    shareExpiryDate: null,
    expenses: [],
    participantIds: [],
    nonReserveFundParticipants: [],
    useReserveFund: false,

    ...meetingPayloadFromAction,

    dateTime: meetingPayloadFromAction.dateTime instanceof Date
                ? Timestamp.fromDate(meetingPayloadFromAction.dateTime)
                : meetingPayloadFromAction.dateTime,

    endTime: meetingPayloadFromAction.endTime
             ? (meetingPayloadFromAction.endTime instanceof Date
                ? Timestamp.fromDate(meetingPayloadFromAction.endTime)
                : meetingPayloadFromAction.endTime)
             : null,
    createdAt: Timestamp.now(),
  };

  if (dataToStore.partialReserveFundAmount !== undefined) {
    dataToStore.partialReserveFundAmount = Number(dataToStore.partialReserveFundAmount);
  }
  if (dataToStore.totalFee !== undefined) {
    dataToStore.totalFee = Number(dataToStore.totalFee);
  }
  if (dataToStore.feePerPerson !== undefined) {
    dataToStore.feePerPerson = Number(dataToStore.feePerPerson);
  }

  if (dataToStore.isTemporary) {
    dataToStore.participantIds = meetingPayloadFromAction.temporaryParticipants || [];
    dataToStore.useReserveFund = false;
    const fieldsToRemoveForTemp = ['partialReserveFundAmount', 'nonReserveFundParticipants'];
    fieldsToRemoveForTemp.forEach(f => delete dataToStore[f]);
  } else {
    const fieldsToRemoveForRegular = ['temporaryParticipants', 'totalFee', 'feePerPerson'];
    fieldsToRemoveForRegular.forEach(f => delete dataToStore[f]);
    if (dataToStore.useReserveFund && dataToStore.partialReserveFundAmount === undefined) {
      dataToStore.partialReserveFundAmount = 0;
    }
  }

  Object.keys(dataToStore).forEach(key => {
    if (dataToStore[key] === undefined) {
      delete dataToStore[key];
    }
  });

  const meetingsCollectionRef = collection(db, MEETINGS_COLLECTION);
  const docRef = await addDoc(meetingsCollectionRef, dataToStore); // DocumentData로 단언 제거
  const newMeetingDocSnap = await getDoc(docRef);
  return dataFromSnapshot<Meeting>(newMeetingDocSnap)!;
};

export const updateMeeting = async (id: string, updates: Partial<Omit<Meeting, 'id' | 'createdAt'>>): Promise<Meeting | null> => {
  const meetingDocRef = doc(db, MEETINGS_COLLECTION, id);
  const updateData: DocumentData = { ...updates }; // 'any' 대신 DocumentData 사용

  if (updates.dateTime) {
    updateData.dateTime = Timestamp.fromDate(new Date(updates.dateTime));
  }
  if (updates.hasOwnProperty('endTime')) {
    updateData.endTime = updates.endTime ? Timestamp.fromDate(new Date(updates.endTime)) : null;
  }
  if (updates.hasOwnProperty('partialReserveFundAmount')) {
    if (updates.partialReserveFundAmount === undefined) {
      updateData.partialReserveFundAmount = deleteField();
    } else {
      updateData.partialReserveFundAmount = Number(updates.partialReserveFundAmount);
    }
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
  if (updates.hasOwnProperty('memo')) {
    if (updates.memo === undefined) {
      updateData.memo = deleteField();
    } else {
      updateData.memo = updates.memo;
    }
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
      return undefined; // 토큰 만료
    }
  }
  return meeting;
};

// --- 지출 관련 함수 ---
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

// --- 회비 관련 함수 ---
export const getReserveFundBalance = async (groupId: string): Promise<number|null> => {
  if (!groupId) {
    console.error("getReserveFundBalance: groupId가 제공되지 않았습니다.");
    return null;
  }
  const balanceDocRef = doc(db, RESERVE_FUND_CONFIG_COLLECTION, `balance_${groupId}`);
  const balanceSnap = await getDoc(balanceDocRef);
  if (balanceSnap.exists()) {
    const data = balanceSnap.data();
    if (typeof data?.balance === 'number') {
      return data.balance;
    } else {
      return null;
    }
  }
  try {
    await setDoc(balanceDocRef, { balance: 0 }, { merge: true });
    return 0;
  } catch (error) {
      console.error(`그룹 [${groupId}] 회비 잔액 문서 초기화 오류:`, error);
      return null;
  }
};

export const getLoggedReserveFundTransactions = async (limitCount: number = 5): Promise<ReserveFundTransaction[]> => {
  const transactionsCollectionRef = collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION);
  const q = query(transactionsCollectionRef, orderBy('date', 'desc'), firestoreLimit(limitCount));
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<ReserveFundTransaction>(snapshot);
};

export const dbSetReserveFundBalance = async (groupId: string, newBalance: number, description?: string): Promise<void> => {
  const batch = writeBatch(db);
  const balanceDocRef = doc(db, 'reserveFundConfig', `balance_${groupId}`);

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
    date: new Date(),
    groupId,
  };
  const newLogDocRef = doc(collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION));
  batch.set(newLogDocRef, {
    ...logEntry,
    date: Timestamp.fromDate(logEntry.date)
  });
  await batch.commit();
};

export const dbRecordMeetingDeduction = async (groupId: string, meetingId: string, meetingName: string, amountDeducted: number, date: Date, batch?: any): Promise<void> => {
  if (amountDeducted <= 0.001) return;

  const useExistingBatch = !!batch;
  const currentBatch = useExistingBatch ? batch : writeBatch(db);
  const balanceDocRef = doc(db, RESERVE_FUND_CONFIG_COLLECTION, `balance_${groupId}`);

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
    date: date,
    meetingId: meetingId,
    groupId,
  };
  const newLogDocRef = doc(collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION));
  currentBatch.set(newLogDocRef, {
    ...logEntry,
    date: Timestamp.fromDate(logEntry.date)
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
  let groupIdForBalanceUpdate: string | undefined;

  if (!snapshot.empty) {
    const firstTxData = snapshot.docs[0].data() as Partial<ReserveFundTransaction>;
    groupIdForBalanceUpdate = firstTxData.groupId;

    if (!groupIdForBalanceUpdate) {
      console.error(`dbRevertMeetingDeduction: meetingId ${meetingId}에 대한 트랜잭션 로그에서 groupId를 찾을 수 없습니다.`);
      return;
    }

    snapshot.forEach(txDoc => {
      const txData = txDoc.data() as Partial<ReserveFundTransaction>;
      if (txData.amount && typeof txData.amount === 'number') {
        totalRevertedAmount += Math.abs(txData.amount);
      }
      currentBatch.delete(txDoc.ref);
    });

    if (totalRevertedAmount > 0.001) {
      const balanceDocRef = doc(db, RESERVE_FUND_CONFIG_COLLECTION, `balance_${groupIdForBalanceUpdate}`);
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

// --- 친구 그룹 관련 함수 ---
export const getFriendGroupsByUser = async (userId: string): Promise<FriendGroup[]> => {
  if (!userId) return [];

  const user = await getUserById(userId);

  const groupsCollectionRef = collection(db, 'friendGroups');
  let allGroups: FriendGroup[] = [];
  const groupIds = new Set<string>();

  const ownedGroupsQuery = query(groupsCollectionRef, where('ownerUserId', '==', userId), orderBy('createdAt', 'asc'));
  const ownedGroupsSnapshot = await getDocs(ownedGroupsQuery);
  const ownedGroups = arrayFromSnapshot<FriendGroup>(ownedGroupsSnapshot);
  ownedGroups.forEach(group => {
    if (!groupIds.has(group.id)) {
      allGroups.push(group);
      groupIds.add(group.id);
    }
  });

  const friendGroupIds = user?.friendGroupIds?.filter(id => typeof id === 'string' && id.length > 0);

  if (friendGroupIds && friendGroupIds.length > 0) {
    const MAX_IN_QUERIES = 30;
    const chunks = [];
    for (let i = 0; i < friendGroupIds.length; i += MAX_IN_QUERIES) {
      chunks.push(friendGroupIds.slice(i, i + MAX_IN_QUERIES));
    }

    for (const chunk of chunks) {
      if (chunk.length > 0) {
        const referencedGroupsQuery = query(groupsCollectionRef, where(new FieldPath('__name__'), 'in', chunk));
        const referencedGroupsSnapshot = await getDocs(referencedGroupsQuery);
        const referencedGroups = arrayFromSnapshot<FriendGroup>(referencedGroupsSnapshot);
        referencedGroups.forEach(group => {
          if (!groupIds.has(group.id)) {
            allGroups.push(group);
            groupIds.add(group.id);
          }
        });
      }
    }
  }
  allGroups.sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
  return allGroups;
};

export const addFriendGroup = async (groupData: Omit<FriendGroup, 'id' | 'createdAt'>): Promise<FriendGroup> => {
  const newGroupData = {
    ...groupData,
    createdAt: new Date(),
  };
  const groupsCollectionRef = collection(db, 'friendGroups');
  const docRef = await addDoc(groupsCollectionRef, {
    ...newGroupData,
    createdAt: Timestamp.fromDate(newGroupData.createdAt)
  });
  return { ...newGroupData, id: docRef.id };
};

export const updateFriendGroup = async (id: string, updates: Partial<Omit<FriendGroup, 'id' | 'createdAt'>>): Promise<FriendGroup | null> => {
  const groupDocRef = doc(db, 'friendGroups', id);
  await updateDoc(groupDocRef, updates);
  const updatedSnapshot = await getDoc(groupDocRef);
  return dataFromSnapshot<FriendGroup>(updatedSnapshot) || null;
};

export const deleteFriendGroup = async (id: string): Promise<void> => {
  const groupDocRef = doc(db, 'friendGroups', id);
  await deleteDoc(groupDocRef);
};

// --- 그룹별 회비 관리 함수 ---
export const getReserveFundBalanceByGroup = async (groupId: string): Promise<number|null> => {
  const balanceDocRef = doc(db, 'reserveFundConfig', `balance_${groupId}`);
  const balanceSnap = await getDoc(balanceDocRef);
  if (balanceSnap.exists()) {
    const data = balanceSnap.data();
    if (typeof data?.balance === 'number') {
      return data.balance;
    } else {
      return null;
    }
  }
  try {
    await setDoc(balanceDocRef, { balance: 0 }, { merge: true });
    return 0;
  } catch (error) {
    console.error(`그룹 [${groupId}] 회비 잔액 문서 초기화 오류:`, error);
    return null;
  }
};

export const getLoggedReserveFundTransactionsByGroup = async (groupId: string, limitCount: number = 5): Promise<ReserveFundTransaction[]> => {
  const transactionsCollectionRef = collection(db, 'reserveFundTransactions');
  const q = query(transactionsCollectionRef, where('groupId', '==', groupId), orderBy('date', 'desc'), firestoreLimit(limitCount));
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<ReserveFundTransaction>(snapshot);
};

// --- 모든 친구 그룹 조회 함수 ---
export const dbGetAllFriendGroups = async (): Promise<FriendGroup[]> => {
  const groupsCollectionRef = collection(db, 'friendGroups');
  const q = query(groupsCollectionRef, orderBy('name', 'asc'));
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<FriendGroup>(snapshot);
};
