import 'server-only';
import { FieldPath, type Query } from 'firebase-admin/firestore';
import type { Meeting, Expense, Friend } from '../types';
import { database, documentData, collectionData, cleanWrite, Timestamp, chunks } from './shared';
import { getFriendsByIds } from './friends';
import { getUserById } from './users';
import { matchesMeetingFilters, compareMeetings, type MeetingFilters } from '../meeting-filters';
import type { SettlementSnapshot } from '../settlement';
import { getMeetingParticipantIds } from '../settlement';
import { validateExpenseInput } from '../expense-schema';
import { isUnresolvedParticipantName, meetingForDisplay, meetingReferenceIds, recordedParticipantName } from '../participant-names';

export const MEETINGS_COLLECTION = 'meetings';
export const EXPENSES_SUBCOLLECTION = 'expenses';
export interface GetMeetingsParams extends MeetingFilters {
  limitParam?: number;
  page?: number;
  cursor?: string;
  userId?: string;
  userFriendGroupIds?: string[];
  includeCreated?: boolean;
  includeYears?: boolean;
  after?: Date;
  before?: Date;
  ascending?: boolean;
}
export interface GetMeetingsResult {
  meetings: Meeting[];
  totalCount: number;
  availableYears: number[];
  nextCursor: string | null;
  hasMore: boolean;
}

function encodeCursor(meeting: Meeting): string {
  return Buffer.from(JSON.stringify({ date: meeting.dateTime.toISOString(), id: meeting.id })).toString('base64url');
}
function decodeCursor(cursor?: string): { date: Date; id: string } | null {
  if (!cursor) return null;
  if (cursor.length > 512) throw new Error('페이지 정보가 올바르지 않습니다.');
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const date = new Date(value.date);
    if (!Number.isFinite(date.getTime()) || typeof value.id !== 'string' || !value.id || value.id.includes('/') || value.id.length > 128) throw new Error();
    return { date, id: value.id };
  } catch {
    throw new Error('페이지 정보가 올바르지 않습니다. 필터를 초기화해주세요.');
  }
}

function queryScopes(params: GetMeetingsParams): Query[] {
  const collection = database().collection(MEETINGS_COLLECTION);
  const ids = Array.from(new Set(params.userFriendGroupIds || []));
  const groupId = params.groupId && !['none', 'all'].includes(params.groupId) ? params.groupId : undefined;
  if (!params.userId) return [groupId ? collection.where('groupId', '==', groupId) : collection];
  let own: Query = collection.where('creatorId', '==', params.userId);
  if (groupId) own = own.where('groupId', '==', groupId);
  const groupQueries = groupId
    ? ids.includes(groupId) ? [collection.where('groupId', '==', groupId)] : []
    : chunks(ids).map(chunk => collection.where('groupId', 'in', chunk));
  return [...(params.includeCreated === false ? [] : [own]), ...groupQueries];
}

async function getYearRange(scopes: Query[]): Promise<number[]> {
  const snapshots = await Promise.all(scopes.flatMap(scope => [
    scope.orderBy('dateTime', 'asc').limit(1).get(),
    scope.orderBy('dateTime', 'desc').limit(1).get(),
  ]));
  const years = snapshots.flatMap(snapshot => collectionData<Meeting>(snapshot).map(meeting =>
    new Date(meeting.dateTime.getTime() + 9 * 3600000).getUTCFullYear()));
  if (!years.length) return [];
  const min = Math.min(...years), max = Math.max(...years);
  return Array.from({ length: Math.min(max - min + 1, 150) }, (_, index) => max - index);
}

async function enrichMeetings(meetings: Meeting[]): Promise<Meeting[]> {
  const creatorIds = Array.from(new Set(meetings.filter(meeting => !meeting.creatorName).map(meeting => meeting.creatorId)));
  const friendIds = Array.from(new Set(meetings.flatMap(meeting => (meeting.participantIds || []).filter(id => isUnresolvedParticipantName(recordedParticipantName(meeting, id))))));
  const [creators, friends] = await Promise.all([Promise.all(creatorIds.map(id => getUserById(id))), getFriendsByIds(friendIds)]);
  const creatorNames = new Map(creators.filter(Boolean).map(user => [user!.id, user!.name || '사용자']));
  const names = new Map(friends.map(friend => [friend.id, friend.name]));
  return meetings.map(meeting => ({ ...meetingForDisplay(meeting, friends),
    creatorName: meeting.creatorName || creatorNames.get(meeting.creatorId) || '사용자',
    participantNames: Object.fromEntries((meeting.participantIds || []).map(id => [id,
      recordedParticipantName(meeting, id, names.has(id) ? { name: names.get(id)! } : undefined)])),
  }));
}

export async function getMeetings(params: GetMeetingsParams = {}): Promise<GetMeetingsResult> {
  const limit = Math.min(50, Math.max(1, params.limitParam || 9));
  const scopes = queryScopes(params);
  if (!scopes.length) return { meetings: [], totalCount: 0, availableYears: [], nextCursor: null, hasMore: false };
  const readPage = async () => {
  const direction = params.ascending ? 'asc' : 'desc';
  let boundary = decodeCursor(params.cursor);
  const found = new Map<string, Meeting>();
  let hasMore = false;
  let lastScanned: Meeting | undefined;
  // Legacy missing fields and substring search use bounded server scanning; empty windows retain a cursor.
  const batchSize = Math.max(limit + 1, 30);
  for (let scan = 0; scan < 8; scan++) {
    const snapshots = await Promise.all(scopes.map(scope => {
      let query = scope;
      if (params.year) query = query.where('dateTime', '>=', new Date(Date.UTC(params.year, 0, 1) - 9 * 3600000))
        .where('dateTime', '<', new Date(Date.UTC(params.year + 1, 0, 1) - 9 * 3600000));
      if (params.after) query = query.where('dateTime', '>=', params.after);
      if (params.before) query = query.where('dateTime', '<', params.before);
      query = query.orderBy('dateTime', direction).orderBy(FieldPath.documentId(), direction);
      if (boundary) query = query.startAfter(Timestamp.fromDate(boundary.date), boundary.id);
      return query.limit(batchSize + 1).get();
    }));
    const merged = Array.from(new Map(snapshots.flatMap(snapshot => collectionData<Meeting>(snapshot)).map(meeting => [meeting.id, meeting])).values())
      .sort((a, b) => params.ascending ? -compareMeetings(a, b) : compareMeetings(a, b));
    const scanWindow = merged.slice(0, batchSize);
    hasMore = merged.length > batchSize || snapshots.some(snapshot => snapshot.size > batchSize);
    for (const meeting of scanWindow) {
      lastScanned = meeting;
      if (matchesMeetingFilters(meeting, params)) found.set(meeting.id, meeting);
      if (found.size >= limit + 1) break;
    }
    if (found.size >= limit + 1 || !hasMore || !lastScanned) break;
    boundary = { date: lastScanned.dateTime, id: lastScanned.id };
  }
  const values = Array.from(found.values()), meetings = values.slice(0, limit);
  const moreMatches = values.length > limit;
  const cursorMeeting = moreMatches ? meetings[meetings.length - 1] : lastScanned;
  hasMore = moreMatches || hasMore;
  return { meetings: await enrichMeetings(meetings), totalCount: meetings.length,
    hasMore, nextCursor: hasMore && cursorMeeting ? encodeCursor(cursorMeeting) : null };
  };
  const [page, availableYears] = await Promise.all([
    readPage(),
    params.includeYears === false ? Promise.resolve([]) : getYearRange(queryScopes({ userId: params.userId, userFriendGroupIds: params.userFriendGroupIds, includeCreated: params.includeCreated })),
  ]);
  return { ...page, availableYears };
}

export async function getMeetingById(id: string): Promise<Meeting | undefined> {
  if (!id) return undefined;
  return documentData<Meeting>(await database().collection(MEETINGS_COLLECTION).doc(id).get());
}
export async function addMeeting(data: Partial<Omit<Meeting, 'id' | 'createdAt'>> & { creatorId: string; dateTime: Date }): Promise<Meeting> {
  const value = { isSettled: false, isShareEnabled: false, shareToken: null, shareExpiryDate: null,
    participantIds: [], nonReserveFundParticipants: [], useReserveFund: false, ...data, createdAt: new Date() };
  const ref = database().collection(MEETINGS_COLLECTION).doc();
  await database().runTransaction(async transaction => {
    if (!data.isTemporary) {
      if (!data.groupId) throw new Error('친구 그룹이 필요합니다.');
      const group = await transaction.get(database().collection('friendGroups').doc(data.groupId));
      if (!group.exists || group.data()?.isArchived) throw new Error('친구 그룹이 삭제되었거나 보관되었습니다.');
      const ids = Array.from(new Set([...(data.participantIds || []), ...(data.reserveFundRefundRecipientIds || [])]));
      const friends = ids.length ? await transaction.getAll(...ids.map(id => database().collection('friends').doc(id))) : [];
      if (friends.some(friend => !friend.exists || friend.data()?.isArchived || friend.data()?.groupId !== data.groupId)) throw new Error('참여자가 변경되었습니다. 새로고침 후 다시 선택해주세요.');
    }
    transaction.create(ref, cleanWrite(value));
  });
  return documentData<Meeting>(await ref.get())!;
}
export async function updateMeeting(id: string, updates: Partial<Omit<Meeting, 'id' | 'createdAt'>>, expectedRevision?: number): Promise<Meeting | null> {
  const ref = database().collection(MEETINGS_COLLECTION).doc(id);
  await database().runTransaction(async transaction => {
    const meeting = documentData<Meeting>(await transaction.get(ref));
    if (!meeting) throw new Error('모임을 찾을 수 없습니다.');
    if (expectedRevision !== undefined && (meeting.revision || 0) !== expectedRevision) throw new Error('모임이나 지출이 변경되었습니다. 새로고침 후 다시 수정해주세요.');
    const contentChanged = Object.keys(updates).some(key => !['isShareEnabled', 'shareToken', 'shareExpiryDate'].includes(key));
    if (meeting.isSettled && contentChanged && updates.isSettled !== false) throw new Error('정산을 다시 열어야 수정할 수 있습니다.');
    transaction.update(ref, { ...cleanWrite(updates, true), ...(contentChanged ? { revision: (meeting.revision || 0) + 1 } : {}) });
  });
  return documentData<Meeting>(await ref.get()) || null;
}

export async function saveMeetingSettlement(id: string, expectedRevision: number, snapshot: SettlementSnapshot): Promise<Meeting> {
  const ref = database().collection(MEETINGS_COLLECTION).doc(id);
  await database().runTransaction(async transaction => {
    const meeting = documentData<Meeting>(await transaction.get(ref));
    if (!meeting) throw new Error('모임을 찾을 수 없습니다.');
    if (meeting.isSettled) return;
    if ((meeting.revision || 0) !== expectedRevision) throw new Error('모임이나 지출이 변경되었습니다. 새로고침 후 다시 정산해주세요.');
    transaction.update(ref, cleanWrite({ isSettled: true, settlementSnapshot: snapshot,
      settledReserveFundAmount: snapshot.reserveFund.totalFundUsed, settledReserveFundAt: new Date(), revision: expectedRevision + 1 }));
  });
  return documentData<Meeting>(await ref.get())!;
}
export async function deleteMeeting(id: string): Promise<void> {
  const ref = database().collection(MEETINGS_COLLECTION).doc(id);
  await database().runTransaction(async transaction => {
    const meeting = documentData<Meeting>(await transaction.get(ref));
    if (!meeting) throw new Error('모임을 찾을 수 없습니다.');
    if (meeting.isSettled) throw new Error('확정된 모임은 정산을 다시 연 뒤 삭제해주세요.');
    transaction.delete(ref);
  });
  // No new expense/finalize transaction can succeed once the parent is gone.
  await database().recursiveDelete(ref);
}
export async function getMeetingByShareToken(token: string): Promise<Meeting | undefined> {
  if (!token) return undefined;
  const meeting = collectionData<Meeting>(await database().collection(MEETINGS_COLLECTION).where('shareToken', '==', token).limit(1).get())[0];
  return meeting?.isShareEnabled && meeting.shareExpiryDate instanceof Date && meeting.shareExpiryDate.getTime() > Date.now() ? meeting : undefined;
}
export async function getMeetingFriends(meeting: Meeting, expenses: Expense[] = []): Promise<Friend[]> {
  const ids = meetingReferenceIds(meeting, expenses);
  const map = new Map((await getFriendsByIds(ids.filter(id => !id.includes('/')))).map(friend => [friend.id, friend]));
  const financialReferences = new Set([
    ...(meeting.reserveFundRefundRecipientIds || []), ...(meeting.settlementSnapshot?.participants || []).map(person => person.friendId),
    ...expenses.flatMap(expense => [expense.paidById, ...(expense.splitAmongIds || []), ...(expense.customSplits || []).map(split => split.friendId)]),
  ]);
  return ids.filter(id => !isUnresolvedParticipantName(recordedParticipantName(meeting, id, map.get(id))) || financialReferences.has(id)).map(id => {
    const friend = map.get(id);
    const saved = meeting.participantSnapshot?.find(person => person.id === id);
    return { ...friend, id, name: recordedParticipantName(meeting, id, friend),
      ...(saved?.description !== undefined ? { description: saved.description } : {}),
      groupId: friend?.groupId || meeting.groupId, createdAt: friend?.createdAt || meeting.createdAt };
  });
}
export async function getExpensesByMeetingId(id: string): Promise<Expense[]> {
  return collectionData<Expense>(await database().collection(MEETINGS_COLLECTION).doc(id).collection(EXPENSES_SUBCOLLECTION).orderBy('createdAt', 'desc').get());
}
export async function getExpenseById(meetingId: string, id: string): Promise<Expense | undefined> {
  return documentData<Expense>(await database().collection(MEETINGS_COLLECTION).doc(meetingId).collection(EXPENSES_SUBCOLLECTION).doc(id).get());
}
export async function addExpense(data: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> {
  const value = { ...data, createdAt: new Date() };
  const meetingRef = database().collection(MEETINGS_COLLECTION).doc(data.meetingId);
  const ref = meetingRef.collection(EXPENSES_SUBCOLLECTION).doc();
  await database().runTransaction(async transaction => {
    const meeting = documentData<Meeting>(await transaction.get(meetingRef));
    if (!meeting || meeting.isSettled) throw new Error('정산을 다시 열어야 지출을 변경할 수 있습니다.');
    const validation = validateExpenseInput(value, getMeetingParticipantIds(meeting));
    if (!validation.success) throw new Error('모임 참여자가 변경되었습니다. 새로고침 후 지출을 입력해주세요.');
    transaction.create(ref, cleanWrite(value));
    transaction.update(meetingRef, { revision: (meeting.revision || 0) + 1 });
  });
  return { ...value, id: ref.id };
}
export async function updateExpense(meetingId: string, id: string, updates: Partial<Omit<Expense, 'id' | 'createdAt' | 'meetingId'>>): Promise<Expense | null> {
  const meetingRef = database().collection(MEETINGS_COLLECTION).doc(meetingId);
  const ref = meetingRef.collection(EXPENSES_SUBCOLLECTION).doc(id);
  await database().runTransaction(async transaction => {
    const meeting = documentData<Meeting>(await transaction.get(meetingRef));
    if (!meeting || meeting.isSettled) throw new Error('정산을 다시 열어야 지출을 변경할 수 있습니다.');
    const existing = documentData<Expense>(await transaction.get(ref));
    if (!existing) throw new Error('지출을 찾을 수 없습니다.');
    const validation = validateExpenseInput({ ...existing, ...updates }, getMeetingParticipantIds(meeting));
    if (!validation.success) throw new Error('모임 참여자가 변경되었습니다. 새로고침 후 지출을 수정해주세요.');
    transaction.update(ref, cleanWrite(updates, true));
    transaction.update(meetingRef, { revision: (meeting.revision || 0) + 1 });
  });
  return documentData<Expense>(await ref.get()) || null;
}
export async function deleteExpense(meetingId: string, id: string): Promise<void> {
  const meetingRef = database().collection(MEETINGS_COLLECTION).doc(meetingId);
  await database().runTransaction(async transaction => {
    const meeting = documentData<Meeting>(await transaction.get(meetingRef));
    if (!meeting || meeting.isSettled) throw new Error('정산을 다시 열어야 지출을 변경할 수 있습니다.');
    transaction.delete(meetingRef.collection(EXPENSES_SUBCOLLECTION).doc(id));
    transaction.update(meetingRef, { revision: (meeting.revision || 0) + 1 });
  });
}
