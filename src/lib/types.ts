
export type Friend = {
  id: string;
  nickname: string;
  name?: string; // Optional full name
  createdAt: Date; // Added from previous modifications
};

export type ExpenseSplit = {
  friendId: string;
  amount: number;
};

export type Expense = {
  id:string;
  meetingId: string;
  description: string;
  totalAmount: number;
  paidById: string; // Friend ID of who paid
  splitType: "equally" | "custom";
  splitAmongIds?: string[]; 
  customSplits?: ExpenseSplit[]; 
  createdAt: Date;
};

export type Meeting = {
  id: string;
  name: string;
  dateTime: Date;
  endTime?: Date;
  locationName: string;
  locationCoordinates?: { lat: number; lng: number };
  creatorId: string;
  participantIds: string[];
  createdAt: Date;

  useReserveFund: boolean;
  reserveFundUsageType: 'all' | 'partial';
  partialReserveFundAmount?: number;
  nonReserveFundParticipants: string[];
  isSettled?: boolean; 
};

export type ReserveFundTransaction = {
  id: string;
  // 'deposit' and 'withdrawal' removed for direct balance setting
  // 'meeting_contribution' can be simplified to 'meeting_deduction'
  // 'balance_update' for manual setting of balance
  type: "meeting_deduction" | "balance_update"; 
  description: string;
  amount: number; // For 'meeting_deduction', this will be negative. For 'balance_update', this is the new balance.
  date: Date;
  meetingId?: string; // if type is 'meeting_deduction'
};

export type CostAnalysisResult = {
  summary: string;
  costCuttingSuggestions: string;
};
