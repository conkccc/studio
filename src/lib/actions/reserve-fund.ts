'use server';

import { revalidatePath } from 'next/cache';
import { doc, getDoc } from 'firebase/firestore';
import {
  getReserveFundBalance,
  dbSetReserveFundBalance,
  dbRecordMeetingDeduction,
  dbRevertMeetingDeduction,
  getMeetingById as dbGetMeetingById,
  updateMeeting as dbUpdateMeeting,
  getExpensesByMeetingId as dbGetExpensesByMeetingId,
} from '../data-store';
import { db } from '../firebase';
import type { FriendGroup } from '../types';
import { ensureUserPermission } from './permissions';

// 회비 관련 액션
export async function setReserveFundBalanceAction(groupId: string, newBalance: number, description?: string, currentUserId?: string | null) {
  if (!groupId) {
    return { success: false, error: "그룹 ID가 필요합니다." };
  }

  const permissionCheck = await ensureUserPermission(currentUserId, { entityName: '회비 잔액 설정' });
  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const callingUser = permissionCheck.user!;

  try {
    let hasPermission = false;
    if (callingUser.role === 'admin') {
      hasPermission = true;
    } else if (callingUser.role === 'user') {
      const groupDocRef = doc(db, 'friendGroups', groupId);
      const groupSnap = await getDoc(groupDocRef);
      if (groupSnap.exists()) {
        const groupData = groupSnap.data() as FriendGroup;
        if (groupData.ownerUserId === callingUser.id) {
          hasPermission = true;
        }
      }
    }

    if (!hasPermission) {
      return { success: false, error: "회비 잔액을 설정할 권한이 없습니다. 그룹 소유자 또는 관리자만 가능합니다." };
    }

    await dbSetReserveFundBalance(groupId, newBalance, description || "수동 잔액 조정");
    revalidatePath('/reserve-fund');
    revalidatePath('/');
    return { success: true, newBalance };
  } catch (error) {
    console.error("setReserveFundBalanceAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '회비 잔액 업데이트에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function finalizeMeetingSettlementAction(meetingId: string, currentUserId?: string | null) {
  const permissionCheck = await ensureUserPermission(currentUserId, {
    requiredRole: 'admin',
    entityName: '정산 확정'
  });

  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }

  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) return { success: false, error: '모임을 찾을 수 없습니다.' };
    if (meeting.isSettled) return { success: true, meeting, message: "이미 정산이 확정된 모임입니다." };
    if (!meeting.useReserveFund || !meeting.partialReserveFundAmount || meeting.partialReserveFundAmount <= 0) {
      const updatedMeeting = await dbUpdateMeeting(meetingId, { isSettled: true });
      if (!updatedMeeting) return { success: false, error: '정산 상태 업데이트에 실패했습니다.' };
      revalidatePath(`/meetings/${meetingId}`);
      revalidatePath('/');
      return { success: true, meeting: updatedMeeting, message: `모임 (${meeting.name}) 정산이 확정되었습니다. (회비 사용 없음)` };
    }

    const expenses = await dbGetExpensesByMeetingId(meetingId);
    if (expenses.length === 0) {
       const updatedMeeting = await dbUpdateMeeting(meetingId, { isSettled: true });
       if (!updatedMeeting) return { success: false, error: '정산 상태 업데이트에 실패했습니다.' };
       revalidatePath(`/meetings/${meetingId}`);
       revalidatePath('/');
       return { success: true, meeting: updatedMeeting, message: `모임 (${meeting.name}) 정산 확정. 지출 내역이 없어 회비는 사용되지 않았습니다.` };
    }

    const currentReserveBalance = await getReserveFundBalance(meeting.groupId);
    const amountToDeduct = meeting.partialReserveFundAmount;

    let message = "";
    let actualDeduction = 0;

    if (amountToDeduct && amountToDeduct > 0) {
        actualDeduction = Math.min(amountToDeduct, currentReserveBalance ?? 0);
        if (actualDeduction > 0.001) {
            await dbRevertMeetingDeduction(meeting.id);
            await dbRecordMeetingDeduction(meeting.groupId, meeting.id, meeting.name, actualDeduction, meeting.dateTime);
            message = `모임 (${meeting.name}) 정산 확정. 회비에서 ${actualDeduction.toLocaleString()}원 사용.`;
            if (actualDeduction < amountToDeduct) {
                message += ` (설정된 금액보다 회비 잔액이 부족하여 부분 사용)`;
            }
        } else if (amountToDeduct > 0 && (currentReserveBalance ?? 0) <= 0.001) {
             message = `모임 (${meeting.name}) 정산 확정. 회비 잔액 부족으로 설정된 금액을 사용할 수 없습니다.`;
        } else {
            message = `모임 (${meeting.name}) 정산 확정. 설정된 회비 사용액이 없거나 0원입니다.`;
        }
    } else {
        message = `모임 (${meeting.name}) 정산 확정. 회비 사용 설정이 없거나 금액이 0원입니다.`;
    }

    const updatedMeeting = await dbUpdateMeeting(meetingId, { isSettled: true });
    if (!updatedMeeting) {
      if(actualDeduction > 0.001) await dbRevertMeetingDeduction(meeting.id);
      return { success: false, error: '정산 상태 업데이트에 실패했습니다.' };
    }

    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath('/reserve-fund');
    revalidatePath('/');
    return { success: true, meeting: updatedMeeting, message };

  } catch (error) {
    console.error("finalizeMeetingSettlementAction Error:", error);
    try {
        const meetingOnError = await dbGetMeetingById(meetingId);
        if (meetingOnError && meetingOnError.useReserveFund && meetingOnError.partialReserveFundAmount && meetingOnError.partialReserveFundAmount > 0) {
            await dbRevertMeetingDeduction(meetingId);
        }
        await dbUpdateMeeting(meetingId, {isSettled: false});
        revalidatePath(`/meetings/${meetingId}`);
        revalidatePath('/reserve-fund');
    } catch (revertError) {
        console.error("Failed to revert settlement status after error:", revertError);
    }
    const errorMessage = error instanceof Error ? error.message : '정산 확정 중 예기치 않은 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}
