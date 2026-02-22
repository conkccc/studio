'use server';

import { revalidatePath } from 'next/cache';
import { nanoid } from 'nanoid';
import { addDays } from 'date-fns';
import {
  getMeetingById as dbGetMeetingById,
  updateMeeting as dbUpdateMeeting,
  dbGetMeetingPrepById,
  dbUpdateMeetingPrep,
} from '../data-store';
import type { Meeting } from '../types';
import { ensureUserPermission } from './permissions';

// 모임 공유 액션
export async function toggleMeetingShareAction(meetingId: string, currentUserId: string, enable: boolean, expiryDays: number = 7) {
  const permissionCheck = await ensureUserPermission(currentUserId, { entityName: '공유 설정 변경' });
  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const user = permissionCheck.user!;

  try {
    const meeting = await dbGetMeetingById(meetingId);
    if (!meeting) {
      return { success: false, error: "모임을 찾을 수 없습니다." };
    }

    const isCreator = meeting.creatorId === user.id;
    const isAdmin = user.role === 'admin';

    if (!isCreator && !isAdmin) {
      return { success: false, error: "공유 설정을 변경할 권한이 없습니다." };
    }

    let updates: Partial<Omit<Meeting, 'id' | 'createdAt'>>;

    if (enable) {
      const shareToken = nanoid(16);
      const shareExpiryDate = addDays(new Date(), expiryDays);
      updates = {
        isShareEnabled: true,
        shareToken: shareToken,
        shareExpiryDate: shareExpiryDate,
      };
    } else {
      updates = {
        isShareEnabled: false,
        shareToken: null,
        shareExpiryDate: null,
      };
    }

    const updatedMeeting = await dbUpdateMeeting(meetingId, updates);
    if (!updatedMeeting) {
      return { success: false, error: "모임 공유 설정 업데이트에 실패했습니다." };
    }

    revalidatePath(`/meetings/${meetingId}`);
    return { success: true, meeting: updatedMeeting };

  } catch (error) {
    console.error("toggleMeetingShareAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '공유 설정 변경 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}

export async function toggleMeetingPrepShareAction(meetingPrepId: string, currentUserId: string, enable: boolean, expiryDays: number = 7) {
  const permissionCheck = await ensureUserPermission(currentUserId, { entityName: '모임 준비 공유 설정 변경' });
  if (!permissionCheck.success) {
    return { success: false, error: permissionCheck.error };
  }
  const user = permissionCheck.user!;

  try {
    const meetingPrep = await dbGetMeetingPrepById(meetingPrepId);
    if (!meetingPrep) {
      return { success: false, error: "모임 준비를 찾을 수 없습니다." };
    }

    const isCreator = meetingPrep.creatorId === user.id;
    const isAdmin = user.role === 'admin';

    if (!isCreator && !isAdmin) {
      return { success: false, error: "공유 설정을 변경할 권한이 없습니다." };
    }

    let updates: {
      shareToken?: string | null;
      shareExpiryDate?: Date | null;
    };

    if (enable) {
      const shareToken = nanoid(16);
      const shareExpiryDate = addDays(new Date(), expiryDays);
      updates = {
        shareToken: shareToken,
        shareExpiryDate: shareExpiryDate,
      };
    } else {
      updates = {
        shareToken: null,
        shareExpiryDate: null,
      };
    }

    const updatedMeetingPrep = await dbUpdateMeetingPrep(meetingPrepId, updates);
    if (!updatedMeetingPrep) {
      return { success: false, error: "모임 준비 공유 설정 업데이트에 실패했습니다." };
    }

    revalidatePath(`/meeting-prep/${meetingPrepId}`);
    return { success: true, meetingPrep: updatedMeetingPrep };

  } catch (error) {
    console.error("toggleMeetingPrepShareAction Error:", error);
    const errorMessage = error instanceof Error ? error.message : '모임 준비 공유 설정 변경 중 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}
