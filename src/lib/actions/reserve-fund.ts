'use server';

import { revalidatePath } from 'next/cache';
import { getExpensesByMeetingId, getMeetingFriends, saveMeetingSettlement, updateMeeting } from '../data-store';
import { ensureMeetingAccess } from '../services/access';
import { calculateSettlement } from '../settlement';
import { meetingForDisplay } from '../participant-names';

export async function finalizeMeetingSettlementAction(meetingId: string, currentUserId?: string | null) {
  try {
    const access = await ensureMeetingAccess(meetingId, currentUserId, true);
    if (!access.success) return access;
    if (access.meeting.isSettled) return { success: true, meeting: access.meeting, message: '이미 정산이 확정된 모임입니다.' };
    const expenses = await getExpensesByMeetingId(meetingId);
    const friends = await getMeetingFriends(access.meeting, expenses);
    if (!expenses.length) return { success: false, error: '지출을 등록한 뒤 정산해주세요.' };
    const snapshot = calculateSettlement({ meeting: meetingForDisplay(access.meeting, friends), expenses, participants: friends, allFriends: friends });
    if (snapshot.warnings.length) return { success: false, error: '참여자나 지출 정보를 확인해주세요. ' + snapshot.warnings.join(' ') };
    const meeting = await saveMeetingSettlement(meetingId, access.meeting.revision || 0, snapshot);
    revalidatePath(`/meetings/${meetingId}`); revalidatePath('/meetings'); revalidatePath('/');
    return { success: true, meeting, message: `정산을 확정했습니다. 총 지출 ${snapshot.totalSpent.toLocaleString()}원, 회비 사용 ${snapshot.reserveFund.totalFundUsed.toLocaleString()}원.` };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '정산 확정에 실패했습니다.' }; }
}

export async function reopenMeetingSettlementAction(meetingId: string, currentUserId?: string | null) {
  try {
    const access = await ensureMeetingAccess(meetingId, currentUserId, true);
    if (!access.success) return access;
    const meeting = await updateMeeting(meetingId, { isSettled: false, settlementSnapshot: undefined, settledReserveFundAmount: undefined, settledReserveFundAt: undefined });
    revalidatePath(`/meetings/${meetingId}`); revalidatePath('/meetings'); revalidatePath('/');
    return { success: true, meeting };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '정산을 다시 열지 못했습니다.' }; }
}
