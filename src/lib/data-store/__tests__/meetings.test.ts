import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldPath, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { addExpense, addMeeting, deleteExpense, deleteMeeting, getMeetingFriends, getMeetings, saveMeetingSettlement, updateExpense, updateMeeting } from '../meetings';
import { getAdminDb } from '../../firebase-admin';
import { getFriendsByIds } from '../friends';
import { getUserById } from '../users';
import { makeExpense, makeFriend, makeFriendGroup, makeMeeting, makeUser } from '../../actions/__tests__/fixtures';
import { calculateSettlement } from '../../settlement';
import type { Meeting } from '../../types';

vi.mock('server-only', () => ({}));
vi.mock('../../firebase-admin', () => ({ getAdminDb: vi.fn() }));
vi.mock('../friends', () => ({ getFriendsByIds: vi.fn() }));
vi.mock('../users', () => ({ getUserById: vi.fn() }));

type Data = Record<string, unknown>;
type Filter = { field: string; operation: string; value: unknown };
type Ordering = { field: string; direction: 'asc' | 'desc' };
type Mutation = { kind: 'create' | 'update' | 'delete'; path: string; data?: Data };

function scalar(value: unknown): number | string {
  if (value instanceof Date) return value.getTime();
  if (value instanceof Timestamp) return value.toMillis();
  return typeof value === 'number' ? value : String(value ?? '');
}

function compare(left: unknown, right: unknown): number {
  const a = scalar(left), b = scalar(right);
  return a === b ? 0 : a < b ? -1 : 1;
}

// This fake models ordered query boundaries and commit-after-callback semantics;
// it never shares the repository's filtering or cursor implementation.
class MemoryFirestore {
  documents = new Map<string, Data>();
  reads: { path: string; limit?: number; filters: Filter[] }[] = [];
  writes: Mutation[] = [];
  nextId = 0;
  transactionRuns = 0;
  recursiveDeletes: string[] = [];

  collection(path: string) { return new MemoryQuery(this, path); }
  seed(path: string, data: object) { this.documents.set(path, { ...data }); }

  async runTransaction<T>(callback: (transaction: MemoryTransaction) => Promise<T>): Promise<T> {
    this.transactionRuns++;
    const transaction = new MemoryTransaction(this);
    const result = await callback(transaction);
    for (const mutation of transaction.pending) {
      if (mutation.kind === 'create' && this.documents.has(mutation.path)) throw new Error('already exists');
      if (mutation.kind === 'update' && !this.documents.has(mutation.path)) throw new Error('not found');
    }
    for (const mutation of transaction.pending) {
      if (mutation.kind === 'delete') this.documents.delete(mutation.path);
      else {
        const data = mutation.kind === 'create' ? {} : { ...this.documents.get(mutation.path) };
        for (const [key, value] of Object.entries(mutation.data || {})) {
          if (value instanceof FieldValue && value.isEqual(FieldValue.delete())) delete data[key];
          else data[key] = value;
        }
        this.documents.set(mutation.path, data);
      }
      this.writes.push(mutation);
    }
    return result;
  }

  async recursiveDelete(ref: MemoryDocument) {
    this.recursiveDeletes.push(ref.path);
    for (const path of this.documents.keys()) {
      if (path === ref.path || path.startsWith(`${ref.path}/`)) this.documents.delete(path);
    }
  }
}

class MemoryDocument {
  constructor(readonly database: MemoryFirestore, readonly path: string) {}
  get id() { return this.path.split('/').at(-1)!; }
  collection(name: string) { return new MemoryQuery(this.database, `${this.path}/${name}`); }
  async get() {
    const data = this.database.documents.get(this.path);
    return { id: this.id, exists: data !== undefined, data: () => data, ref: this };
  }
}

class MemoryQuery {
  constructor(
    readonly database: MemoryFirestore,
    readonly path: string,
    readonly filters: Filter[] = [],
    readonly orderings: Ordering[] = [],
    readonly limitCount?: number,
    readonly boundary?: unknown[],
  ) {}
  doc(id?: string) { return new MemoryDocument(this.database, `${this.path}/${id || `auto-${++this.database.nextId}`}`); }
  where(field: string, operation: string, value: unknown) {
    return new MemoryQuery(this.database, this.path, [...this.filters, { field, operation, value }], this.orderings, this.limitCount, this.boundary);
  }
  orderBy(field: string | FieldPath, direction: 'asc' | 'desc' = 'asc') {
    const key = typeof field === 'string' ? field : '__name__';
    return new MemoryQuery(this.database, this.path, this.filters, [...this.orderings, { field: key, direction }], this.limitCount, this.boundary);
  }
  limit(count: number) { return new MemoryQuery(this.database, this.path, this.filters, this.orderings, count, this.boundary); }
  startAfter(...values: unknown[]) { return new MemoryQuery(this.database, this.path, this.filters, this.orderings, this.limitCount, values); }

  async get() {
    this.database.reads.push({ path: this.path, limit: this.limitCount, filters: this.filters });
    let entries = [...this.database.documents.entries()].filter(([path]) => path.startsWith(`${this.path}/`) && path.split('/').length === this.path.split('/').length + 1);
    entries = entries.filter(([, data]) => this.filters.every(filter => {
      const current = data[filter.field];
      if (filter.operation === '==') return compare(current, filter.value) === 0;
      if (filter.operation === 'in') return (filter.value as unknown[]).some(value => compare(current, value) === 0);
      if (filter.operation === '>=') return compare(current, filter.value) >= 0;
      if (filter.operation === '<') return compare(current, filter.value) < 0;
      throw new Error(`Unsupported test query operator ${filter.operation}`);
    }));
    const fieldValue = ([path, data]: [string, Data], field: string) => field === '__name__' ? path.split('/').at(-1)! : data[field];
    const compareRows = (a: [string, Data], b: [string, Data]) => {
      for (const ordering of this.orderings) {
        const result = compare(fieldValue(a, ordering.field), fieldValue(b, ordering.field)) * (ordering.direction === 'desc' ? -1 : 1);
        if (result) return result;
      }
      return compare(a[0], b[0]);
    };
    entries.sort(compareRows);
    if (this.boundary) {
      entries = entries.filter(entry => {
        for (let index = 0; index < this.orderings.length; index++) {
          const ordering = this.orderings[index];
          const result = compare(fieldValue(entry, ordering.field), this.boundary![index]) * (ordering.direction === 'desc' ? -1 : 1);
          if (result) return result > 0;
        }
        return false;
      });
    }
    if (this.limitCount !== undefined) entries = entries.slice(0, this.limitCount);
    const docs = await Promise.all(entries.map(([path]) => new MemoryDocument(this.database, path).get()));
    return { docs, empty: !docs.length, size: docs.length };
  }
}

class MemoryTransaction {
  pending: Mutation[] = [];
  constructor(readonly database: MemoryFirestore) {}
  get(ref: MemoryDocument) { return ref.get(); }
  getAll(...refs: MemoryDocument[]) { return Promise.all(refs.map(ref => ref.get())); }
  create(ref: MemoryDocument, data: Data) { this.pending.push({ kind: 'create', path: ref.path, data }); }
  update(ref: MemoryDocument, data: Data) { this.pending.push({ kind: 'update', path: ref.path, data }); }
  delete(ref: MemoryDocument) { this.pending.push({ kind: 'delete', path: ref.path }); }
}

let database: MemoryFirestore;
const baseDate = new Date('2026-10-04T00:00:00Z');

function seedMeeting(overrides: Partial<Meeting> = {}) {
  const meeting = makeMeeting({ dateTime: baseDate, participantIds: ['f1', 'f2'], ...overrides });
  database.seed(`meetings/${meeting.id}`, meeting);
  return meeting;
}

beforeEach(() => {
  vi.resetAllMocks();
  database = new MemoryFirestore();
  vi.mocked(getAdminDb).mockReturnValue(database as unknown as Firestore);
  vi.mocked(getUserById).mockImplementation(async id => makeUser({ id, name: '작성자' }));
  vi.mocked(getFriendsByIds).mockImplementation(async ids => ids.map(id => makeFriend({ id })));
});

describe('resolved meeting roster', () => {
  it('replaces a five-person roster with the four selected IDs on save', async () => {
    seedMeeting({ participantIds: ['a', 'b', 'c', 'd', 'e'], revision: 1 });
    const saved = await updateMeeting('m1', { participantIds: ['a', 'b', 'c', 'd'] }, 1);
    expect(saved?.participantIds).toEqual(['a', 'b', 'c', 'd']);
    expect(database.documents.get('meetings/m1')?.participantIds).toEqual(['a', 'b', 'c', 'd']);
    expect(saved?.revision).toBe(2);
  });
  it('does not create a fifth participant from a dangling ID with no financial history', async () => {
    const meeting = seedMeeting({ participantIds: ['a', 'b', 'c', 'd', 'missing'] });
    vi.mocked(getFriendsByIds).mockResolvedValue(['a', 'b', 'c', 'd'].map(id => makeFriend({ id, name: `참여자 ${id}` })));
    const friends = await getMeetingFriends(meeting, []);
    expect(friends.map(friend => friend.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(meeting.participantIds).toHaveLength(5);
    expect(database.writes).toEqual([]);
  });

  it('looks up historical expense people even when absent from the current roster', async () => {
    const meeting = seedMeeting({ participantIds: ['f1'] });
    vi.mocked(getFriendsByIds).mockResolvedValue([makeFriend({ id: 'f1' }), makeFriend({ id: 'former', name: '과거 참여자', isArchived: true })]);
    const friends = await getMeetingFriends(meeting, [makeExpense({ paidById: 'former', splitAmongIds: ['f1', 'former'] })]);
    expect(getFriendsByIds).toHaveBeenCalledWith(['f1', 'former']);
    expect(friends.find(friend => friend.id === 'former')?.name).toBe('과거 참여자');
    expect(database.writes).toEqual([]);
  });

  it('keeps an unresolved historical participant only when their money is referenced', async () => {
    const meeting = seedMeeting({ participantIds: ['f1', 'missing'] });
    vi.mocked(getFriendsByIds).mockResolvedValue([makeFriend({ id: 'f1' })]);
    const friends = await getMeetingFriends(meeting, [makeExpense({ paidById: 'missing', splitAmongIds: ['f1', 'missing'] })]);
    expect(friends.find(friend => friend.id === 'missing')?.name).toContain('이름 확인 필요');
    expect(friends).toHaveLength(2);
  });

  it('resolves directory names even when a meeting has an empty snapshot array', async () => {
    seedMeeting({ participantIds: ['f1', 'f2'], participantSnapshot: [] });
    vi.mocked(getFriendsByIds).mockResolvedValue([makeFriend({ id: 'f1', name: '첫째' }), makeFriend({ id: 'f2', name: '둘째' })]);
    const result = await getMeetings({ limitParam: 9 });
    expect(result.meetings[0].participantNames).toEqual({ f1: '첫째', f2: '둘째' });
  });
});

describe('scoped cursor queries', () => {
  it('deduplicates overlapping creator and group scopes and pages tied dates without skips', async () => {
    for (let index = 0; index < 64; index++) {
      seedMeeting({ id: `m${String(index).padStart(3, '0')}`, dateTime: new Date(baseDate.getTime() - Math.floor(index / 4) * 60000),
        creatorId: index % 3 === 0 ? 'u1' : 'other-owner',
        groupId: index % 15 === 0 ? 'own-only' : index % 2 ? 'g1' : 'g2' });
    }
    seedMeeting({ id: 'secret-newest', creatorId: 'outsider', groupId: 'secret', dateTime: new Date(baseDate.getTime() + 60000) });
    const ids: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 12; page++) {
      const result = await getMeetings({ userId: 'u1', userFriendGroupIds: ['g1', 'g2'], limitParam: 7, cursor });
      ids.push(...result.meetings.map(meeting => meeting.id));
      if (!result.hasMore) break;
      expect(result.nextCursor).toBeTruthy();
      cursor = result.nextCursor!;
    }
    const expected = Array.from({ length: 16 }, (_, block) => [3, 2, 1, 0].map(offset => `m${String(block * 4 + offset).padStart(3, '0')}`)).flat();
    expect(ids).toEqual(expected);
    expect(new Set(ids).size).toBe(64);
    expect(ids).not.toContain('secret-newest');
  });

  it('applies group, type, status and name filters before selecting a page', async () => {
    for (let index = 0; index < 60; index++) {
      seedMeeting({ id: `m${index}`, dateTime: new Date(baseDate.getTime() - index * 60000),
        name: [38, 45, 52, 39, 40].includes(index) ? '예약 모임' : '다른 모임',
        groupId: index === 39 ? 'other-group' : 'g1', isTemporary: index === 40, isSettled: index === 45 });
    }
    const filters = { userId: 'u1', groupId: 'g1', type: 'regular' as const, status: 'pending' as const, search: '예약', limitParam: 1 };
    const first = await getMeetings(filters);
    expect(first.meetings.map(meeting => meeting.id)).toEqual(['m38']);
    expect(first.hasMore).toBe(true);
    const next = await getMeetings({ ...filters, cursor: first.nextCursor! });
    expect(next.meetings.map(meeting => meeting.id)).toEqual(['m52']);
    expect(next.hasMore).toBe(false);
  });

  it('returns a continuation when a bounded search window contains no matches', async () => {
    for (let index = 0; index < 250; index++) {
      seedMeeting({ id: `m${String(index).padStart(3, '0')}`, dateTime: new Date(baseDate.getTime() - index * 60000), name: index === 249 ? '찾는 모임' : '다른 모임' });
    }
    const first = await getMeetings({ userId: 'u1', search: '찾는', limitParam: 3 });
    expect(first.meetings).toEqual([]);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeTruthy();
    const next = await getMeetings({ userId: 'u1', search: '찾는', limitParam: 3, cursor: first.nextCursor! });
    expect(next.meetings.map(meeting => meeting.id)).toEqual(['m249']);
    expect(next.hasMore).toBe(false);
    expect(next.nextCursor).toBeNull();
  });

  it('does not expose viewer-created meetings or perform queries with no references', async () => {
    seedMeeting({ creatorId: 'viewer', groupId: 'unreferenced' });
    const empty = await getMeetings({ userId: 'viewer', includeCreated: false, userFriendGroupIds: [] });
    expect(empty).toEqual({ meetings: [], totalCount: 0, availableYears: [], hasMore: false, nextCursor: null });
    expect(database.reads).toEqual([]);
    seedMeeting({ id: 'allowed', creatorId: 'other', groupId: 'referenced' });
    expect((await getMeetings({ userId: 'viewer', includeCreated: false, userFriendGroupIds: ['referenced'] })).meetings.map(meeting => meeting.id)).toEqual(['allowed']);
    expect(database.reads.some(read => read.filters.some(filter => filter.field === 'creatorId'))).toBe(false);
  });

  it('bounds every first-page and year-range read instead of scanning full documents', async () => {
    for (let index = 0; index < 100; index++) seedMeeting({ id: `m${index}`, dateTime: new Date(baseDate.getTime() - index * 60000) });
    const result = await getMeetings({ userId: 'u1', userFriendGroupIds: ['g1'], limitParam: 9 });
    expect(result.meetings).toHaveLength(9);
    expect(result.hasMore).toBe(true);
    expect(database.reads.length).toBeGreaterThan(0);
    expect(database.reads.every(read => read.limit !== undefined && read.limit <= 31)).toBe(true);
  });

  it('uses Korea midnight for inclusive start and exclusive end of a selected year', async () => {
    seedMeeting({ id: 'before', dateTime: new Date('2025-12-31T14:59:59.999Z') });
    seedMeeting({ id: 'first', dateTime: new Date('2025-12-31T15:00:00.000Z') });
    seedMeeting({ id: 'last', dateTime: new Date('2026-12-31T14:59:59.999Z') });
    seedMeeting({ id: 'after', dateTime: new Date('2026-12-31T15:00:00.000Z') });
    const result = await getMeetings({ userId: 'u1', year: 2026 });
    expect(result.meetings.map(meeting => meeting.id)).toEqual(['last', 'first']);
    expect(result.availableYears).toEqual([2027, 2026, 2025]);
  });

  it('supports ascending cursors and rejects malformed page information', async () => {
    seedMeeting({ id: 'a', dateTime: baseDate }); seedMeeting({ id: 'b', dateTime: baseDate }); seedMeeting({ id: 'c', dateTime: baseDate });
    const first = await getMeetings({ ascending: true, limitParam: 1 });
    expect(first.meetings.map(meeting => meeting.id)).toEqual(['a']);
    expect((await getMeetings({ ascending: true, limitParam: 1, cursor: first.nextCursor! })).meetings.map(meeting => meeting.id)).toEqual(['b']);
    await expect(getMeetings({ cursor: Buffer.from(JSON.stringify({ date: 'invalid', id: 'a' })).toString('base64url') })).rejects.toThrow('페이지');
  });
});

describe('authoritative meeting transactions', () => {
  it('rejects a stale edit revision without mutating a meeting', async () => {
    seedMeeting({ revision: 3 });
    await expect(updateMeeting('m1', { name: '덮어쓰기' }, 2)).rejects.toThrow('변경');
    expect(database.writes).toEqual([]);
    expect(database.documents.get('meetings/m1')?.revision).toBe(3);
  });

  it('rejects a stale finalization revision before saving a snapshot', async () => {
    const meeting = seedMeeting({ revision: 3 });
    const snapshot = calculateSettlement({ meeting, expenses: [makeExpense()], participants: [makeFriend(), makeFriend({ id: 'f2' })] });
    await expect(saveMeetingSettlement('m1', 2, snapshot)).rejects.toThrow('변경');
    expect(database.writes).toEqual([]);
    expect(database.documents.get('meetings/m1')).not.toHaveProperty('settlementSnapshot');
  });

  it('saves the immutable snapshot, finalized state and incremented revision atomically and once', async () => {
    const meeting = seedMeeting({ revision: 3 });
    const snapshot = calculateSettlement({ meeting, expenses: [makeExpense()], participants: [makeFriend(), makeFriend({ id: 'f2' })] });
    const finalized = await saveMeetingSettlement('m1', 3, snapshot);
    expect(finalized).toMatchObject({ isSettled: true, revision: 4, settlementSnapshot: snapshot, settledReserveFundAmount: 0 });
    expect(finalized.settledReserveFundAt).toBeInstanceOf(Date);
    expect(database.transactionRuns).toBe(1);
    expect(database.writes).toHaveLength(1);
    await saveMeetingSettlement('m1', 3, snapshot);
    expect(database.writes).toHaveLength(1);
  });

  it('blocks expense creation, update, deletion and meeting deletion after finalization', async () => {
    seedMeeting({ isSettled: true, revision: 4 });
    database.seed('meetings/m1/expenses/e1', makeExpense());
    await expect(addExpense(makeExpense())).rejects.toThrow('정산');
    await expect(updateExpense('m1', 'e1', { description: '변경' })).rejects.toThrow('정산');
    await expect(deleteExpense('m1', 'e1')).rejects.toThrow('정산');
    await expect(deleteMeeting('m1')).rejects.toThrow('확정');
    expect(database.writes).toEqual([]);
    expect(database.recursiveDeletes).toEqual([]);
    expect(database.documents.has('meetings/m1/expenses/e1')).toBe(true);
  });

  it('revalidates expense payer and split references against the current participant IDs', async () => {
    seedMeeting({ participantIds: ['f2'], revision: 5 });
    database.seed('meetings/m1/expenses/e1', makeExpense());
    await expect(addExpense(makeExpense())).rejects.toThrow('참여자');
    await expect(updateExpense('m1', 'e1', { description: '변경' })).rejects.toThrow('참여자');
    expect(database.writes).toEqual([]);
    expect(database.documents.get('meetings/m1/expenses/e1')?.description).toBe('지출');
  });

  it('creates a valid expense and advances its parent revision in one commit', async () => {
    seedMeeting({ revision: 5 });
    const expense = await addExpense(makeExpense());
    expect(database.documents.get(`meetings/m1/expenses/${expense.id}`)).toMatchObject({ totalAmount: 10000, paidById: 'f1' });
    expect(database.documents.get('meetings/m1')?.revision).toBe(6);
    expect(database.transactionRuns).toBe(1);
    expect(database.writes.map(write => write.kind)).toEqual(['create', 'update']);
  });

  it('rejects creation after a group has been archived or a participant has changed', async () => {
    const data = makeMeeting();
    database.seed('friendGroups/g1', makeFriendGroup({ isArchived: true }));
    await expect(addMeeting(data)).rejects.toThrow('보관');
    expect(database.writes).toEqual([]);
    database.seed('friendGroups/g1', makeFriendGroup());
    await expect(addMeeting({ ...data, participantIds: ['f1'] })).rejects.toThrow('참여자');
    database.seed('friends/f1', makeFriend({ isArchived: true }));
    await expect(addMeeting({ ...data, participantIds: ['f1'] })).rejects.toThrow('참여자');
    expect(database.writes).toEqual([]);
  });

  it('removes an open parent atomically before recursively cleaning its expense records', async () => {
    seedMeeting(); database.seed('meetings/m1/expenses/e1', makeExpense());
    await deleteMeeting('m1');
    expect(database.writes).toEqual([{ kind: 'delete', path: 'meetings/m1' }]);
    expect(database.recursiveDeletes).toEqual(['meetings/m1']);
    expect(database.documents.has('meetings/m1')).toBe(false);
    expect(database.documents.has('meetings/m1/expenses/e1')).toBe(false);
    await expect(addExpense(makeExpense())).rejects.toThrow('정산');
  });
});
