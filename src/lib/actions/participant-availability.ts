'use server';

import { revalidatePath } from 'next/cache';
import { format, getDaysInMonth, isSameDay } from 'date-fns';
import {
  dbGetParticipantAvailability,
  dbUpdateParticipantAvailability,
  dbGetAllParticipantAvailabilities,
  dbAddParticipantAvailability,
  dbGetFriendById,
} from '../data-store';
import type { ParticipantAvailability } from '../types';
import { ensureUserPermission } from './permissions';
import { getMeetingPrepByIdAction } from './meeting-prep';

// 참석 가능 여부 관련 액션
export async function submitParticipantAvailabilityAction(
  payload: Omit<ParticipantAvailability, 'id' | 'submittedAt' | 'storedDates' | 'storedAsAvailable'> & { availableDates: string[]; unavailableDates: string[]; },
  currentUserId?: string | null
) {
  const { meetingPrepId, selectedFriendId, password, availableDates, unavailableDates } = payload;

  if (!meetingPrepId || !selectedFriendId) {
    return { success: false, error: "모임 준비 ID와 친구 ID는 필수입니다." };
  }

  try {
    const meetingPrepResult = await getMeetingPrepByIdAction(meetingPrepId, currentUserId);
    if (!meetingPrepResult.success || !meetingPrepResult.meetingPrep) {
      return { success: false, error: meetingPrepResult.error || "모임 준비를 찾을 수 없거나 접근 권한이 없습니다." };
    }
    const meetingPrep = meetingPrepResult.meetingPrep;

    if (currentUserId) {
      const userResult = await ensureUserPermission(currentUserId);
      if (!userResult.success || !userResult.user) {
        return { success: false, error: userResult.error || "사용자 정보를 찾을 수 없습니다." };
      }
      const user = userResult.user;

      const friend = await dbGetFriendById(selectedFriendId);
      if (!friend) {
        return { success: false, error: "친구를 찾을 수 없습니다." };
      }
      if (user.role !== 'admin' && !user.friendGroupIds?.includes(friend.groupId)) {
        return { success: false, error: "선택된 친구에 대한 참석 가능 여부를 제출할 권한이 없습니다." };
      }
      if (!password) {
        return { success: false, error: "수정을 위해 비밀번호를 입력해주세요." };
      }
    } else {
      if (!meetingPrep.shareToken || !meetingPrep.shareExpiryDate || meetingPrep.shareExpiryDate < new Date()) {
        return { success: false, error: "공유 링크가 유효하지 않거나 만료되었습니다." };
      }
      if (!password) {
        return { success: false, error: "수정을 위해 비밀번호를 입력해주세요." };
      }
    }

    const today = format(new Date(), 'yyyy-MM-dd');
    const filteredAvailableDates = availableDates.filter(date => date >= today);
    const filteredUnavailableDates = unavailableDates.filter(date => date >= today);

    let storedDates: string[];
    let storedAsAvailable: boolean;

    if (filteredAvailableDates.length <= filteredUnavailableDates.length) {
      storedDates = filteredAvailableDates;
      storedAsAvailable = true;
    } else {
      storedDates = filteredUnavailableDates;
      storedAsAvailable = false;
    }

    const dataToStore = {
      meetingPrepId,
      selectedFriendId,
      password,
      storedDates,
      storedAsAvailable,
    };

    const existingAvailability = await dbGetParticipantAvailability(meetingPrepId, selectedFriendId);

    if (existingAvailability) {
      if (existingAvailability.password !== undefined && existingAvailability.password !== null && existingAvailability.password !== password) {
        return { success: false, error: "비밀번호가 일치하지 않습니다." };
      }
      const updatedAvailability = await dbUpdateParticipantAvailability(meetingPrepId, selectedFriendId, dataToStore);
      revalidatePath(`/meeting-prep/${meetingPrepId}`);
      if (meetingPrep.shareToken) {
        revalidatePath(`/share/meeting-prep/${meetingPrep.shareToken}`);
      }
      return { success: true, availability: updatedAvailability };
    } else {
      const newAvailability = await dbAddParticipantAvailability(dataToStore);
      revalidatePath(`/meeting-prep/${meetingPrepId}`);
      if (meetingPrep.shareToken) {
        revalidatePath(`/share/meeting-prep/${meetingPrep.shareToken}`);
      }
      return { success: true, availability: newAvailability };
    }
  } catch (error) {
    console.error("submitParticipantAvailabilityAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '참석 가능 여부 제출에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function getParticipantAvailabilityAction(meetingPrepId: string, selectedFriendId: string, currentUserId?: string | null) {
  try {
    const meetingPrepResult = await getMeetingPrepByIdAction(meetingPrepId, currentUserId);
    if (!meetingPrepResult.success || !meetingPrepResult.meetingPrep) {
      return { success: false, error: meetingPrepResult.error || "모임 준비를 찾을 수 없거나 접근 권한이 없습니다." };
    }
    const meetingPrep = meetingPrepResult.meetingPrep;

    const availability = await dbGetParticipantAvailability(meetingPrepId, selectedFriendId);

    if (availability) {
      const allDatesInPrep: string[] = [];
      const today = new Date();
      meetingPrep.selectedMonths.forEach(monthStr => {
        const [year, month] = monthStr.split('-').map(Number);
        const daysInMonth = getDaysInMonth(new Date(year, month - 1));
        for (let i = 1; i <= daysInMonth; i++) {
          const date = new Date(year, month - 1, i);
          if (date >= today || isSameDay(date, today)) {
            allDatesInPrep.push(format(date, 'yyyy-MM-dd'));
          }
        }
      });

      let availableDates: string[] = [];
      let unavailableDates: string[] = [];

      if (availability.storedAsAvailable) {
        availableDates = availability.storedDates;
        unavailableDates = allDatesInPrep.filter(date => !availableDates.includes(date));
      } else {
        unavailableDates = availability.storedDates;
        availableDates = allDatesInPrep.filter(date => !unavailableDates.includes(date));
      }
      return { success: true, availability: { ...availability, availableDates, unavailableDates } };
    }
    return { success: true, availability: undefined };
  } catch (error) {
    console.error("getParticipantAvailabilityAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '참석 가능 여부 조회에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function getAllParticipantAvailabilitiesAction(meetingPrepId: string, currentUserId?: string | null) {
  try {
    const meetingPrepResult = await getMeetingPrepByIdAction(meetingPrepId, currentUserId);
    if (!meetingPrepResult.success || !meetingPrepResult.meetingPrep) {
      return { success: false, error: meetingPrepResult.error || "모임 준비를 찾을 수 없거나 접근 권한이 없습니다." };
    }
    const meetingPrep = meetingPrepResult.meetingPrep;

    const availabilities = await dbGetAllParticipantAvailabilities(meetingPrepId);

    const allDatesInPrep: string[] = [];
    const today = new Date();
    meetingPrep.selectedMonths.forEach(monthStr => {
      const [year, month] = monthStr.split('-').map(Number);
      const daysInMonth = getDaysInMonth(new Date(year, month - 1));
      for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(year, month - 1, i);
        if (date >= today || isSameDay(date, today)) {
          allDatesInPrep.push(format(date, 'yyyy-MM-dd'));
        }
      }
    });

    const reconstructedAvailabilities = availabilities.map(avail => {
      let availableDates: string[] = [];
      let unavailableDates: string[] = [];

      if (avail.storedAsAvailable) {
        availableDates = avail.storedDates;
        unavailableDates = allDatesInPrep.filter(date => !availableDates.includes(date));
      } else {
        unavailableDates = avail.storedDates;
        availableDates = allDatesInPrep.filter(date => !unavailableDates.includes(date));
      }
      return { ...avail, availableDates, unavailableDates };
    });

    return { success: true, availabilities: reconstructedAvailabilities };
  } catch (error) {
    console.error("getAllParticipantAvailabilitiesAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '모든 참석 가능 여부 조회에 실패했습니다.';
    return { success: false, error: errorMessage };
  }
}
