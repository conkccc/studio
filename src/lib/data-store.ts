
import type { Friend, Meeting, Expense, ReserveFundTransaction } from './types';

let friends: Friend[] = [
  { id: '1', nickname: '철수', name: '김철수', createdAt: new Date('2024-01-01T10:00:00Z') },
  { id: '2', nickname: '영희', name: '이영희', createdAt: new Date('2024-01-02T11:00:00Z') },
  { id: '3', nickname: '민준', name: '박민준', createdAt: new Date('2024-01-03T12:00:00Z') },
];

let nextFriendId = 4;
let nextMeetingIdCounter = 4;
let nextExpenseIdCounter = 4;
let nextReserveTxIdCounter = 3;


let meetings: Meeting[] = [
  {
    id: 'm1',
    name: '점심 식사 🍕',
    dateTime: new Date('2025-05-28T14:00:00'),
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
    dateTime: new Date('2025-06-10T19:00:00'),
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
    dateTime: new Date('2025-07-20T14:00:00'),
    endTime: new Date('2025-07-20T17:00:00'),
    locationName: '스터디 카페 XYZ',
    creatorId: '3',
    participantIds: ['1', '3'],
    createdAt: new Date('2024-07-18T09:00:00Z'),
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
      { friendId: '3', amount: 25000 },
    ],
    createdAt: new Date('2024-07-16T19:30:00Z'),
  },
];

// --- Reserve Fund State ---
let currentReserveFundBalance: number = 80000; // Initial actual balance, m1's 10k deduction applied
let loggedReserveFundTransactions: ReserveFundTransaction[] = [
  { 
    id: 'tx_initial_set', 
    type: 'balance_update', 
    amount: 100000, // Represents the balance set at this point
    description: '초기 잔액 설정', 
    date: new Date('2024-01-01T09:00:00Z') 
  },
  { 
    id: 'tx_m1_deduction', 
    type: 'meeting_deduction', 
    amount: -10000, // Actual amount deducted
    description: "모임 (점심 식사 🍕) 회비 부분 사용", 
    date: new Date('2025-05-28T14:00:00'),
    meetingId: 'm1'
  },
];
// --- End Reserve Fund State ---


// Friend functions
export const getFriends = (): Friend[] => {
  return [...friends].sort((a, b) => a.nickname.localeCompare(b.nickname));
};

export const getFriendById = (id: string): Friend | undefined => {
  return friends.find(f => f.id === id);
};

export const addFriend = (nickname: string, name?: string): Friend => {
  const newFriend: Friend = {
    id: String(nextFriendId++),
    nickname,
    name: name || '',
    createdAt: new Date(),
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
  meetings = meetings.map(m => ({
    ...m,
    participantIds: m.participantIds.filter(pId => pId !== id),
    nonReserveFundParticipants: m.nonReserveFundParticipants.filter(nrpId => nrpId !== id),
  }));
  expenses = expenses.map(e => {
    const newExpense = {...e};
    if (e.paidById === id) {
      console.warn(`Friend ${id} was a payer for expense ${e.id}. This needs handling if deletion is allowed.`);
    }
    if (e.splitAmongIds) {
      newExpense.splitAmongIds = e.splitAmongIds.filter(sId => sId !== id);
    }
    if (e.customSplits) {
      newExpense.customSplits = e.customSplits.filter(cs => cs.friendId !== id);
    }
    return newExpense;
  }).filter(e => {
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

const generateMeetingId = (): string => {
    return `m${nextMeetingIdCounter++}`;
};

export const addMeeting = (meetingData: Omit<Meeting, 'id' | 'createdAt' | 'isSettled'>): Meeting => {
  const newMeeting: Meeting = {
    ...meetingData,
    id: generateMeetingId(),
    createdAt: new Date(),
    isSettled: false,
  };
  meetings.push(newMeeting);
  if (newMeeting.useReserveFund && newMeeting.reserveFundUsageType === 'partial' && (newMeeting.partialReserveFundAmount || 0) > 0) {
    recordMeetingDeduction(newMeeting.id, newMeeting.name, newMeeting.partialReserveFundAmount as number, new Date(newMeeting.dateTime));
    // Partial usage implies settlement of this specific fund part
    // If the meeting is later fully settled (for 'all' type behavior on top, though unlikely), this tx remains.
  }
  return newMeeting;
};

export const updateMeeting = (id: string, updates: Partial<Omit<Meeting, 'id'>>): Meeting | null => {
  const meetingIndex = meetings.findIndex(m => m.id === id);
  if (meetingIndex === -1) return null;

  const originalMeeting = { ...meetings[meetingIndex] }; // Clone for comparison
  const updatedMeetingData = { ...originalMeeting, ...updates };

  // Handle changes in 'partial' fund usage
  const wasPartial = originalMeeting.useReserveFund && originalMeeting.reserveFundUsageType === 'partial' && (originalMeeting.partialReserveFundAmount || 0) > 0;
  const isNowPartial = updatedMeetingData.useReserveFund && updatedMeetingData.reserveFundUsageType === 'partial' && (updatedMeetingData.partialReserveFundAmount || 0) > 0;
  
  if (wasPartial && (!isNowPartial || originalMeeting.partialReserveFundAmount !== updatedMeetingData.partialReserveFundAmount)) {
    revertMeetingDeduction(id, originalMeeting.partialReserveFundAmount); // Revert old amount
  }
  if (isNowPartial && (!wasPartial || originalMeeting.partialReserveFundAmount !== updatedMeetingData.partialReserveFundAmount)) {
    recordMeetingDeduction(id, updatedMeetingData.name, updatedMeetingData.partialReserveFundAmount as number, new Date(updatedMeetingData.dateTime));
  }
  
  // If an 'all' type meeting was settled and is now being explicitly unsettled or fund usage changes
  if (originalMeeting.isSettled && originalMeeting.reserveFundUsageType === 'all' && 
      (updates.isSettled === false || 
       updates.useReserveFund === false || 
       (updates.useReserveFund && updates.reserveFundUsageType !== 'all'))) {
    revertMeetingDeduction(id); // Revert the 'all' type deduction
    updatedMeetingData.isSettled = false;
  }

  meetings[meetingIndex] = updatedMeetingData;
  return meetings[meetingIndex];
};

export const deleteMeeting = (id: string): boolean => {
  const meeting = getMeetingById(id);
  if (!meeting) return false;

  const initialLength = meetings.length;
  meetings = meetings.filter(m => m.id !== id);
  expenses = expenses.filter(e => e.meetingId !== id);
  
  revertMeetingDeduction(id, undefined, true); // Remove any type of deduction for this meeting
  
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
    id: `e${nextExpenseIdCounter++}`,
    createdAt: new Date(),
  };
  expenses.push(newExpense);

  const meeting = getMeetingById(newExpense.meetingId);
  if (meeting && meeting.isSettled && meeting.reserveFundUsageType === 'all') {
    revertMeetingDeduction(meeting.id);
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
    revertMeetingDeduction(meeting.id);
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
    revertMeetingDeduction(meeting.id);
    updateMeeting(meeting.id, { ...meeting, isSettled: false });
  }
  return expenses.length < initialLength;
};

// --- Reserve Fund Functions ---
export const getReserveFundBalance = (): number => {
  return currentReserveFundBalance;
};

export const setReserveFundBalance = (newBalance: number, description: string = "수동 잔액 업데이트"): void => {
  const oldBalance = currentReserveFundBalance;
  currentReserveFundBalance = newBalance;
  
  // Log the change as a 'balance_update' transaction.
  // The 'amount' for balance_update can represent the new balance itself, or the change.
  // Let's make it represent the new balance for clarity in the log.
  const newTx: ReserveFundTransaction = {
    id: `tx${nextReserveTxIdCounter++}`,
    type: 'balance_update',
    amount: newBalance, // Storing the new balance value
    description: description || `잔액이 ${oldBalance.toLocaleString()}원에서 ${newBalance.toLocaleString()}원으로 변경됨`,
    date: new Date(),
  };
  loggedReserveFundTransactions.push(newTx);
  loggedReserveFundTransactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const getLoggedReserveFundTransactions = (): ReserveFundTransaction[] => {
  return [...loggedReserveFundTransactions].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const recordMeetingDeduction = (meetingId: string, meetingName: string, amountDeducted: number, date: Date): void => {
  if (amountDeducted <= 0) return; // Only record actual deductions

  // Prevent duplicate deductions for the same meeting if already recorded (e.g. for partial)
  const existingDeduction = loggedReserveFundTransactions.find(
    tx => tx.meetingId === meetingId && tx.type === 'meeting_deduction'
  );
  if (existingDeduction) {
    // If it's a partial and amount changed, it should have been reverted first by updateMeeting.
    // If it's an 'all' type, this function shouldn't be called if already settled and logged.
    console.warn(`Meeting deduction for ${meetingId} might already exist or logic error.`);
    // For robustness, let's assume a new call means we should ensure the balance is correct.
    // This part can be complex. If updateMeeting correctly reverts, this check might be less critical.
  }

  currentReserveFundBalance -= amountDeducted;
  const newTx: ReserveFundTransaction = {
    id: `tx${nextReserveTxIdCounter++}`,
    type: 'meeting_deduction',
    amount: -amountDeducted, // Store as negative for deduction
    description: `모임 (${meetingName}) 회비 사용`,
    date: new Date(date),
    meetingId: meetingId,
  };
  loggedReserveFundTransactions.push(newTx);
  loggedReserveFundTransactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const revertMeetingDeduction = (meetingId: string, specificAmount?: number, forceRemoveAllForMeeting: boolean = false): void => {
  const initialBalance = currentReserveFundBalance;
  let totalReverted = 0;

  loggedReserveFundTransactions = loggedReserveFundTransactions.filter(tx => {
    if (tx.meetingId === meetingId && tx.type === 'meeting_deduction') {
      if (forceRemoveAllForMeeting || (specificAmount !== undefined && Math.abs(tx.amount) === specificAmount) || specificAmount === undefined) {
        currentReserveFundBalance -= tx.amount; // tx.amount is negative, so this adds back
        totalReverted -= tx.amount;
        return false; // Remove this transaction
      }
    }
    return true; // Keep other transactions
  });

  if (totalReverted > 0) {
    console.log(`Reverted ${totalReverted} from meeting ${meetingId}. Balance ${initialBalance} -> ${currentReserveFundBalance}`);
  }
};
// --- End Reserve Fund Functions ---


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
  const allMeetings = getMeetings(); 
  const yearMeetings = allMeetings.filter(m => new Date(m.dateTime).getFullYear() === year);
  if (yearMeetings.length === 0) return `No meetings found for the year ${year}.`;

  let allSpendingDetails = `Spending data for the year ${year}:\n\n`;
  for (const meeting of yearMeetings) {
    allSpendingDetails += getSpendingDataForMeeting(meeting.id) + "\n---\n";
  }
  return allSpendingDetails;
};

export const getMeetingExpenses = (meetingId: string): Expense[] => {
    return getExpensesByMeetingId(meetingId);
}
