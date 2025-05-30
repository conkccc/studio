
import type { Timestamp } from 'firebase/firestore';

export type User = {
  id: string; // Firebase UID
  name?: string | null;
  email?: string | null;
  role: 'admin' | 'user' | 'none';
  createdAt: Date | Timestamp; // Allow Timestamp for Firestore, convert to Date in app
};

export type Friend = {
  id: string;
  nickname: string;
  name?: string;
  createdAt: Date | Timestamp;
  // role 필드 제거
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
  createdAt: Date | Timestamp;
};

export type Meeting = {
  id: string;
  name: string;
  dateTime: Date | Timestamp;
  endTime?: Date | Timestamp | null; // Firestore에서 null로 삭제 가능하도록
  locationName: string;
  locationCoordinates?: { lat: number; lng: number };
  creatorId: string; // User ID
  participantIds: string[]; // Friend IDs
  createdAt: Date | Timestamp;
  useReserveFund: boolean;
  partialReserveFundAmount?: number;
  nonReserveFundParticipants: string[];
  isSettled?: boolean;
  // 공유 기능 필드 추가
  isShareEnabled?: boolean;
  shareToken?: string | null;
  shareExpiryDate?: Date | Timestamp | null;
};

export type ReserveFundTransaction = {
  id: string;
  type: "meeting_deduction" | "balance_update";
  description: string;
  amount: number; // 차감 시 음수, 잔액 설정 시 해당 잔액
  date: Date | Timestamp;
  meetingId?: string;
};
