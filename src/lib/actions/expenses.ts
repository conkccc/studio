'use server';

import { revalidatePath } from 'next/cache';
import {
  addExpense as dbAddExpense,
  updateExpense as dbUpdateExpense,
  deleteExpense as dbDeleteExpense,
  getMeetingById as dbGetMeetingById,
  updateMeeting as dbUpdateMeeting,
  dbRevertMeetingDeduction,
  getExpensesByMeetingId as dbGetExpensesByMeetingId,
} from '../data-store';
import type { Expense } from '../types';
import { ensureUserPermission } from './permissions';

export async function getExpensesByMeetingIdAction(meetingId: string) {
  try {
    const expenses = await dbGetExpensesByMeetingId(meetingId);
    return { success: true, expenses };
  } catch (error) {
    console.error(`getExpensesByMeetingIdAction Error for meetingId ${meetingId}:`, error);
    const errorMessage = error instanceof Error ? error.message : '모임의 지출 내역을 가져오는 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage, expenses: [] };
  }
}

// 지출 관련 액션
export async function createExpenseAction(expenseData: Omit<Expense, 'id' | 'createdAt'>, currentUserId?: string | null) {
  const permissionCheck = await ensureUserPermission(currentUserId);
  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const callingUser = permissionCheck.user!;

  try {
    const meeting = await dbGetMeetingById(expenseData.meetingId);
    if (!meeting) return { success: false, error: "모임을 찾을 수 없습니다." };

    const isAdminUser = callingUser.role === 'admin';
    const isCreator = meeting.creatorId === callingUser.id;

    if (!isAdminUser && !isCreator) {
        return { success: false, error: "지출 항목 추가 권한이 없습니다." };
    }

    const newExpense = await dbAddExpense(expenseData);

    if (meeting.isSettled) {
      await dbUpdateMeeting(meeting.id, { isSettled: false });
      if (!meeting.isTemporary && meeting.useReserveFund && meeting.partialReserveFundAmount && meeting.partialReserveFundAmount > 0) {
        await dbRevertMeetingDeduction(meeting.id);
        revalidatePath('/reserve-fund');
      }
    }
    revalidatePath(`/meetings/${expenseData.meetingId}`);
    return { success: true, expense: newExpense };
  } catch (error) {
    console.error("createExpenseAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '지출 항목 추가에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function updateExpenseAction(
  expenseId: string,
  meetingId: string,
  updates: Partial<Omit<Expense, 'id' | 'createdAt' | 'meetingId'>>,
  currentUserId?: string | null
) {
  if (!meetingId || !expenseId) {
    return { success: false, error: "잘못된 요청입니다. 모임 ID 또는 지출 ID가 없습니다."};
  }

  const permissionCheck = await ensureUserPermission(currentUserId);
  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const callingUser = permissionCheck.user!;

  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) return { success: false, error: "모임을 찾을 수 없습니다." };

    const isAdminUser = callingUser.role === 'admin';
    const isCreator = meeting.creatorId === callingUser.id;

    if (!isAdminUser && !isCreator) {
        return { success: false, error: "지출 항목 수정 권한이 없습니다." };
    }

    const updatedExpense = await dbUpdateExpense(meetingId, expenseId, updates);
    if (!updatedExpense) throw new Error('지출 항목 업데이트에 실패했습니다.');

    if (meeting.isSettled) {
      await dbUpdateMeeting(meeting.id, { isSettled: false });
      if (!meeting.isTemporary && meeting.useReserveFund && meeting.partialReserveFundAmount && meeting.partialReserveFundAmount > 0) {
        await dbRevertMeetingDeduction(meeting.id);
        revalidatePath('/reserve-fund');
      }
    }
    revalidatePath(`/meetings/${meetingId}`);
    return { success: true, expense: updatedExpense };
  } catch (error) {
    console.error("updateExpenseAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '지출 항목 수정에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function deleteExpenseAction(expenseId: string, meetingId: string, currentUserId?: string | null) {
   if (!meetingId || !expenseId) {
    return { success: false, error: "잘못된 요청입니다. 모임 ID 또는 지출 ID가 없습니다."};
  }

  const permissionCheck = await ensureUserPermission(currentUserId);
  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const callingUser = permissionCheck.user!;

  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) return { success: false, error: "모임을 찾을 수 없습니다." };

    const isAdminUser = callingUser.role === 'admin';
    const isCreator = meeting.creatorId === callingUser.id;

    if (!isAdminUser && !isCreator) {
        return { success: false, error: "지출 항목 삭제 권한이 없습니다." };
    }

    await dbDeleteExpense(meetingId, expenseId);

    if (meeting.isSettled) {
      await dbUpdateMeeting(meeting.id, { isSettled: false });
      if (!meeting.isTemporary && meeting.useReserveFund && meeting.partialReserveFundAmount && meeting.partialReserveFundAmount > 0) {
        await dbRevertMeetingDeduction(meeting.id);
        revalidatePath('/reserve-fund');
      }
    }
    revalidatePath(`/meetings/${meetingId}`);
    return { success: true };
  } catch (error) {
    console.error("deleteExpenseAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '지출 항목 삭제에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}
