export interface MeetingListSelection {
  year: string;
  type: 'all' | 'regular' | 'temporary';
  groupId: string;
  status: 'all' | 'pending' | 'finalized';
  search: string;
}

export const defaultMeetingListSelection: Readonly<MeetingListSelection> = Object.freeze({ year: 'all', type: 'all', groupId: 'all', status: 'all', search: '' });
const selectionKeys = ['year', 'type', 'groupId', 'status', 'search'] as const;
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;

export const meetingListStorageKey = (userId: string) => `friendsfund:meetings:filters:v3:${userId}`;

function normalizeSelection(value: unknown): MeetingListSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const year = typeof data.year === 'string' && /^\d{4}$/.test(data.year) && Number(data.year) >= 1900 && Number(data.year) <= 2200 ? data.year : 'all';
  return {
    year,
    type: data.type === 'regular' || data.type === 'temporary' ? data.type : 'all',
    groupId: typeof data.groupId === 'string' && data.groupId.length > 0 && data.groupId.length <= 128 && !data.groupId.includes('/') ? data.groupId : 'all',
    status: data.status === 'pending' || data.status === 'finalized' ? data.status : 'all',
    search: typeof data.search === 'string' ? data.search.trim().slice(0, 100) : '',
  };
}

export function meetingListSelectionFromQuery(query: string): MeetingListSelection {
  const params = new URLSearchParams(query);
  return normalizeSelection(Object.fromEntries(selectionKeys.map(key => [key, params.get(key)])))!;
}

export function readMeetingListSelection(storage: StorageAccess, userId: string): MeetingListSelection | null {
  try {
    const raw = storage.getItem(meetingListStorageKey(userId));
    return raw ? normalizeSelection(JSON.parse(raw)) : null;
  } catch { return null; }
}

export function saveMeetingListSelection(storage: StorageAccess, userId: string, selection: MeetingListSelection): void {
  try { storage.setItem(meetingListStorageKey(userId), JSON.stringify(selection)); } catch { /* Preferences must not block a page when storage is disabled or full. */ }
}

/** Deep links and back/forward navigation always take precedence over remembered preferences. */
export function restoreMeetingListQuery(query: string, saved: MeetingListSelection | null): string {
  const params = new URLSearchParams(query);
  if (!saved || [...selectionKeys, 'cursor', 'history', 'page'].some(key => params.has(key))) return query;
  for (const key of selectionKeys) {
    const value = saved[key];
    if (value && value !== 'all') params.set(key, value);
  }
  return params.toString();
}
