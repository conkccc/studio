import 'server-only';
import type { ReserveFundTransaction } from '../types';
import { database, documentData, collectionData, FieldValue } from './shared';

export const RESERVE_FUND_CONFIG_COLLECTION = 'reserveFundConfig';
export const RESERVE_FUND_BALANCE_DOC_ID = 'balance';
export const RESERVE_FUND_TRANSACTIONS_COLLECTION = 'reserveFundTransactions';

export async function getReserveFundBalance(groupId: string): Promise<number | null> {
  if (!groupId) return null;
  const snapshot = await database().collection(RESERVE_FUND_CONFIG_COLLECTION).doc(`balance_${groupId}`).get();
  return snapshot.exists ? Number(snapshot.data()?.balance || 0) : 0;
}

export async function getLoggedReserveFundTransactions(limitCount = 5): Promise<ReserveFundTransaction[]> {
  return collectionData<ReserveFundTransaction>(await database().collection(RESERVE_FUND_TRANSACTIONS_COLLECTION).orderBy('date', 'desc').limit(limitCount).get());
}

export async function getLoggedReserveFundTransactionsByGroup(groupId: string, limitCount = 5): Promise<ReserveFundTransaction[]> {
  return collectionData<ReserveFundTransaction>(await database().collection(RESERVE_FUND_TRANSACTIONS_COLLECTION)
    .where('groupId', '==', groupId).orderBy('date', 'desc').limit(limitCount).get());
}

export async function dbSetReserveFundBalance(groupId: string, newBalance: number, description?: string): Promise<void> {
  const batch = database().batch();
  batch.set(database().collection(RESERVE_FUND_CONFIG_COLLECTION).doc(`balance_${groupId}`), { balance: newBalance }, { merge: true });
  batch.create(database().collection(RESERVE_FUND_TRANSACTIONS_COLLECTION).doc(), {
    type: 'balance_update', amount: newBalance, description: description || `잔액 ${newBalance.toLocaleString()}원으로 설정됨`, date: new Date(), groupId,
  });
  await batch.commit();
}

export async function dbRecordMeetingDeduction(groupId: string, meetingId: string, meetingName: string, amount: number, date: Date): Promise<void> {
  if (amount <= 0) return;
  const batch = database().batch();
  batch.set(database().collection(RESERVE_FUND_CONFIG_COLLECTION).doc(`balance_${groupId}`), { balance: FieldValue.increment(-amount) }, { merge: true });
  batch.create(database().collection(RESERVE_FUND_TRANSACTIONS_COLLECTION).doc(), {
    type: 'meeting_deduction', amount: -amount, description: `모임 (${meetingName}) 회비 사용`, date, groupId, meetingId,
  });
  await batch.commit();
}

export async function dbRevertMeetingDeduction(meetingId: string): Promise<void> {
  const snapshot = await database().collection(RESERVE_FUND_TRANSACTIONS_COLLECTION).where('meetingId', '==', meetingId).where('type', '==', 'meeting_deduction').get();
  for (const transaction of snapshot.docs) {
    await database().runTransaction(async tx => {
      const current = documentData<ReserveFundTransaction>(await tx.get(transaction.ref));
      if (!current?.groupId) return;
      tx.set(database().collection(RESERVE_FUND_CONFIG_COLLECTION).doc(`balance_${current.groupId}`), { balance: FieldValue.increment(Math.abs(current.amount)) }, { merge: true });
      tx.delete(transaction.ref);
    });
  }
}
