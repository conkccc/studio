import type { Expense, FriendGroup, Meeting, User } from '../../types';

export const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  role: 'user',
  createdAt: new Date(),
  ...overrides
});

export const makeAdmin = (overrides: Partial<User> = {}): User =>
  makeUser({ id: 'admin-1', role: 'admin', ...overrides });

export const makeMeeting = (overrides: Partial<Meeting> = {}): Meeting => ({
  id: 'm1',
  name: '모임',
  dateTime: new Date(),
  locationName: '장소',
  creatorId: 'u1',
  participantIds: [],
  createdAt: new Date(),
  useReserveFund: false,
  nonReserveFundParticipants: [],
  groupId: 'g1',
  isTemporary: false,
  ...overrides
});

export const makeFriendGroup = (overrides: Partial<FriendGroup> = {}): FriendGroup => ({
  id: 'g1',
  name: '그룹',
  ownerUserId: 'u1',
  memberIds: [],
  createdAt: new Date(),
  ...overrides
});

export const makeExpense = (overrides: Partial<Expense> = {}): Expense => ({
  id: 'e1',
  meetingId: 'm1',
  description: '지출',
  totalAmount: 10000,
  paidById: 'f1',
  splitType: 'equally',
  splitAmongIds: ['f1', 'f2'],
  createdAt: new Date(),
  ...overrides
});
