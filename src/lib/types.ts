export type User = {
  id: string; // Firebase UID
  name?: string | null;
  email?: string | null;
  role: 'admin' | 'user' | 'viewer' | 'none';
  friendGroupIds?: string[]; // Renamed from refFriendGroupIds
  createdAt: Date; // Always store as JS Date in app, convert to/from Timestamp for Firestore
};

export type FriendGroup = {
  id: string;
  name: string;
  ownerUserId: string; // 洹몃９ ?뚯쑀???좎?)
  memberIds: string[]; // Friend id 紐⑸줉
  createdAt: Date;
};

export type Friend = {
  id: string;
  name: string; // ?대쫫(?꾩닔)
  description?: string; // ?ㅻ챸(?좏깮)
  groupId: string; // ?뚯냽 洹몃９
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
  paidById: string;
  splitType: "equally" | "custom";
  splitAmongIds?: string[];
  customSplits?: ExpenseSplit[];
  createdAt: Date;
};

export type Meeting = {
  id: string;
  name: string;
  dateTime: Date;
  endTime?: Date | null;
  locationLink?: string | null | undefined;
  locationName: string;
  locationCoordinates?: { lat: number; lng: number };
  creatorId: string; // User ID
  participantIds: string[]; // Friend IDs
  createdAt: Date;
  useReserveFund: boolean;
  partialReserveFundAmount?: number;
  nonReserveFundParticipants: string[];
  refundReserveFundToNonParticipants?: boolean;
  reserveFundRefundRecipientIds?: string[];
  isSettled?: boolean;
  settledReserveFundAmount?: number;
  settledReserveFundAt?: Date | null;
  isShareEnabled?: boolean;
  shareToken?: string | null;
  shareExpiryDate?: Date | null;
  memo?: string;
  groupId: string; // ?뚯냽 移쒓뎄 洹몃９
  isTemporary?: boolean;
  temporaryParticipants?: { name: string }[];
  totalFee?: number;
  feePerPerson?: number;
  expenses?: Expense[]; // Added to track expenses within a meeting
};

export type MeetingPrep = {
  id: string;
  title: string;
  memo?: string;
  creatorId: string; // User ID
  friendGroupId: string; // The ID of the friend group this prep is for
  participantFriendIds: string[]; // IDs of friends participating in this meeting prep
  participantFriends?: Friend[]; // Populated client-side or in actions
  selectedMonths: string[]; // e.g., "2025-07", "2025-08"
  createdAt: Date;
  isDeleted?: boolean; // for soft delete
  shareToken?: string | null; // for public sharing
  shareExpiryDate?: Date | null; // for public sharing
};

export type ParticipantAvailability = {
  id: string; // Unique ID for each submission (e.g., meetingPrepId_selectedFriendId)
  meetingPrepId: string;
  selectedFriendId: string; // The ID of the friend who is submitting their availability
  password?: string; // For modification, no encryption
  storedDates: string[]; // Either availableDates or unavailableDates
  storedAsAvailable: boolean; // True if storedDates are available dates, false if unavailable dates
  submittedAt: Date;
  availableDates?: string[]; // Reconstructed from storedDates for client-side use
  unavailableDates?: string[]; // Reconstructed from storedDates for client-side use
};

export type ReserveFundTransaction = {
  id: string;
  type: "meeting_deduction" | "balance_update";
  description: string;
  amount: number;
  date: Date;
  meetingId?: string;
  groupId: string;
};
