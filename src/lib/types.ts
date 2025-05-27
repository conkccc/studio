
export type Friend = {
  id: string;
  nickname: string;
  name?: string; // Optional full name
  createdAt: Date;
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
  // reserveFundUsageType is removed
  partialReserveFundAmount?: number; // Amount to use if useReserveFund is true
  nonReserveFundParticipants: string[];
  isSettled?: boolean; 
};

export type ReserveFundTransaction = {
  id: string;
  type: "meeting_deduction" | "balance_update"; 
  description: string;
  amount: number; 
  date: Date;
  meetingId?: string; 
};

// CostAnalysisResult type is removed
