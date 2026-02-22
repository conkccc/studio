import type { User, FriendGroup, ReserveFundTransaction } from '../types';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
  setDoc,
  FieldPath,
  limit as firestoreLimit,
  DocumentData,
  DocumentSnapshot,
  QuerySnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';

export const USERS_COLLECTION = 'users';
export const FRIEND_GROUPS_COLLECTION = 'friendGroups';
export const RESERVE_FUND_CONFIG_COLLECTION = 'reserveFundConfig';
export const RESERVE_FUND_TRANSACTIONS_COLLECTION = 'reserveFundTransactions';

const convertTimestampsToDates = (data: DocumentData): DocumentData => {
  const processedData: Record<string, unknown> = { ...data };
  const dateFields: string[] = ['createdAt', 'dateTime', 'endTime', 'date', 'shareExpiryDate', 'submittedAt'];

  for (const field of dateFields) {
    if (!Object.prototype.hasOwnProperty.call(processedData, field)) {
      continue;
    }
    const value = processedData[field];
    if (value instanceof Timestamp) {
      processedData[field] = value.toDate();
    } else if (value === null) {
      processedData[field] = null;
    } else if (typeof value === 'string') {
      const parsedDate = new Date(value);
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

export const getFriendGroupsByUser = async (userId: string): Promise<FriendGroup[]> => {
  if (!userId) return [];

  const user = await getUserById(userId);

  const groupsCollectionRef = collection(db, FRIEND_GROUPS_COLLECTION);
  const allGroups: FriendGroup[] = [];
  const groupIdsProcessed = new Set<string>();

  const ownedGroupsQuery = query(groupsCollectionRef, where('ownerUserId', '==', userId), orderBy('createdAt', 'asc'));
  const ownedGroupsSnapshot = await getDocs(ownedGroupsQuery);
  arrayFromSnapshot<FriendGroup>(ownedGroupsSnapshot).forEach(group => {
    if (!groupIdsProcessed.has(group.id)) {
      allGroups.push(group);
      groupIdsProcessed.add(group.id);
    }
  });

  const friendGroupIdsFromUser = user?.friendGroupIds?.filter(id => typeof id === 'string' && id.length > 0);

  if (friendGroupIdsFromUser && friendGroupIdsFromUser.length > 0) {
    const MAX_IN_QUERIES = 10;
    const idChunks = [] as string[][];
    for (let i = 0; i < friendGroupIdsFromUser.length; i += MAX_IN_QUERIES) {
      idChunks.push(friendGroupIdsFromUser.slice(i, i + MAX_IN_QUERIES));
    }

    for (const chunk of idChunks) {
      if (chunk.length > 0) {
        const referencedGroupsQuery = query(groupsCollectionRef, where(new FieldPath('__name__'), 'in', chunk));
        const referencedGroupsSnapshot = await getDocs(referencedGroupsQuery);
        arrayFromSnapshot<FriendGroup>(referencedGroupsSnapshot).forEach(group => {
          if (!groupIdsProcessed.has(group.id)) {
            allGroups.push(group);
            groupIdsProcessed.add(group.id);
          }
        });
      }
    }
  }

  allGroups.sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
  return allGroups;
};

export const updateFriendGroup = async (id: string, updates: Partial<Omit<FriendGroup, 'id' | 'createdAt'>>): Promise<FriendGroup | null> => {
  const groupDocRef = doc(db, FRIEND_GROUPS_COLLECTION, id);
  await updateDoc(groupDocRef, updates);
  const updatedSnapshot = await getDoc(groupDocRef);
  return dataFromSnapshot<FriendGroup>(updatedSnapshot) || null;
};

export const getReserveFundBalance = async (groupId: string): Promise<number|null> => {
  if (!groupId || groupId.trim() === '') {
    console.error("getReserveFundBalance: 유효하지 않은 groupId가 제공되었습니다.");
    return null;
  }
  const balanceDocRef = doc(db, RESERVE_FUND_CONFIG_COLLECTION, `balance_${groupId}`);
  try {
    const balanceSnap = await getDoc(balanceDocRef);
    if (balanceSnap.exists()) {
      const data = balanceSnap.data();
      if (typeof data?.balance === 'number') {
        return data.balance;
      } else {
        console.warn(`getReserveFundBalance: groupId [${groupId}]의 balance 필드가 유효하지 않거나 없습니다. 기본값 0을 반환합니다.`);
        return 0;
      }
    } else {
      try {
        await setDoc(balanceDocRef, { balance: 0 }, { merge: true });
        return 0;
      } catch (setDocError) {
        console.error(`getReserveFundBalance: groupId [${groupId}]에 대한 잔액 문서 생성 실패:`, setDocError);
        return null;
      }
    }
  } catch (error) {
    console.error(`getReserveFundBalance: groupId [${groupId}]의 잔액 조회 중 오류 발생:`, error);
    return null;
  }
};

export const getLoggedReserveFundTransactionsByGroup = async (groupId: string, limitCount: number = 5): Promise<ReserveFundTransaction[]> => {
  const transactionsCollectionRef = collection(db, RESERVE_FUND_TRANSACTIONS_COLLECTION);
  const q = query(transactionsCollectionRef, where('groupId', '==', groupId), orderBy('date', 'desc'), firestoreLimit(limitCount));
  const snapshot = await getDocs(q);
  return arrayFromSnapshot<ReserveFundTransaction>(snapshot);
};
