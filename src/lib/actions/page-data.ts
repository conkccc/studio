'use server';
import { ensureMeetingAccess } from '../services/access';
import { getExpensesByMeetingId, getMeetingFriends } from '../data-store';
import { getFriendsByGroupAction } from './friends';
import { getFriendGroupsForUserAction } from './friend-groups';
import { meetingForDisplay } from '../participant-names';

export async function getMeetingEditDataAction(id: string) {
  const access = await ensureMeetingAccess(id, undefined, true);
  if (!access.success) return { success: false as const, error: access.error };
  const [expenses, groupResult, friendResult] = await Promise.all([
    getExpensesByMeetingId(id), getFriendGroupsForUserAction(),
    access.meeting.isTemporary ? Promise.resolve({ success: true, friends: [] }) : getFriendsByGroupAction(access.meeting.groupId),
  ]);
  if (!groupResult.success) return { success: false as const, error: groupResult.error };
  if (!friendResult.success) return { success: false as const, error: '참여자 정보를 불러오지 못했습니다.' };
  const recordedFriends = await getMeetingFriends(access.meeting, expenses);
  return { success: true as const, meeting: meetingForDisplay(access.meeting, recordedFriends), expenses, groups: groupResult.groups, friends: friendResult.friends };
}
