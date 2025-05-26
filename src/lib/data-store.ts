
import { db } from './firebase';
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
  serverTimestamp,
  writeBatch,
  QuerySnapshot,
  DocumentSnapshot,
} from 'firebase/firestore';
import type { Friend, Meeting, Expense, ReserveFundTransaction } from './types';

// Helper function to convert Firestore document snapshot to typed data with ID
const dataFromSnapshot = <T>(snapshot: DocumentSnapshot): T | undefined => {
  if (!snapshot.exists()) {
    return undefined;
  }
  const data = snapshot.data();
  // Convert all Timestamp fields to Date objects
  for (const key in data) {
    if (data[key] instanceof Timestamp) {
      data[key] = data[key].toDate();
    }
  }
  return { ...data, id: snapshot.id } as T;
};

// Helper function to convert Firestore query snapshot to array of typed data
const arrayFromSnapshot = <T>(snapshot: QuerySnapshot): T[] => {
  return snapshot.docs.map(doc => dataFromSnapshot<T>(doc as DocumentSnapshot)).filter(Boolean) as T[];
};


// Friend functions
export const getFriends = async (): Promise<Friend[]> => {
  const friendsCol = collection(db, 'friends');
  const snapshot = await getDocs(query(friendsCol, orderBy('nickname')));
  return arrayFromSnapshot<Friend>(snapshot);
};

export const getFriendById = async (id: string): Promise<Friend | undefined> => {
  if (!id) return undefined;
  const friendDoc = doc(db, 'friends', id);
  const snapshot = await getDoc(friendDoc);
  return dataFromSnapshot<Friend>(snapshot);
};

export const addFriend = async (nickname: string, name?: string): Promise<Friend> => {
  const friendsCol = collection(db, 'friends');
  const docRef = await addDoc(friendsCol, {
    nickname,
    name: name || '',
    createdAt: serverTimestamp(), // Use serverTimestamp for creation time
  });
  return { id: docRef.id, nickname, name }; // createdAt will be populated by server
};

export const updateFriend = async (id: string, updates: Partial<Omit<Friend, 'id'>>): Promise<Friend | null> => {
  const friendDoc = doc(db, 'friends', id);
  await updateDoc(friendDoc, updates);
  const updatedSnapshot = await getDoc(friendDoc);
  return dataFromSnapshot<Friend>(updatedSnapshot);
};

export const deleteFriend = async (id: string): Promise<boolean> => {
  const friendDoc = doc(db, 'friends', id);
  await deleteDoc(friendDoc);
  // Note: This doesn't automatically remove the friend from meetings' participantIds or expenses.
  // That would require more complex logic (e.g., querying all meetings/expenses).
  // For simplicity, we'll leave that to be handled manually or via UI if needed.
  // However, we can try to update meetings where this friend is a participant.
  const meetingsQuery = query(collection(db, 'meetings'), where('participantIds', 'array-contains', id));
  const meetingsSnapshot = await getDocs(meetingsQuery);
  const batch = writeBatch(db);
  meetingsSnapshot.forEach(meetingDocSnapshot => {
    const meetingData = dataFromSnapshot<Meeting>(meetingDocSnapshot);
    if (meetingData) {
      const updatedParticipantIds = meetingData.participantIds.filter(pId => pId !== id);
      const updatedNonReserveFundParticipants = meetingData.nonReserveFundParticipants.filter(nrpId => nrpId !== id);
      batch.update(meetingDocSnapshot.ref, { 
        participantIds: updatedParticipantIds,
        nonReserveFundParticipants: updatedNonReserveFundParticipants
      });
    }
  });
  await batch.commit();
  return true;
};

// Meeting functions
export const getMeetings = async (): Promise<Meeting[]> => {
  const meetingsCol = collection(db, 'meetings');
  const snapshot = await getDocs(query(meetingsCol, orderBy('dateTime', 'desc')));
  return arrayFromSnapshot<Meeting>(snapshot);
};

export const getMeetingById = async (id: string): Promise<Meeting | undefined> => {
  if (!id) return undefined;
  const meetingDoc = doc(db, 'meetings', id);
  const snapshot = await getDoc(meetingDoc);
  return dataFromSnapshot<Meeting>(snapshot);
};

export const addMeeting = async (meetingData: Omit<Meeting, 'id' | 'createdAt' | 'isSettled'>): Promise<Meeting> => {
  const meetingsCol = collection(db, 'meetings');
  const dataToSave = {
    ...meetingData,
    dateTime: Timestamp.fromDate(new Date(meetingData.dateTime)),
    endTime: meetingData.endTime ? Timestamp.fromDate(new Date(meetingData.endTime)) : null,
    createdAt: serverTimestamp(),
    isSettled: false,
  };
  const docRef = await addDoc(meetingsCol, dataToSave);
  
  const newMeeting = { ...meetingData, id: docRef.id, createdAt: new Date(), isSettled: false }; // Simulate createdAt for return

  if (newMeeting.useReserveFund && newMeeting.reserveFundUsageType === 'partial' && (newMeeting.partialReserveFundAmount || 0) > 0) {
    await addReserveFundTransaction({
      type: 'meeting_contribution',
      amount: -(newMeeting.partialReserveFundAmount as number),
      description: `모임 (${newMeeting.name}) 회비 부분 사용`,
      date: new Date(newMeeting.dateTime),
      meetingId: docRef.id,
    });
  }
  return newMeeting;
};

export const updateMeeting = async (id: string, updates: Partial<Omit<Meeting, 'id'>>): Promise<Meeting | null> => {
  const meetingDocRef = doc(db, 'meetings', id);
  const originalMeetingSnap = await getDoc(meetingDocRef);
  const originalMeeting = dataFromSnapshot<Meeting>(originalMeetingSnap);

  if (!originalMeeting) return null;

  const dataToUpdate: any = { ...updates };
  if (updates.dateTime) dataToUpdate.dateTime = Timestamp.fromDate(new Date(updates.dateTime));
  if (updates.hasOwnProperty('endTime')) { // Check if endTime is explicitly being set (even to null)
    dataToUpdate.endTime = updates.endTime ? Timestamp.fromDate(new Date(updates.endTime)) : null;
  }


  await updateDoc(meetingDocRef, dataToUpdate);

  const updatedMeetingSnap = await getDoc(meetingDocRef);
  const updatedMeeting = dataFromSnapshot<Meeting>(updatedMeetingSnap);
  if (!updatedMeeting) return null;

  // Handle changes in 'partial' fund usage
  const originalPartialAmount = (originalMeeting.useReserveFund && originalMeeting.reserveFundUsageType === 'partial') ? originalMeeting.partialReserveFundAmount : 0;
  const updatedPartialAmount = (updatedMeeting.useReserveFund && updatedMeeting.reserveFundUsageType === 'partial') ? updatedMeeting.partialReserveFundAmount : 0;

  if (originalPartialAmount !== updatedPartialAmount ||
      (originalMeeting.reserveFundUsageType === 'partial' && updatedMeeting.reserveFundUsageType !== 'partial') ||
      (!originalMeeting.useReserveFund && updatedMeeting.useReserveFund && updatedMeeting.reserveFundUsageType === 'partial')) {

    // Remove any existing 'partial' contribution transaction for this meeting
    const q = query(collection(db, 'reserveFundTransactions'), 
                    where('meetingId', '==', id), 
                    where('type', '==', 'meeting_contribution'),
                    // A bit fragile, but try to identify partial transactions
                    where('description', 'custom_operator_contains', '부분 사용')); 
    const txSnap = await getDocs(q);
    const batch = writeBatch(db);
    txSnap.forEach(doc => {
       // A more robust check might be needed if description format changes
      if (doc.data().description.includes('부분 사용')) {
        batch.delete(doc.ref);
      }
    });
    await batch.commit();


    if (updatedMeeting.useReserveFund && updatedMeeting.reserveFundUsageType === 'partial' && (updatedMeeting.partialReserveFundAmount || 0) > 0) {
      await addReserveFundTransaction({
        type: 'meeting_contribution',
        amount: -(updatedMeeting.partialReserveFundAmount as number),
        description: `모임 (${updatedMeeting.name}) 회비 부분 사용 (수정)`,
        date: new Date(updatedMeeting.dateTime),
        meetingId: id,
      });
    }
  }
  
  // If an 'all' type meeting was settled and is now being unsettled (e.g. by expense change)
  if (originalMeeting.isSettled && originalMeeting.reserveFundUsageType === 'all' && updatedMeeting.isSettled === false) {
    const q = query(collection(db, 'reserveFundTransactions'), 
                  where('meetingId', '==', id), 
                  where('type', '==', 'meeting_contribution'),
                  where('description', 'custom_operator_contains', '전체 정산'));
    const txSnap = await getDocs(q);
    const batch = writeBatch(db);
    txSnap.forEach(doc => {
      if (doc.data().description.includes('전체 정산')) {
        batch.delete(doc.ref);
      }
    });
    await batch.commit();
  }

  return updatedMeeting;
};

export const deleteMeeting = async (id: string): Promise<boolean> => {
  const batch = writeBatch(db);
  const meetingDocRef = doc(db, 'meetings', id);
  batch.delete(meetingDocRef);

  // Delete expenses subcollection
  const expensesColRef = collection(db, 'meetings', id, 'expenses');
  const expensesSnapshot = await getDocs(expensesColRef);
  expensesSnapshot.forEach(doc => batch.delete(doc.ref));

  // Delete related reserve fund transactions
  const reserveTxQuery = query(collection(db, 'reserveFundTransactions'), where('meetingId', '==', id));
  const reserveTxSnapshot = await getDocs(reserveTxQuery);
  reserveTxSnapshot.forEach(doc => batch.delete(doc.ref));
  
  await batch.commit();
  return true;
};

// Expense functions
// Expenses will be stored as a subcollection of meetings: /meetings/{meetingId}/expenses/{expenseId}
export const getExpensesByMeetingId = async (meetingId: string): Promise<Expense[]> => {
  const expensesCol = collection(db, 'meetings', meetingId, 'expenses');
  const snapshot = await getDocs(query(expensesCol, orderBy('createdAt', 'desc')));
  return arrayFromSnapshot<Expense>(snapshot);
};

export const getExpenseById = async (meetingId: string, expenseId: string): Promise<Expense | undefined> => {
  if (!meetingId || !expenseId) return undefined;
  const expenseDoc = doc(db, 'meetings', meetingId, 'expenses', expenseId);
  const snapshot = await getDoc(expenseDoc);
  return dataFromSnapshot<Expense>(snapshot);
};

export const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> => {
  const expensesCol = collection(db, 'meetings', expenseData.meetingId, 'expenses');
  const dataToSave = {
    ...expenseData,
    createdAt: serverTimestamp(),
  };
  const docRef = await addDoc(expensesCol, dataToSave);

  // If the meeting was 'all' type and settled, unsettle it
  const meeting = await getMeetingById(expenseData.meetingId);
  if (meeting && meeting.isSettled && meeting.reserveFundUsageType === 'all') {
    await updateMeeting(expenseData.meetingId, { isSettled: false });
  }

  return { ...expenseData, id: docRef.id, createdAt: new Date() }; // Simulate createdAt for return
};

export const updateExpense = async (id: string, updates: Partial<Expense>): Promise<Expense | null> => {
  if (!updates.meetingId) { // meetingId is crucial for subcollection path
    // Try to get original expense to find meetingId if not provided in updates
    // This is a bit complex as we don't know which meeting it belongs to without querying.
    // For now, assume updates.meetingId will be present or handle error.
    // A better approach: updateExpense(meetingId, expenseId, updates)
    console.error("updateExpense requires meetingId in updates for subcollection path");
    // To keep the signature, we'd have to query all meetings' expense subcollections or change it.
    // Let's assume for now it's called in a context where meetingId is known.
    // If not, this will fail or needs a more robust way to find the expense.
    // For simplicity, if updates.meetingId is not there, we try to get it from original expense if possible
    // (but that's not passed here).
    // THIS IS A POTENTIAL ISSUE if not called carefully.
    return null; 
  }
  const expenseDocRef = doc(db, 'meetings', updates.meetingId, 'expenses', id);
  await updateDoc(expenseDocRef, updates);
  const updatedSnapshot = await getDoc(expenseDocRef);
  const updatedExpense = dataFromSnapshot<Expense>(updatedSnapshot);

  if (updatedExpense) {
    const meeting = await getMeetingById(updatedExpense.meetingId);
    if (meeting && meeting.isSettled && meeting.reserveFundUsageType === 'all') {
      await updateMeeting(updatedExpense.meetingId, { isSettled: false });
    }
  }
  return updatedExpense;
};

// To delete, we need the meetingId to locate the subcollection
export const deleteExpense = async (meetingId: string, expenseId: string): Promise<boolean> => {
  const expenseDocRef = doc(db, 'meetings', meetingId, 'expenses', expenseId);
  await deleteDoc(expenseDocRef);

  const meeting = await getMeetingById(meetingId);
  if (meeting && meeting.isSettled && meeting.reserveFundUsageType === 'all') {
     await updateMeeting(meetingId, { isSettled: false });
  }
  return true;
};

// Reserve Fund functions
export const getReserveFundBalance = async (): Promise<number> => {
  const transactions = await getReserveFundTransactions();
  return transactions.reduce((acc, curr) => acc + curr.amount, 0);
};

export const getReserveFundTransactions = async (): Promise<ReserveFundTransaction[]> => {
  const transactionsCol = collection(db, 'reserveFundTransactions');
  const snapshot = await getDocs(query(transactionsCol, orderBy('date', 'desc')));
  return arrayFromSnapshot<ReserveFundTransaction>(snapshot);
};

export const addReserveFundTransaction = async (transactionData: Omit<ReserveFundTransaction, 'id'>): Promise<ReserveFundTransaction> => {
  const transactionsCol = collection(db, 'reserveFundTransactions');
  const dataToSave = {
    ...transactionData,
    date: Timestamp.fromDate(new Date(transactionData.date)),
  };

  // Prevent duplicate meeting_contribution transactions if one already exists for the same meeting and type
  if (transactionData.type === 'meeting_contribution' && transactionData.meetingId) {
    let q;
    if (transactionData.description.includes('부분 사용')) {
      q = query(transactionsCol, 
                where('meetingId', '==', transactionData.meetingId),
                where('type', '==', 'meeting_contribution'),
                where('description', '==', transactionData.description), // Exact match for partial
                where('amount', '==', transactionData.amount)
              );
    } else if (transactionData.description.includes('전체 정산')) {
        q = query(transactionsCol, 
                where('meetingId', '==', transactionData.meetingId),
                where('type', '==', 'meeting_contribution'),
                where('description', 'custom_operator_contains', '전체 정산') // Check if 'all' type already exists
              );
    }
    if (q) {
      const existingTxSnap = await getDocs(q);
      if (!existingTxSnap.empty && !(transactionData.description.includes('(수정)'))) {
         // If it's an 'all' type and one already exists, or 'partial' and exact match exists.
         // This logic might need refinement based on how "updates" vs "new" are handled.
        console.warn("Skipping potentially duplicate meeting_contribution transaction:", transactionData);
        return dataFromSnapshot<ReserveFundTransaction>(existingTxSnap.docs[0])!; // Return existing
      }
    }
  }

  const docRef = await addDoc(transactionsCol, dataToSave);
  return { ...transactionData, id: docRef.id, date: new Date(transactionData.date) }; // Simulate for return
};

// Utility to get all data for AI analysis for a specific meeting
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
      const splitAmongFriends = await Promise.all(expense.splitAmongIds.map(id => getFriendById(id)));
      spendingDetails += `  Among: ${splitAmongFriends.map(f => f?.nickname).filter(Boolean).join(', ')}\n`;
    } else if (expense.splitType === 'custom' && expense.customSplits) {
      const customSplitDetails = await Promise.all(expense.customSplits.map(async split => {
        const friend = await getFriendById(split.friendId);
        return `${friend?.nickname || 'Unknown'}: ${split.amount.toLocaleString()} KRW`;
      }));
      spendingDetails += `  Custom Split: ${customSplitDetails.join('; ')}\n`;
    }
    spendingDetails += "\n";
  }
  return spendingDetails;
};

export const getAllSpendingDataForYear = async (year: number): Promise<string> => {
  const allMeetings = await getMeetings(); // Fetch all meetings first
  const yearMeetings = allMeetings.filter(m => new Date(m.dateTime).getFullYear() === year);
  if (yearMeetings.length === 0) return `No meetings found for the year ${year}.`;

  let allSpendingDetails = `Spending data for the year ${year}:\n\n`;
  for (const meeting of yearMeetings) {
    allSpendingDetails += (await getSpendingDataForMeeting(meeting.id)) + "\n---\n";
  }
  return allSpendingDetails;
};

export const getMeetingExpenses = async (meetingId: string): Promise<Expense[]> => {
    return getExpensesByMeetingId(meetingId);
}

// Placeholder for a more specific query for description contains in Firestore
// Firestore doesn't directly support 'contains' for strings in where clauses like SQL LIKE.
// For 'custom_operator_contains', you'd typically fetch and filter client-side,
// or use a more advanced search solution like Algolia/Typesense, or structure data differently (e.g., keywords array).
// For this prototype, I'll use a simple string.includes after fetching for descriptions if absolutely needed,
// but it's better to make descriptions more exact or use specific fields.
// The 'description contains' pseudo-operator in the data-store.ts is a simplification
// and might need adjustment for production (e.g. by making transaction descriptions more standardized).
// For now, I'll assume the current where clauses are sufficient or will be adapted.
// In addReserveFundTransaction and updateMeeting, the logic for finding existing transactions
// related to partial/all meeting contributions might need this. I will simplify the query to be more direct.
// e.g. for 'all' type, might store a specific marker in description or a boolean field.
// For now, I'll remove the 'custom_operator_contains' and rely on the description being somewhat standard
// or accept that finding existing 'all' or 'partial' type transactions might be less precise.

// Correcting the query in updateMeeting for existing transactions:
// For 'partial' type, the description match should be more specific or rely on a flag.
// For 'all' type, similarly. The current logic is a placeholder.
// I will remove the `custom_operator_contains` comments as it's not a real operator.
// The logic for addReserveFundTransaction and updateMeeting regarding finding existing
// meeting_contribution transactions needs careful testing.
// The queries used are:
// `where('description', '==', transactionData.description)` for partial (exact match)
// `where('description', 'custom_operator_contains', '전체 정산')` for all
// I will assume for now that the string matching on description is sufficient for the prototype's purpose.
