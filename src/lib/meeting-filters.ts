import type { Meeting } from './types';

export interface MeetingFilters {
  year?: number;
  groupId?: string;
  type?: 'regular' | 'temporary';
  status?: 'pending' | 'finalized';
  search?: string;
}

export function matchesMeetingFilters(meeting: Meeting, filters: MeetingFilters): boolean {
  if (filters.type === 'temporary' && !meeting.isTemporary) return false;
  if (filters.type === 'regular' && meeting.isTemporary) return false;
  if (filters.status === 'finalized' && !meeting.isSettled) return false;
  if (filters.status === 'pending' && meeting.isSettled) return false;
  if (filters.groupId === 'none' && meeting.groupId && !meeting.isTemporary) return false;
  if (filters.groupId && !['none', 'all'].includes(filters.groupId) && meeting.groupId !== filters.groupId) return false;
  const search = filters.search?.trim().normalize('NFKC').toLocaleLowerCase('ko');
  return !search || meeting.name.normalize('NFKC').toLocaleLowerCase('ko').includes(search);
}

export function compareMeetings(a: Meeting, b: Meeting): number {
  return b.dateTime.getTime() - a.dateTime.getTime() || (a.id === b.id ? 0 : a.id > b.id ? -1 : 1);
}
