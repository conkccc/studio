'use server';

import { revalidatePath } from 'next/cache';
import {
  getMeetingById as dbGetMeetingById,
  updateMeeting as dbUpdateMeeting,
  getExpensesByMeetingId as dbGetExpensesByMeetingId,
} from '../data-store';
import { ensureUserPermission } from './permissions';
import { calculateReserveFundBreakdown } from '../reserve-fund-settlement';

export async function finalizeMeetingSettlementAction(meetingId: string, currentUserId?: string | null) {
  const permissionCheck = await ensureUserPermission(currentUserId, {
    requiredRole: 'admin',
    entityName: '정산 확정',
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }

  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) {
      return { success: false, error: '모임을 찾을 수 없습니다.' };
    }
    if (meeting.isSettled) {
      return { success: true, meeting, message: '이미 정산이 확정된 모임입니다.' };
    }

    const expenses = await dbGetExpensesByMeetingId(meetingId);
    const reserveFundBreakdown = calculateReserveFundBreakdown({
      settings: meeting,
      expenses,
      participantIds: meeting.participantIds || [],
    });
    const settledReserveFundAmount =
      meeting.useReserveFund && expenses.length > 0
        ? reserveFundBreakdown.totalFundUsed
        : 0;

    const updatedMeeting = await dbUpdateMeeting(meetingId, {
      isSettled: true,
      settledReserveFundAmount,
      settledReserveFundAt: new Date(),
    });

    if (!updatedMeeting) {
      return { success: false, error: '정산 상태 업데이트에 실패했습니다.' };
    }

    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath('/');

    const message =
      settledReserveFundAmount > 0.001
        ? `모임 (${meeting.name}) 정산 확정. 회비 ${settledReserveFundAmount.toLocaleString()}원 사용.`
        : `모임 (${meeting.name}) 정산 확정. 회비 사용액이 없습니다.`;

    return { success: true, meeting: updatedMeeting, message };
  } catch (error) {
    console.error('finalizeMeetingSettlementAction Error:', error);
    try {
      await dbUpdateMeeting(meetingId, {
        isSettled: false,
        settledReserveFundAmount: undefined,
        settledReserveFundAt: undefined,
      });
      revalidatePath(`/meetings/${meetingId}`);
    } catch (revertError) {
      console.error('Failed to revert settlement status after error:', revertError);
    }
    const errorMessage = error instanceof Error ? error.message : '정산 확정 중 예기치 않은 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}
