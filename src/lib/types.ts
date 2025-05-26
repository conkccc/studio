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
  id: string;
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
  locationName: string;
  locationCoordinates?: { lat: number; lng: number }; // Optional
  creatorId: string; // Friend ID of the creator
  participantIds: string[]; // Array of Friend IDs
  // expenses are now fetched separately or managed within the meeting component
  createdAt: Date;
};

export type ReserveFundTransaction = {
  id: string;
  type: "deposit" | "withdrawal" | "meeting_contribution";
  description: string;
  amount: number;
  date: Date;
  meetingId?: string; // if withdrawal is for a meeting
};

export type CostAnalysisResult = {
  summary: string;
  costCuttingSuggestions: string;
};
