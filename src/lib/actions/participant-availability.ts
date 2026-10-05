'use server';

import { revalidatePath } from 'next/cache';
import { format, getDaysInMonth, startOfDay } from 'date-fns';
import {
  dbGetParticipantAvailability,
  dbUpdateParticipantAvailability,
  dbGetAllParticipantAvailabilities,
  dbAddParticipantAvailability,
} from '../data-store';
import type { MeetingPrep, ParticipantAvailability } from '../types';
import { getMeetingPrepByIdAction } from './meeting-prep';
import { hashAvailabilityPassword, verifyAvailabilityPassword, withoutAvailabilitySecrets } from '../auth/availability-password';

function getUpcomingPrepDates(prep: MeetingPrep): string[] {
  const dates: string[] = [];
  const today = startOfDay(new Date());
  for (const monthString of prep.selectedMonths) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthString)) continue;
    const [year, month] = monthString.split('-').map(Number);
    const daysInMonth = getDaysInMonth(new Date(year, month - 1));
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      if (date >= today) dates.push(format(date, 'yyyy-MM-dd'));
    }
  }
  return [...new Set(dates)];
}

function reconstructAvailability(availability: ParticipantAvailability, dates: string[]) {
  const storedDates = new Set(availability.storedDates);
  const availableDates = dates.filter(date => availability.storedAsAvailable ? storedDates.has(date) : !storedDates.has(date));
  const unavailableDates = dates.filter(date => !availableDates.includes(date));
  return { ...withoutAvailabilitySecrets(availability), availableDates, unavailableDates };
}

export async function submitParticipantAvailabilityAction(
  payload: Omit<ParticipantAvailability, 'id' | 'submittedAt' | 'storedDates' | 'storedAsAvailable' | 'passwordHash'> & { availableDates: string[]; unavailableDates: string[] },
  currentUserId?: string | null,
  shareToken?: string
) {
  const { meetingPrepId, selectedFriendId, password, availableDates } = payload;
  if (!meetingPrepId || !selectedFriendId) return { success: false, error: '모임 준비 ID와 친구 ID는 필수입니다.' };
  if (typeof password !== 'string' || !password.trim() || password.length > 256) {
    return { success: false, error: '수정용 비밀번호를 입력해주세요. 비밀번호는 256자 이하여야 합니다.' };
  }
  if (!Array.isArray(availableDates) || availableDates.length > 3660 || availableDates.some(date => typeof date !== 'string')) {
    return { success: false, error: '참석 가능 날짜 형식이 올바르지 않습니다.' };
  }

  try {
    // The share token is verified again on every submission, including for
    // signed-in visitors. An ID alone never authorizes a public request.
    const prepResult = await getMeetingPrepByIdAction(meetingPrepId, currentUserId, shareToken);
    if (!prepResult.success || !prepResult.meetingPrep) return { success: false, error: prepResult.error || '모임 준비를 찾을 수 없습니다.' };
    const prep = prepResult.meetingPrep;
    if (!prep.participantFriendIds.includes(selectedFriendId) || !prep.participantFriends?.some(friend => friend.id === selectedFriendId)) {
      return { success: false, error: '이 모임 준비에 포함된 참여자만 응답할 수 있습니다.' };
    }
    const dates = getUpcomingPrepDates(prep);
    const validDates = new Set(dates);
    if (availableDates.some(date => !validDates.has(date))) {
      return { success: false, error: '선택한 모임 준비 기간 내의 날짜만 제출할 수 있습니다.' };
    }
    const availableSet = new Set(availableDates);
    const filteredAvailableDates = dates.filter(date => availableSet.has(date));
    const unavailableDates = dates.filter(date => !availableSet.has(date));
    const storedAsAvailable = filteredAvailableDates.length <= unavailableDates.length;
    const existing = await dbGetParticipantAvailability(meetingPrepId, selectedFriendId);
    if (existing && !(await verifyAvailabilityPassword(password, existing))) {
      return { success: false, error: '비밀번호가 일치하지 않습니다.' };
    }
    const data = {
      meetingPrepId,
      selectedFriendId,
      passwordHash: existing?.passwordHash ?? await hashAvailabilityPassword(password),
      storedDates: storedAsAvailable ? filteredAvailableDates : unavailableDates,
      storedAsAvailable,
    };
    const availability = existing
      ? await dbUpdateParticipantAvailability(meetingPrepId, selectedFriendId, data)
      : await dbAddParticipantAvailability(data);
    if (!availability) throw new Error('참석 가능 여부를 저장할 수 없습니다.');
    revalidatePath(`/meeting-prep/${meetingPrepId}`);
    if (prep.shareToken) revalidatePath(`/share/meeting-prep/${prep.shareToken}`);
    return { success: true, availability: reconstructAvailability(availability, dates) };
  } catch (error) {
    console.error('submitParticipantAvailabilityAction Error:', error);
    return { success: false, error: '참석 가능 여부 제출에 실패했습니다.' };
  }
}

export async function getParticipantAvailabilityAction(meetingPrepId: string, selectedFriendId: string, currentUserId?: string | null, shareToken?: string) {
  try {
    const prepResult = await getMeetingPrepByIdAction(meetingPrepId, currentUserId, shareToken);
    if (!prepResult.success || !prepResult.meetingPrep) return { success: false, error: prepResult.error || '모임 준비에 접근할 수 없습니다.' };
    const prep = prepResult.meetingPrep;
    if (!prep.participantFriendIds.includes(selectedFriendId)) return { success: false, error: '모임 준비 참여자가 아닙니다.' };
    const availability = await dbGetParticipantAvailability(meetingPrepId, selectedFriendId);
    return { success: true, availability: availability ? reconstructAvailability(availability, getUpcomingPrepDates(prep)) : undefined };
  } catch (error) {
    console.error('getParticipantAvailabilityAction Error:', error);
    return { success: false, error: '참석 가능 여부 조회에 실패했습니다.' };
  }
}

export async function getAllParticipantAvailabilitiesAction(meetingPrepId: string, currentUserId?: string | null, shareToken?: string) {
  try {
    const prepResult = await getMeetingPrepByIdAction(meetingPrepId, currentUserId, shareToken);
    if (!prepResult.success || !prepResult.meetingPrep) return { success: false, error: prepResult.error || '모임 준비에 접근할 수 없습니다.' };
    const prep = prepResult.meetingPrep;
    const availabilities = await dbGetAllParticipantAvailabilities(meetingPrepId);
    const dates = getUpcomingPrepDates(prep);
    return {
      success: true,
      meetingPrep: prep,
      availabilities: availabilities.filter(availability => prep.participantFriendIds.includes(availability.selectedFriendId))
        .map(availability => reconstructAvailability(availability, dates)),
    };
  } catch (error) {
    console.error('getAllParticipantAvailabilitiesAction Error:', error);
    return { success: false, error: '참석 가능 여부 목록 조회에 실패했습니다.' };
  }
}
