'use server';

import { revalidatePath } from 'next/cache';
import { addExpense, updateExpense, deleteExpense, getExpensesByMeetingId, getExpenseById } from '../data-store';
import type { Expense } from '../types';
import { validateExpenseInput } from '../expense-schema';
import { getMeetingParticipantIds } from '../settlement';
import { ensureMeetingAccess } from '../services/access';

export async function getExpensesByMeetingIdAction(meetingId: string) {
  try {
    const access = await ensureMeetingAccess(meetingId);
    if (!access.success) return { success: false, error: access.error, expenses: [] };
    return { success: true, expenses: await getExpensesByMeetingId(meetingId) };
  } catch { return { success: false, error: '지출 목록을 불러오지 못했습니다.', expenses: [] }; }
}

export async function createExpenseAction(data: Omit<Expense, 'id' | 'createdAt'>, currentUserId?: string | null) {
  try {
    const access = await ensureMeetingAccess(data.meetingId, currentUserId, true);
    if (!access.success) return access;
    if (access.meeting.isSettled) return { success: false, error: '정산을 다시 연 뒤 지출을 추가해주세요.' };
    const parsed = validateExpenseInput(data, getMeetingParticipantIds(access.meeting));
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
    const expense = await addExpense({ ...parsed.data, meetingId: access.meeting.id });
    revalidatePath(`/meetings/${data.meetingId}`); revalidatePath('/');
    return { success: true, expense };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '지출 추가에 실패했습니다.' }; }
}

export async function updateExpenseAction(expenseId: string, meetingId: string, updates: Partial<Omit<Expense, 'id' | 'createdAt' | 'meetingId'>>, currentUserId?: string | null) {
  try {
    const access = await ensureMeetingAccess(meetingId, currentUserId, true);
    if (!access.success) return access;
    if (access.meeting.isSettled) return { success: false, error: '정산을 다시 연 뒤 지출을 수정해주세요.' };
    const existing = await getExpenseById(meetingId, expenseId);
    if (!existing) return { success: false, error: '지출을 찾을 수 없습니다.' };
    const parsed = validateExpenseInput({ ...existing, ...updates }, getMeetingParticipantIds(access.meeting));
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
    const expense = await updateExpense(meetingId, expenseId, parsed.data);
    revalidatePath(`/meetings/${meetingId}`); revalidatePath('/');
    return { success: true, expense };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '지출 수정에 실패했습니다.' }; }
}

export async function deleteExpenseAction(expenseId: string, meetingId: string, currentUserId?: string | null) {
  try {
    const access = await ensureMeetingAccess(meetingId, currentUserId, true);
    if (!access.success) return access;
    if (access.meeting.isSettled) return { success: false, error: '정산을 다시 연 뒤 지출을 삭제해주세요.' };
    if (!await getExpenseById(meetingId, expenseId)) return { success: false, error: '지출을 찾을 수 없습니다.' };
    await deleteExpense(meetingId, expenseId);
    revalidatePath(`/meetings/${meetingId}`); revalidatePath('/');
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '지출 삭제에 실패했습니다.' }; }
}
