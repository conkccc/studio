
import type { Timestamp } from 'firebase/firestore';

export type User = {
  id: string; // Firebase UID
  name?: string | null;
  email?: string | null;
  role: 'admin' | 'user' | 'none';
  createdAt: Date; // Always store as JS Date in app, convert to/from Timestamp for Firestore
};

export type Friend = {
  id: string;
  nickname: string;
  name?: string;
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
  isSettled?: boolean;
  isShareEnabled?: boolean;
  shareToken?: string | null;
  shareExpiryDate?: Date | null;
};

export type ReserveFundTransaction = {
  id: string;
  type: "meeting_deduction" | "balance_update";
  description: string;
  amount: number; // 차감 시 음수, 잔액 설정 시 해당 잔액
  date: Date;
  meetingId?: string;
};
