import type * as actions from './actions';
import type { getMeetingEditDataAction } from './actions/page-data';
import { ApiReadError } from './api-read-error';

export type AppReadResults = {
  groups: Awaited<ReturnType<typeof actions.getFriendGroupsForUserAction>>;
  friends: Awaited<ReturnType<typeof actions.getFriendsByGroupAction>>;
  dashboard: Awaited<ReturnType<typeof actions.getDashboardAction>>;
  preps: Awaited<ReturnType<typeof actions.getMeetingPrepsAction>>;
  users: { success: boolean; users: import('./types').User[]; groups: import('./types').FriendGroup[] };
  'meeting-edit': Awaited<ReturnType<typeof getMeetingEditDataAction>>;
  'prep-detail': { success: boolean; meetingPrep: import('./types').MeetingPrep | null; availabilities: import('./types').ParticipantAvailability[] };
};
export type AppResource = keyof AppReadResults;
const dateKeys = new Set(['dateTime', 'endTime', 'createdAt', 'shareExpiryDate', 'settledReserveFundAt', 'submittedAt', 'date']);
export function reviveAppDates(value: unknown, key = ''): unknown {
  if (typeof value === 'string' && dateKeys.has(key)) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : value;
  }
  if (Array.isArray(value)) return value.map(item => reviveAppDates(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, reviveAppDates(item, name)]));
  return value;
}
export async function fetchAppData<R extends AppResource>(resource: R, params: { id?: string; shareToken?: string } = {}, signal?: AbortSignal, expectedUserId?: string): Promise<AppReadResults[R]> {
  const query = new URLSearchParams({ resource });
  if (params.id) query.set('id', params.id);
  if (params.shareToken) query.set('shareToken', params.shareToken);
  const response = await fetch(`/api/app-data?${query}`, { cache: 'no-store', signal, headers: expectedUserId ? { 'X-Expected-User': expectedUserId } : undefined });
  const data = await response.json();
  if (!response.ok || !data.success) throw new ApiReadError(data.error || '정보를 불러오지 못했습니다.', response.status);
  return reviveAppDates(data) as AppReadResults[R];
}
