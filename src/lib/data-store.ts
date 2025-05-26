import type { Friend, Meeting, Expense, ReserveFundTransaction } from './types';

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
  },
  {
    id: 'm2',
    name: '주말 스터디 📚',
    dateTime: new Date('2023-11-20T14:00:00'),
    locationName: '스터디 카페 XYZ',
    creatorId: '2',
    participantIds: ['1', '2', '3'],
    createdAt: new Date('2023-11-18T10:00:00'),
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

let reserveFundBalance: number = 100000;
let reserveFundTransactions: ReserveFundTransaction[] = [
    { id: 'rf1', type: 'deposit', description: '초기 회비', amount: 150000, date: new Date('2023-01-01')},
    { id: 'rf2', type: 'meeting_contribution', meetingId: 'm1', description: '점심 식사 지원', amount: -20000, date: new Date('2024-07-15')},
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
  });
  expenses.forEach(expense => {
    if (expense.paidById === id) {
      // Handle case where payer is deleted - for simplicity, not handled here
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
  const newMeeting: Meeting = { ...meetingData, id: String(Date.now()), createdAt: new Date() };
  meetings.push(newMeeting);
  return newMeeting;
};

export const updateMeeting = async (id: string, updates: Partial<Meeting>): Promise<Meeting | null> => {
  const meetingIndex = meetings.findIndex(m => m.id === id);
  if (meetingIndex === -1) return null;
  meetings[meetingIndex] = { ...meetings[meetingIndex], ...updates };
  return meetings[meetingIndex];
};

export const deleteMeeting = async (id: string): Promise<boolean> => {
  const initialLength = meetings.length;
  meetings = meetings.filter(m => m.id !== id);
  // Also delete associated expenses
  expenses = expenses.filter(e => e.meetingId !== id);
  return meetings.length < initialLength;
};

// Expense functions
export const getExpensesByMeetingId = async (meetingId: string): Promise<Expense[]> => {
  return expenses.filter(e => e.meetingId === meetingId).sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime());
};

export const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> => {
  const newExpense: Expense = { ...expenseData, id: String(Date.now()), createdAt: new Date() };
  expenses.push(newExpense);
  return newExpense;
};

export const updateExpense = async (id: string, updates: Partial<Expense>): Promise<Expense | null> => {
  const expenseIndex = expenses.findIndex(e => e.id === id);
  if (expenseIndex === -1) return null;
  expenses[expenseIndex] = { ...expenses[expenseIndex], ...updates };
  return expenses[expenseIndex];
};

export const deleteExpense = async (id: string): Promise<boolean> => {
  const initialLength = expenses.length;
  expenses = expenses.filter(e => e.id !== id);
  return expenses.length < initialLength;
};

// Reserve Fund functions
export const getReserveFundBalance = async (): Promise<number> => {
  return reserveFundTransactions.reduce((acc, curr) => acc + curr.amount, 0);
};

export const getReserveFundTransactions = async (): Promise<ReserveFundTransaction[]> => {
  return [...reserveFundTransactions].sort((a,b) => b.date.getTime() - a.date.getTime());
};

export const addReserveFundTransaction = async (transactionData: Omit<ReserveFundTransaction, 'id'>): Promise<ReserveFundTransaction> => {
  const newTransaction: ReserveFundTransaction = { ...transactionData, id: String(Date.now()) };
  reserveFundTransactions.push(newTransaction);
  // reserveFundBalance += newTransaction.amount; // Balance is now computed
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
