export type Friend = {
  id: string;
  nickname: string;
  name?: string; // Optional full name
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
  // If 'equally', splitAmongIds indicates who to split amongst.
  // If 'custom', customSplits defines specific amounts.
  splitAmongIds?: string[]; 
  customSplits?: ExpenseSplit[]; 
  createdAt: Date;
};

export type Meeting = {
  id: string;
  name: string;
  dateTime: Date;
  endTime?: Date; // Made endTime optional as it might not always be set
  locationName: string;
  locationCoordinates?: { lat: number; lng: number }; // Optional
  creatorId: string; // Friend ID of the creator
  participantIds: string[]; // Array of Friend IDs
  createdAt: Date;

  useReserveFund: boolean;
  reserveFundUsageType: 'all' | 'partial';
  partialReserveFundAmount?: number; // Optional, used if reserveFundUsageType is 'partial'
  nonReserveFundParticipants: string[]; // Friend IDs who DO NOT benefit from reserve fund
  // associatedReserveFundTransactionId?: string; // Optional: to link to the specific fund transaction
};

export type ReserveFundTransaction = {
  id: string;
  type: "deposit" | "withdrawal" | "meeting_contribution";
  description: string;
  amount: number; // Positive for deposit/contribution_refund, negative for withdrawal/contribution_usage
  date: Date;
  meetingId?: string; // if withdrawal is for a meeting or contribution is from a meeting
};

export type CostAnalysisResult = {
  summary: string;
  costCuttingSuggestions: string;
};
