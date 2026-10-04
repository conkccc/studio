'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { addMeeting, updateMeeting, deleteMeeting, getMeetings, getUserById, getMeetingFriends, getExpensesByMeetingId, getFriendsByIds } from '../data-store';
import type { Meeting } from '../types';
import type { MeetingFilters } from '../meeting-filters';
import { meetingInputSchema } from '../meeting-schema';
import { ensureUserPermission } from './permissions';
import { ensureMeetingAccess, ensureGroupAccess, accessibleGroupIds } from '../services/access';
import { meetingForDisplay } from '../participant-names';

const errorText = (error: unknown) => error instanceof Error ? error.message : '모임 처리 중 오류가 발생했습니다.';
const listInput = z.object({
  year: z.number().int().min(1900).max(2200).optional(),
  limitParam: z.number().int().min(1).max(50).optional(),
  page: z.number().int().positive().optional(),
  requestingUserId: z.string().min(1).max(128).optional(),
  groupId: z.string().max(128).refine(value => !value.includes('/')).optional(),
  type: z.enum(['regular', 'temporary']).optional(),
  status: z.enum(['pending', 'finalized']).optional(),
  search: z.string().trim().max(100).optional(),
  cursor: z.string().max(512).optional(),
});

export async function getMeetingByIdAction(meetingId: string, currentUserId?: string | null) {
  try {
    const access = await ensureMeetingAccess(meetingId, currentUserId);
    if (!access.success) return { success: false, error: access.error, meeting: null };
    const creator = await getUserById(access.meeting.creatorId);
    const friends = await getMeetingFriends(access.meeting);
    return { success: true, meeting: { ...meetingForDisplay(access.meeting, friends), creatorName: access.meeting.creatorName || creator?.name || '사용자' } };
  } catch (error) { return { success: false, error: errorText(error), meeting: null }; }
}

export async function getMeetingDetailsAction(meetingId: string) {
  try {
    const access = await ensureMeetingAccess(meetingId);
    if (!access.success) return { success: false, error: access.error };
    const [expenses, creator] = await Promise.all([
      getExpensesByMeetingId(meetingId), getUserById(access.meeting.creatorId),
    ]);
    const friends = await getMeetingFriends(access.meeting, expenses);
    return { success: true, meeting: { ...meetingForDisplay(access.meeting, friends), creatorName: access.meeting.creatorName || creator?.name || '사용자' }, expenses, friends };
  } catch (error) { return { success: false, error: errorText(error) }; }
}

export async function createMeetingAction(payload: Omit<Meeting, 'id' | 'createdAt' | 'creatorId' | 'isSettled' | 'isShareEnabled' | 'shareToken' | 'shareExpiryDate'>, currentUserId?: string | null) {
  try {
    const permission = await ensureUserPermission(currentUserId, { requiredRole: ['user', 'admin'] });
    if (!permission.success || !permission.user) return { success: false, error: permission.error };
    const parsed = meetingInputSchema.safeParse(payload);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
    const data = parsed.data;
    data.reserveFundCoverAll = data.useReserveFund && !data.isTemporary && data.reserveFundCoverAll;
    let participantSnapshot: Meeting['participantSnapshot'] = [];
    if (!data.isTemporary) {
      const groupAccess = await ensureGroupAccess(data.groupId, permission.user.id);
      if (!groupAccess.success) return groupAccess;
      if (groupAccess.group.isArchived) return { success: false, error: '보관된 그룹에 새 모임을 만들 수 없습니다.' };
      const friends = await getFriendsByIds([...data.participantIds, ...data.reserveFundRefundRecipientIds]);
      if (friends.length !== new Set([...data.participantIds, ...data.reserveFundRefundRecipientIds]).size || friends.some(friend => friend.groupId !== data.groupId || friend.isArchived)) {
        return { success: false, error: '선택한 그룹의 참여자와 환급 대상을 확인해주세요.' };
      }
      participantSnapshot = friends.map(({id, name, description}) => ({ id, name, ...(description ? { description } : {}) }));
    }
    const meeting = await addMeeting({ ...data, creatorId: permission.user.id, creatorName: permission.user.name || '사용자', participantSnapshot,
      ...(data.isTemporary ? { participantIds: [], useReserveFund: false, nonReserveFundParticipants: [], refundReserveFundToNonParticipants: false, reserveFundRefundRecipientIds: [] } : {}) });
    revalidatePath('/meetings'); revalidatePath('/');
    return { success: true, meeting };
  } catch (error) { return { success: false, error: errorText(error) }; }
}

export async function updateMeetingAction(id: string, payload: Partial<Omit<Meeting, 'id' | 'createdAt'>>, currentUserId?: string | null) {
  try {
    const access = await ensureMeetingAccess(id, currentUserId, true);
    if (!access.success) return access;
    if (access.meeting.isSettled) return { success: false, error: '확정된 정산입니다. 정산을 다시 연 뒤 수정해주세요.' };
    const parsed = meetingInputSchema.safeParse({ ...access.meeting, ...payload, isTemporary: access.meeting.isTemporary || false });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
    const data = parsed.data;
    data.reserveFundCoverAll = data.useReserveFund && !data.isTemporary && data.reserveFundCoverAll;
    const existingExpenses = await getExpensesByMeetingId(id);
    const oldIds = access.meeting.isTemporary ? (access.meeting.temporaryParticipants || []).map(p => p.id || p.name) : access.meeting.participantIds || [];
    const newIds = data.isTemporary ? (data.temporaryParticipants || []).map(p => p.id || p.name) : data.participantIds;
    const financialReferences = new Set(existingExpenses.flatMap(expense => [expense.paidById,
      ...(expense.splitAmongIds || []), ...(expense.customSplits || []).map(split => split.friendId)]));
    const recordedRoster = existingExpenses.length && !data.isTemporary ? await getMeetingFriends(access.meeting, existingExpenses) : [];
    const protectedParticipants = new Set(data.isTemporary ? oldIds : recordedRoster.map(friend => friend.id));
    if (existingExpenses.length && (oldIds.some(value => !newIds.includes(value) && (financialReferences.has(value) || protectedParticipants.has(value))) || (!data.isTemporary && access.meeting.groupId !== data.groupId))) {
      return { success: false, error: '지출이 등록된 참여자를 제거하거나 그룹을 바꿀 수 없습니다. 해당 지출을 먼저 수정해주세요.' };
    }
    let participantSnapshot = access.meeting.participantSnapshot;
    if (!data.isTemporary) {
      const group = await ensureGroupAccess(data.groupId, access.user.id);
      if (!group.success) return group;
      const friends = await getFriendsByIds([...data.participantIds, ...data.reserveFundRefundRecipientIds]);
      if (friends.length !== new Set([...data.participantIds, ...data.reserveFundRefundRecipientIds]).size || friends.some(friend => friend.groupId !== data.groupId || (friend.isArchived && !oldIds.includes(friend.id)))) {
        return { success: false, error: '참여자와 환급 대상을 확인해주세요.' };
      }
      const oldSnapshots = new Map((participantSnapshot || []).map(person => [person.id, person]));
      participantSnapshot = friends.map(friend => oldSnapshots.get(friend.id) || { id: friend.id, name: friend.name, ...(friend.description ? { description: friend.description } : {}) });
    }
    const meeting = await updateMeeting(id, { ...data, participantSnapshot }, access.meeting.revision || 0);
    revalidatePath('/meetings'); revalidatePath('/'); revalidatePath(`/meetings/${id}`);
    return { success: true, meeting };
  } catch (error) { return { success: false, error: errorText(error) }; }
}

export async function deleteMeetingAction(id: string, currentUserId?: string | null) {
  try {
    const access = await ensureMeetingAccess(id, currentUserId, true);
    if (!access.success) return access;
    if (access.meeting.isSettled) return { success: false, error: '확정된 모임은 정산을 다시 연 뒤 삭제해주세요.' };
    await deleteMeeting(id);
    revalidatePath('/meetings'); revalidatePath('/');
    return { success: true };
  } catch (error) { return { success: false, error: errorText(error) }; }
}

export async function getMeetingsForUserAction(params: MeetingFilters & { page?: number; limitParam?: number; requestingUserId?: string; cursor?: string }) {
  const empty = { meetings: [], totalCount: 0, availableYears: [], nextCursor: null, hasMore: false };
  try {
    const parsed = listInput.safeParse(params);
    if (!parsed.success) return { success: false, error: '검색 조건을 확인해주세요.', ...empty };
    const permission = await ensureUserPermission(parsed.data.requestingUserId);
    if (!permission.success || !permission.user) return { success: false, error: permission.error, ...empty };
    const user = permission.user;
    const result = await getMeetings({ ...parsed.data, userId: user.role === 'admin' ? undefined : user.id,
      includeCreated: user.role !== 'viewer',
      userFriendGroupIds: user.role === 'admin' ? undefined : await accessibleGroupIds(user) });
    return { success: true, ...result };
  } catch (error) { return { success: false, error: errorText(error), ...empty }; }
}

export async function getDashboardAction() {
  try {
    const permission = await ensureUserPermission(undefined);
    if (!permission.success || !permission.user) return { success: false, error: permission.error, recentMeetings: [], upcomingMeetings: [], pendingMeetings: [] };
    const user = permission.user;
    const scope = { limitParam: 3, includeYears: false, userId: user.role === 'admin' ? undefined : user.id,
      includeCreated: user.role !== 'viewer',
      userFriendGroupIds: user.role === 'admin' ? undefined : await accessibleGroupIds(user) };
    const [recent, upcoming, pending] = await Promise.all([
      getMeetings({ ...scope, before: new Date() }),
      getMeetings({ ...scope, after: new Date(), ascending: true }),
      getMeetings({ ...scope, before: new Date(), status: 'pending' }),
    ]);
    return { success: true, recentMeetings: recent.meetings, upcomingMeetings: upcoming.meetings, pendingMeetings: pending.meetings };
  } catch (error) { return { success: false, error: errorText(error), recentMeetings: [], upcomingMeetings: [], pendingMeetings: [] }; }
}
