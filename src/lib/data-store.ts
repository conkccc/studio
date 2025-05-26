
// In-memory data store (for demonstration purposes)
import type { Friend, Meeting, Expense, ReserveFundTransaction } from './types';

let friends: Friend[] = [
  { id: '1', nickname: '철수', name: '김철수', createdAt: new Date('2024-01-01T10:00:00Z') },
  { id: '2', nickname: '영희', name: '이영희', createdAt: new Date('2024-01-02T11:00:00Z') },
  { id: '3', nickname: '민준', name: '박민준', createdAt: new Date('2024-01-03T12:00:00Z') },
];

let nextNumericMeetingId = 4; // Start after existing m1, m2, m3
let meetings: Meeting[] = [
  {
    id: 'm1', // Initial data includes 'm1'
    name: '점심 식사 🍕',
    dateTime: new Date('2025-05-28T14:00:00'), // Consistent time
    endTime: new Date('2025-05-28T15:00:00'),
    locationName: '강남역 맛집',
    creatorId: '1',
    participantIds: ['1', '2'],
    createdAt: new Date('2024-07-15T10:00:00Z'),
    useReserveFund: true,
    reserveFundUsageType: 'partial',
    partialReserveFundAmount: 10000,
    nonReserveFundParticipants: [],
    isSettled: true,
  },
  {
    id: 'm2',
    name: '저녁 모임 🍻',
    dateTime: new Date('2025-06-10T19:00:00'), // Consistent time
    locationName: '홍대 펍',
    creatorId: '2',
    participantIds: ['1', '2', '3'],
    createdAt: new Date('2024-07-16T10:00:00Z'),
    useReserveFund: true,
    reserveFundUsageType: 'all',
    nonReserveFundParticipants: ['3'],
    isSettled: false,
  },
    {
    id: 'm3',
    name: '주말 스터디 📚',
    dateTime: new Date('2025-07-20T14:00:00'), // Consistent time
    endTime: new Date('2025-07-20T17:00:00'),
    locationName: '스터디 카페 XYZ',
    creatorId: '3',
    participantIds: ['1', '3'],
    createdAt: new Date('2024-07-18T09:00:00Z'),
    useReserveFund: false,
    reserveFundUsageType: 'all', // even if false, type might be set
    nonReserveFundParticipants: [],
    isSettled: false,
  },
];

let expenses: Expense[] = [
  {
    id: 'e1',
    meetingId: 'm1',
    description: '피자',
    totalAmount: 30000,
    paidById: '1',
    splitType: 'equally',
    splitAmongIds: ['1', '2'],
    createdAt: new Date('2024-07-15T12:35:00Z'),
  },
  {
    id: 'e2',
    meetingId: 'm1',
    description: '음료',
    totalAmount: 5000,
    paidById: '2',
    splitType: 'equally',
    splitAmongIds: ['1', '2'],
    createdAt: new Date('2024-07-15T12:36:00Z'),
  },
  {
    id: 'e3',
    meetingId: 'm2',
    description: '맥주와 안주',
    totalAmount: 75000,
    paidById: '2',
    splitType: 'custom',
    customSplits: [
      { friendId: '1', amount: 25000 },
      { friendId: '2', amount: 25000 },
      { friendId: '3', amount: 25000 }, // Even though '3' is nonReserveFundParticipant, they still pay their share
    ],
    createdAt: new Date('2024-07-16T19:30:00Z'),
  },
];

let reserveFundTransactions: ReserveFundTransaction[] = [
  { id: 'tx1', type: 'deposit', description: '초기 입금', amount: 100000, date: new Date('2024-01-01T09:00:00Z') },
  { id: 'tx2', type: 'meeting_contribution', meetingId: 'm1', description: "모임 (점심 식사 🍕) 회비 부분 사용", amount: -10000, date: new Date('2025-05-28T14:00:00')},
];

// Friend functions
export const getFriends = (): Friend[] => {
  return [...friends].sort((a, b) => a.nickname.localeCompare(b.nickname));
};

export const getFriendById = (id: string): Friend | undefined => {
  return friends.find(f => f.id === id);
};

export const addFriend = (nickname: string, name?: string): Friend => {
  const newFriend: Friend = {
    id: String(Date.now()), // Simple ID generation for in-memory
    nickname,
    name: name || '',
    createdAt: new Date(), // Added createdAt
  };
  friends.push(newFriend);
  return newFriend;
};

export const updateFriend = (id: string, updates: Partial<Omit<Friend, 'id' | 'createdAt'>>): Friend | null => {
  const friendIndex = friends.findIndex(f => f.id === id);
  if (friendIndex === -1) return null;
  friends[friendIndex] = { ...friends[friendIndex], ...updates };
  return friends[friendIndex];
};

export const deleteFriend = (id: string): boolean => {
  const initialLength = friends.length;
  friends = friends.filter(f => f.id !== id);
  // Remove friend from meetings they participated in
  meetings = meetings.map(m => ({
    ...m,
    participantIds: m.participantIds.filter(pId => pId !== id),
    nonReserveFundParticipants: m.nonReserveFundParticipants.filter(nrpId => nrpId !== id),
  }));
  // Potentially remove friend from expenses (paidById, splitAmongIds, customSplits)
  // This can get complex and might need more robust handling in a real app
  expenses = expenses.map(e => {
    const newExpense = {...e};
    if (e.paidById === id) {
      // This is problematic - who pays now? For simplicity, we'll leave it, but real app needs a strategy.
      // Or prevent deletion if friend is a payer in unsettled expenses.
      console.warn(`Friend ${id} was a payer for expense ${e.id}. This needs handling.`);
    }
    if (e.splitAmongIds) {
      newExpense.splitAmongIds = e.splitAmongIds.filter(sId => sId !== id);
    }
    if (e.customSplits) {
      newExpense.customSplits = e.customSplits.filter(cs => cs.friendId !== id);
      // If custom splits change, totalAmount might need re-evaluation or validation.
    }
    return newExpense;
  }).filter(e => { // Remove expense if it no longer makes sense (e.g. no one to split among)
      if (e.splitType === 'equally' && e.splitAmongIds && e.splitAmongIds.length === 0) return false;
      if (e.splitType === 'custom' && e.customSplits && e.customSplits.length === 0) return false;
      return true;
  });

  return friends.length < initialLength;
};


// Meeting functions
export const getMeetings = (): Meeting[] => {
  return [...meetings].sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
};

export const getMeetingById = (id: string): Meeting | undefined => {
  return meetings.find(m => m.id === id);
};

const getNextMeetingId = (): string => {
    const numericIds = meetings
        .map(m => parseInt(m.id.replace('m', '')))
        .filter(num => !isNaN(num));
    const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
    return `m${maxId + 1}`;
};


export const addMeeting = (meetingData: Omit<Meeting, 'id' | 'createdAt' | 'isSettled'>): Meeting => {
  const newMeeting: Meeting = {
    ...meetingData,
    id: getNextMeetingId(),
    createdAt: new Date(),
    isSettled: false, // New meetings are not settled by default
  };
  meetings.push(newMeeting);
  if (newMeeting.useReserveFund && newMeeting.reserveFundUsageType === 'partial' && (newMeeting.partialReserveFundAmount || 0) > 0) {
    addReserveFundTransaction({
      type: 'meeting_contribution',
      amount: -(newMeeting.partialReserveFundAmount as number),
      description: `모임 (${newMeeting.name}) 회비 부분 사용`,
      date: new Date(newMeeting.dateTime), // Ensure this is a Date object
      meetingId: newMeeting.id,
    });
  }
  return newMeeting;
};

export const updateMeeting = (id: string, updates: Partial<Omit<Meeting, 'id'>>): Meeting | null => {
  const meetingIndex = meetings.findIndex(m => m.id === id);
  if (meetingIndex === -1) return null;

  const originalMeeting = meetings[meetingIndex];
  const updatedMeetingData = { ...originalMeeting, ...updates };

  // Handle changes in 'partial' fund usage
  const originalPartialAmount = (originalMeeting.useReserveFund && originalMeeting.reserveFundUsageType === 'partial') ? originalMeeting.partialReserveFundAmount : 0;
  const updatedPartialAmount = (updatedMeetingData.useReserveFund && updatedMeetingData.reserveFundUsageType === 'partial') ? updatedMeetingData.partialReserveFundAmount : 0;

  if (originalPartialAmount !== updatedPartialAmount ||
      (originalMeeting.reserveFundUsageType === 'partial' && updatedMeetingData.reserveFundUsageType !== 'partial') ||
      (!originalMeeting.useReserveFund && updatedMeetingData.useReserveFund && updatedMeetingData.reserveFundUsageType === 'partial')) {
    
    // Remove any existing 'partial' contribution transaction for this meeting
    reserveFundTransactions = reserveFundTransactions.filter(
        tx => !(tx.meetingId === id && tx.type === 'meeting_contribution' && tx.description.includes('부분 사용'))
    );

    if (updatedMeetingData.useReserveFund && updatedMeetingData.reserveFundUsageType === 'partial' && (updatedMeetingData.partialReserveFundAmount || 0) > 0) {
      addReserveFundTransaction({
        type: 'meeting_contribution',
        amount: -(updatedMeetingData.partialReserveFundAmount as number),
        description: `모임 (${updatedMeetingData.name}) 회비 부분 사용 (수정)`,
        date: new Date(updatedMeetingData.dateTime),
        meetingId: id,
      });
    }
  }
  
  // If an 'all' type meeting was settled and is now being explicitly unsettled in updates, or fund usage changes
  if (originalMeeting.isSettled && originalMeeting.reserveFundUsageType === 'all' && 
      (updates.isSettled === false || 
       updates.useReserveFund === false || 
       (updates.useReserveFund && updates.reserveFundUsageType !== 'all'))) {
    reserveFundTransactions = reserveFundTransactions.filter(
        tx => !(tx.meetingId === id && tx.type === 'meeting_contribution' && tx.description.includes('전체 정산'))
    );
    updatedMeetingData.isSettled = false; // Ensure it's marked unsettled
  }


  meetings[meetingIndex] = updatedMeetingData;
  return meetings[meetingIndex];
};

export const deleteMeeting = (id: string): boolean => {
  const initialLength = meetings.length;
  meetings = meetings.filter(m => m.id !== id);
  expenses = expenses.filter(e => e.meetingId !== id);
  reserveFundTransactions = reserveFundTransactions.filter(tx => tx.meetingId !== id);
  return meetings.length < initialLength;
};

// Expense functions
export const getExpensesByMeetingId = (meetingId: string): Expense[] => {
  return expenses.filter(e => e.meetingId === meetingId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const getExpenseById = (id: string): Expense | undefined => {
  return expenses.find(e => e.id === id);
};

export const addExpense = (expenseData: Omit<Expense, 'id' | 'createdAt'>): Expense => {
  const newExpense: Expense = {
    ...expenseData,
    id: String(Date.now()),
    createdAt: new Date(),
  };
  expenses.push(newExpense);

  const meeting = getMeetingById(newExpense.meetingId);
  if (meeting && meeting.isSettled && meeting.reserveFundUsageType === 'all') {
    reserveFundTransactions = reserveFundTransactions.filter(
        tx => !(tx.meetingId === meeting.id && tx.type === 'meeting_contribution' && tx.description.includes('전체 정산'))
    );
    updateMeeting(meeting.id, { ...meeting, isSettled: false });
  }
  return newExpense;
};

export const updateExpense = (id: string, updates: Partial<Omit<Expense, 'id' | 'createdAt'>>): Expense | null => {
  const expenseIndex = expenses.findIndex(e => e.id === id);
  if (expenseIndex === -1) return null;
  
  const originalExpense = expenses[expenseIndex];
  expenses[expenseIndex] = { ...originalExpense, ...updates };
  
  const meeting = getMeetingById(expenses[expenseIndex].meetingId);
  if (meeting && meeting.isSettled && meeting.reserveFundUsageType === 'all') {
     reserveFundTransactions = reserveFundTransactions.filter(
        tx => !(tx.meetingId === meeting.id && tx.type === 'meeting_contribution' && tx.description.includes('전체 정산'))
    );
    updateMeeting(meeting.id, { ...meeting, isSettled: false });
  }
  return expenses[expenseIndex];
};

export const deleteExpense = (id: string): boolean => {
  const expense = getExpenseById(id);
  if (!expense) return false;

  const initialLength = expenses.length;
  expenses = expenses.filter(e => e.id !== id);

  const meeting = getMeetingById(expense.meetingId);
  if (meeting && meeting.isSettled && meeting.reserveFundUsageType === 'all') {
     reserveFundTransactions = reserveFundTransactions.filter(
        tx => !(tx.meetingId === meeting.id && tx.type === 'meeting_contribution' && tx.description.includes('전체 정산'))
    );
    updateMeeting(meeting.id, { ...meeting, isSettled: false });
  }
  return expenses.length < initialLength;
};

// Reserve Fund functions
export const getReserveFundBalance = (): number => {
  return reserveFundTransactions.reduce((acc, curr) => acc + curr.amount, 0);
};

export const getReserveFundTransactions = (): ReserveFundTransaction[] => {
  return [...reserveFundTransactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const addReserveFundTransaction = (transactionData: Omit<ReserveFundTransaction, 'id'>): ReserveFundTransaction => {
  // Prevent duplicate meeting_contribution transactions if one already exists for the same meeting and type
  if (transactionData.type === 'meeting_contribution' && transactionData.meetingId) {
    const existingTx = reserveFundTransactions.find(tx =>
      tx.meetingId === transactionData.meetingId &&
      tx.type === 'meeting_contribution' &&
      // For partial, match description and amount; for all, match if description indicates 'all'
      ( (tx.description.includes('부분 사용') && tx.description === transactionData.description && tx.amount === transactionData.amount) ||
        (tx.description.includes('전체 정산') && transactionData.description.includes('전체 정산')) ) &&
      !(transactionData.description.includes('(수정)')) // Allow if explicitly marked as modification
    );
    if (existingTx) {
      console.warn("Skipping potentially duplicate meeting_contribution transaction:", transactionData);
      return existingTx;
    }
  }

  const newTransaction: ReserveFundTransaction = {
    ...transactionData,
    id: `tx${String(Date.now())}${reserveFundTransactions.length}`,
    date: new Date(transactionData.date), // Ensure it's a Date object
  };
  reserveFundTransactions.push(newTransaction);
  return newTransaction;
};


// Utility to get all data for AI analysis for a specific meeting
export const getSpendingDataForMeeting = (meetingId: string): string => {
  const meeting = getMeetingById(meetingId);
  if (!meeting) return "Meeting not found.";

  const meetingExpenses = getExpensesByMeetingId(meetingId);
  if (meetingExpenses.length === 0) return `No expenses recorded for meeting: ${meeting.name}.`;

  let spendingDetails = `Meeting: ${meeting.name} on ${new Date(meeting.dateTime).toLocaleDateString()}\nLocation: ${meeting.locationName}\nParticipants: ${meeting.participantIds.length}\n\nExpenses:\n`;

  for (const expense of meetingExpenses) {
    const payer = getFriendById(expense.paidById);
    spendingDetails += `- Description: ${expense.description}\n`;
    spendingDetails += `  Amount: ${expense.totalAmount.toLocaleString()} KRW\n`;
    spendingDetails += `  Paid by: ${payer?.nickname || 'Unknown'}\n`;
    spendingDetails += `  Split: ${expense.splitType}\n`;
    if (expense.splitType === 'equally' && expense.splitAmongIds) {
      const splitAmongFriends = expense.splitAmongIds.map(id => getFriendById(id));
      spendingDetails += `  Among: ${splitAmongFriends.map(f => f?.nickname).filter(Boolean).join(', ')}\n`;
    } else if (expense.splitType === 'custom' && expense.customSplits) {
      const customSplitDetails = expense.customSplits.map(split => {
        const friend = getFriendById(split.friendId);
        return `${friend?.nickname || 'Unknown'}: ${split.amount.toLocaleString()} KRW`;
      });
      spendingDetails += `  Custom Split: ${customSplitDetails.join('; ')}\n`;
    }
    spendingDetails += "\n";
  }
  return spendingDetails;
};

export const getAllSpendingDataForYear = async (year: number): Promise<string> => {
  const allMeetings = getMeetings(); // Fetch all meetings first
  const yearMeetings = allMeetings.filter(m => new Date(m.dateTime).getFullYear() === year);
  if (yearMeetings.length === 0) return `No meetings found for the year ${year}.`;

  let allSpendingDetails = `Spending data for the year ${year}:\n\n`;
  for (const meeting of yearMeetings) {
    // getSpendingDataForMeeting is synchronous with in-memory data
    allSpendingDetails += getSpendingDataForMeeting(meeting.id) + "\n---\n";
  }
  return allSpendingDetails;
};

export const getMeetingExpenses = (meetingId: string): Expense[] => {
    return getExpensesByMeetingId(meetingId);
}

// Initialize some numeric IDs if they don't exist from the initial data
const initializeNumericIds = () => {
    const meetingNumericIds = meetings
        .map(m => parseInt(m.id.replace('m', '')))
        .filter(num => !isNaN(num));
    nextNumericMeetingId = meetingNumericIds.length > 0 ? Math.max(...meetingNumericIds) + 1 : 1;
};

initializeNumericIds();
