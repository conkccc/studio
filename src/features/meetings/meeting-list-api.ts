import type { MeetingFilters } from '@/lib/meeting-filters';
import type { GetMeetingsResult } from '@/lib/data-store/meetings';
import { meetingDate } from './meeting-date';
import { ApiReadError } from '@/lib/api-read-error';

type ListResponse = GetMeetingsResult & { success: boolean; error?: string };

export async function fetchMeetingList(filters: MeetingFilters & { limitParam?: number; cursor?: string }, signal?: AbortSignal, expectedUserId?: string): Promise<ListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key === 'limitParam' ? 'limit' : key, String(value));
  }
  const response = await fetch(`/api/meetings?${params}`, { cache: 'no-store', signal, headers: expectedUserId ? { 'X-Expected-User': expectedUserId } : undefined });
  const result = await response.json() as ListResponse;
  if (!response.ok || !result.success) throw new ApiReadError(result.error || '모임 목록을 불러오지 못했습니다.', response.status);
  return { ...result, meetings: result.meetings.map(meeting => ({
    ...meeting,
    dateTime: meetingDate(meeting.dateTime),
    createdAt: meetingDate(meeting.createdAt),
    endTime: meeting.endTime ? meetingDate(meeting.endTime) : meeting.endTime,
    shareExpiryDate: meeting.shareExpiryDate ? meetingDate(meeting.shareExpiryDate) : meeting.shareExpiryDate,
    settledReserveFundAt: meeting.settledReserveFundAt ? meetingDate(meeting.settledReserveFundAt) : meeting.settledReserveFundAt,
  })) };
}
