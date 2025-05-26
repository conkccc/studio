
import type { Friend, Meeting, Expense, ReserveFundTransaction } from './types';
import { calculateActualFundUsageForAllType } from './settlement-utils'; // Assuming this utility will be created

// In-memory store
let friends: Friend[] = [
  { id: '1', nickname: '철수', name: '김철수' },
  { id: '2', nickname: '영희', name: '이영희' },
  { id: '3', nickname: '민준', name: '박민준' },
];

let meetings: Meeting[] = [
  {
    id: 'm1',
    name: '점심 식사 🍕',
    dateTime: new Date('2024-07-15T12:30:00'),
    locationName: '강남역 맛집',
    creatorId: '1',
    participantIds: ['1', '2'],
    createdAt: new Date('2024-07-15T10:00:00'),
    useReserveFund: true,
    reserveFundUsageType: 'partial',
    partialReserveFundAmount: 10000,
    nonReserveFundParticipants: [],
    isSettled: true, // Assuming m1 was settled for partial usage
  },
  {
    id: 'm2',
    name: '주말 스터디 📚',
    dateTime: new Date('2023-11-20T14:00:00'),
    locationName: '스터디 카페 XYZ',
    creatorId: '2',
    participantIds: ['1', '2', '3'],
    createdAt: new Date('2023-11-18T10:00:00'),
    useReserveFund: false,
    reserveFundUsageType: 'all',
    nonReserveFundParticipants: [],
    isSettled: false,
  },
];

let expenses: Expense[] = [
  {
    id: 'e1',
    meetingId: 'm1',
    description: '피자 & 파스타',
    totalAmount: 50000,
    paidById: '1',
    splitType: 'equally',
    splitAmongIds: ['1', '2'],
    createdAt: new Date('2024-07-15T12:45:00'),
  },
  {
    id: 'e2',
    meetingId: 'm2',
    description: '카페 음료',
    totalAmount: 15000,
    paidById: '2',
    splitType: 'equally',
    splitAmongIds: ['1', '2', '3'],
    createdAt: new Date('2023-11-20T14:15:00'),
  },
  {
    id: 'e3',
    meetingId: 'm2',
    description: '스터디룸 대여료',
    totalAmount: 20000,
    paidById: '3',
    splitType: 'custom',
    customSplits: [
      { friendId: '1', amount: 5000 },
      { friendId: '2', amount: 7000 },
      { friendId: '3', amount: 8000 },
    ],
    createdAt: new Date('2023-11-20T14:10:00'),
  },
];

let reserveFundTransactions: ReserveFundTransaction[] = [
    { id: 'rf1', type: 'deposit', description: '초기 회비', amount: 150000, date: new Date('2023-01-01')},
    { id: 'rf2', type: 'meeting_contribution', meetingId: 'm1', description: '모임 (점심 식사 🍕) 회비 사용', amount: -10000, date: new Date('2024-07-15')},
    { id: 'rf3', type: 'withdrawal', description: '경조사비', amount: -30000, date: new Date('2024-08-01')},
];


// Friend functions
export const getFriends = async (): Promise<Friend[]> => {
  return [...friends];
};

export const getFriendById = async (id: string): Promise<Friend | undefined> => {
  return friends.find(f => f.id === id);
};

export const addFriend = async (nickname: string, name?: string): Promise<Friend> => {
  const newFriend: Friend = { id: String(Date.now()), nickname, name };
  friends.push(newFriend);
  return newFriend;
};

export const updateFriend = async (id: string, updates: Partial<Friend>): Promise<Friend | null> => {
  const friendIndex = friends.findIndex(f => f.id === id);
  if (friendIndex === -1) return null;
  friends[friendIndex] = { ...friends[friendIndex], ...updates };
  return friends[friendIndex];
};

export const deleteFriend = async (id: string): Promise<boolean> => {
  const initialLength = friends.length;
  friends = friends.filter(f => f.id !== id);
  // Also remove friend from meeting participants and expenses
  meetings.forEach(meeting => {
    meeting.participantIds = meeting.participantIds.filter(pId => pId !== id);
    meeting.nonReserveFundParticipants = meeting.nonReserveFundParticipants.filter(nrpId => nrpId !== id);
  });
  expenses.forEach(expense => {
    if (expense.paidById === id) {
      // For simplicity, if a payer is deleted, the expense remains associated with their ID.
    }
    expense.splitAmongIds = expense.splitAmongIds?.filter(sId => sId !== id);
    expense.customSplits = expense.customSplits?.filter(cs => cs.friendId !== id);
  });
  return friends.length < initialLength;
};

// Meeting functions
export const getMeetings = async (): Promise<Meeting[]> => {
  return [...meetings].sort((a,b) => b.dateTime.getTime() - a.dateTime.getTime());
};

export const getMeetingById = async (id: string): Promise<Meeting | undefined> => {
  return meetings.find(m => m.id === id);
};

export const addMeeting = async (meetingData: Omit<Meeting, 'id' | 'createdAt'>): Promise<Meeting> => {
  const newMeetingId = String(Date.now());
  const newMeeting: Meeting = {
    ...meetingData,
    id: newMeetingId,
    createdAt: new Date(),
    isSettled: false, // Initialize isSettled
  };
  meetings.push(newMeeting);

  // For 'partial' usage, create transaction immediately
  if (newMeeting.useReserveFund && newMeeting.reserveFundUsageType === 'partial' && (newMeeting.partialReserveFundAmount || 0) > 0) {
    // Ensure no duplicate transaction for this partial amount
    const existingPartialTx = reserveFundTransactions.find(
      tx => tx.meetingId === newMeetingId && tx.type === 'meeting_contribution' && tx.amount === -(newMeeting.partialReserveFundAmount as number)
    );
    if (!existingPartialTx) {
      addReserveFundTransaction({
        type: 'meeting_contribution',
        amount: -(newMeeting.partialReserveFundAmount as number),
        description: `모임 (${newMeeting.name}) 회비 부분 사용`,
        date: newMeeting.dateTime,
        meetingId: newMeetingId,
      });
    }
  }
  return newMeeting;
};

export const updateMeeting = async (id: string, updates: Partial<Meeting>): Promise<Meeting | null> => {
  const meetingIndex = meetings.findIndex(m => m.id === id);
  if (meetingIndex === -1) return null;

  const originalMeeting = { ...meetings[meetingIndex] }; // Keep a copy for comparison
  const updatedMeetingData = { ...originalMeeting, ...updates };
  
  // If isSettled is being set to true, this should ideally be done via finalizeMeetingSettlementAction
  // to ensure 'all' type transactions are correctly handled.
  // For now, this update will just update the meeting fields.
  // Special handling for 'partial' fund usage changes:
  if (
    (originalMeeting.useReserveFund && originalMeeting.reserveFundUsageType === 'partial' && originalMeeting.partialReserveFundAmount !== updatedMeetingData.partialReserveFundAmount) ||
    (originalMeeting.useReserveFund !== updatedMeetingData.useReserveFund && originalMeeting.reserveFundUsageType === 'partial') ||
    (originalMeeting.reserveFundUsageType !== updatedMeetingData.reserveFundUsageType && originalMeeting.reserveFundUsageType === 'partial')
  ) {
    // Remove any existing 'partial' contribution transaction for this meeting
    reserveFundTransactions = reserveFundTransactions.filter(
      tx => !(tx.meetingId === id && tx.type === 'meeting_contribution' && tx.description.includes('부분 사용'))
    );

    // Add new 'partial' transaction if applicable
    if (updatedMeetingData.useReserveFund && updatedMeetingData.reserveFundUsageType === 'partial' && (updatedMeetingData.partialReserveFundAmount || 0) > 0) {
      addReserveFundTransaction({
        type: 'meeting_contribution',
        amount: -(updatedMeetingData.partialReserveFundAmount as number),
        description: `모임 (${updatedMeetingData.name}) 회비 부분 사용 (수정)`,
        date: updatedMeetingData.dateTime,
        meetingId: id,
      });
    }
  }
  
  // If the meeting was 'all' type and is now being marked as !isSettled (e.g. reopened),
  // and a 'meeting_contribution' of 'all' type existed, it should be removed.
  // This might be complex if an admin "reopens" a settled meeting.
  // For now, `finalizeMeetingSettlementAction` will handle creating 'all' type transactions.
  // If isSettled is changed to false for an 'all' type meeting, its 'all' transaction should be removed.
  if (originalMeeting.isSettled && originalMeeting.reserveFundUsageType === 'all' && updatedMeetingData.isSettled === false) {
      reserveFundTransactions = reserveFundTransactions.filter(
          tx => !(tx.meetingId === id && tx.type === 'meeting_contribution' && tx.description.includes('전체 정산'))
      );
  }


  meetings[meetingIndex] = { ...updatedMeetingData };
  return meetings[meetingIndex];
};

export const deleteMeeting = async (id: string): Promise<boolean> => {
  const initialLength = meetings.length;
  meetings = meetings.filter(m => m.id !== id);
  expenses = expenses.filter(e => e.meetingId !== id);
  // Remove ANY associated reserve fund contribution transaction for this meeting
  reserveFundTransactions = reserveFundTransactions.filter(
    (tx) => !(tx.meetingId === id && tx.type === 'meeting_contribution')
  );
  return meetings.length < initialLength;
};

// Expense functions
export const getExpensesByMeetingId = async (meetingId: string): Promise<Expense[]> => {
  return expenses.filter(e => e.meetingId === meetingId).sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime());
};

export const getExpenseById = async (id: string): Promise<Expense | undefined> => {
  return expenses.find(e => e.id === id);
};


export const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> => {
  // When adding an expense, if the meeting was 'all' type and settled, it should become unsettled.
  const meeting = await getMeetingById(expenseData.meetingId);
  if (meeting && meeting.isSettled && meeting.reserveFundUsageType === 'all') {
    await updateMeeting(meeting.id, { isSettled: false });
    // Also remove the 'all' type fund transaction as it's no longer valid
     reserveFundTransactions = reserveFundTransactions.filter(
        tx => !(tx.meetingId === meeting.id && tx.type === 'meeting_contribution' && tx.description.includes('전체 정산'))
    );
  }

  const newExpense: Expense = { ...expenseData, id: String(Date.now()), createdAt: new Date() };
  expenses.push(newExpense);
  return newExpense;
};

export const updateExpense = async (id: string, updates: Partial<Expense>): Promise<Expense | null> => {
  const expenseIndex = expenses.findIndex(e => e.id === id);
  if (expenseIndex === -1) return null;
  
  const originalExpense = expenses[expenseIndex];
  expenses[expenseIndex] = { ...originalExpense, ...updates };

  // If an expense is updated, and the meeting was 'all' type and settled, it should become unsettled.
  const meeting = await getMeetingById(expenses[expenseIndex].meetingId);
  if (meeting && meeting.isSettled && meeting.reserveFundUsageType === 'all') {
     await updateMeeting(meeting.id, { isSettled: false });
     reserveFundTransactions = reserveFundTransactions.filter(
        tx => !(tx.meetingId === meeting.id && tx.type === 'meeting_contribution' && tx.description.includes('전체 정산'))
    );
  }
  return expenses[expenseIndex];
};

export const deleteExpense = async (id: string): Promise<boolean> => {
  const expense = await getExpenseById(id);
  if (!expense) return false;

  const initialLength = expenses.length;
  expenses = expenses.filter(e => e.id !== id);

  // If an expense is deleted, and the meeting was 'all' type and settled, it should become unsettled.
  const meeting = await getMeetingById(expense.meetingId);
  if (meeting && meeting.isSettled && meeting.reserveFundUsageType === 'all') {
    await updateMeeting(meeting.id, { isSettled: false });
    reserveFundTransactions = reserveFundTransactions.filter(
        tx => !(tx.meetingId === meeting.id && tx.type === 'meeting_contribution' && tx.description.includes('전체 정산'))
    );
  }
  return expenses.length < initialLength;
};

// Reserve Fund functions
export const getReserveFundBalance = async (): Promise<number> => {
  return reserveFundTransactions.reduce((acc, curr) => acc + curr.amount, 0);
};

export const getReserveFundTransactions = async (): Promise<ReserveFundTransaction[]> => {
  return [...reserveFundTransactions].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const addReserveFundTransaction = async (transactionData: Omit<ReserveFundTransaction, 'id'>): Promise<ReserveFundTransaction> => {
  const newTransaction: ReserveFundTransaction = { ...transactionData, id: String(Date.now()) };
  // Prevent duplicate meeting_contribution transactions for the same meeting if it's 'partial' or a specific manually added one.
  // 'all' type transactions will be handled by finalizeMeetingSettlementAction.
  if (transactionData.type === 'meeting_contribution' && transactionData.meetingId) {
    const existingTx = reserveFundTransactions.find(
      tx => tx.meetingId === transactionData.meetingId && 
            tx.type === 'meeting_contribution' &&
            // For partial, amounts would be specific. For 'all', descriptions would match.
            // This simple check might need refinement if manual 'meeting_contribution' types are allowed outside of automation.
            ( (tx.amount === transactionData.amount && transactionData.description.includes("부분 사용")) ||
              (transactionData.description.includes("전체 정산") && tx.description.includes("전체 정산")) )
    );
    if (existingTx && !transactionData.description.includes("(수정)")) { // Allow if it's explicitly an update
        // console.warn("Attempted to add a duplicate meeting_contribution transaction. Skipping.");
        // return existingTx; // Or throw error, or update existing one. For now, skip if seems like a duplicate.
        // For safety, allow if not an exact duplicate description to allow re-settlement if forced
        if (existingTx.description === transactionData.description && existingTx.amount === transactionData.amount) {
            return existingTx;
        }
    }
  }
  reserveFundTransactions.push(newTransaction);
  return newTransaction;
};

// Utility to get all data for AI analysis for a specific meeting
export const getSpendingDataForMeeting = async (meetingId: string): Promise<string> => {
  const meeting = await getMeetingById(meetingId);
  if (!meeting) return "Meeting not found.";

  const meetingExpenses = await getExpensesByMeetingId(meetingId);
  if (meetingExpenses.length === 0) return `No expenses recorded for meeting: ${meeting.name}.`;

  let spendingDetails = `Meeting: ${meeting.name} on ${meeting.dateTime.toLocaleDateString()}\nLocation: ${meeting.locationName}\nParticipants: ${meeting.participantIds.length}\n\nExpenses:\n`;

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
  const yearMeetings = meetings.filter(m => m.dateTime.getFullYear() === year);
  if (yearMeetings.length === 0) return `No meetings found for the year ${year}.`;

  let allSpendingDetails = `Spending data for the year ${year}:\n\n`;
  for (const meeting of yearMeetings) {
    allSpendingDetails += await getSpendingDataForMeeting(meeting.id) + "\n---\n";
  }
  return allSpendingDetails;
};

// Exporting calculateActualFundUsageForAllType to be used in actions.ts
// This function needs to be defined, perhaps in a new settlement-utils.ts file or directly here if simple enough.
// For now, let's assume it will be defined in actions.ts or a similar place where it's consumed.
// export { calculateActualFundUsageForAllType };
// To avoid circular dependencies or defining it here, the action will implement this logic.

export const getMeetingExpenses = async (meetingId: string): Promise<Expense[]> => {
    return expenses.filter(exp => exp.meetingId === meetingId);
}
