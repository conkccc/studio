import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMeetingList } from '../meeting-list-api';
import { makeMeeting } from '@/lib/actions/__tests__/fixtures';

const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(new Response(JSON.stringify({ success: true, meetings: [makeMeeting()], totalCount: 1, availableYears: [2026], nextCursor: 'next', hasMore: true }), { status: 200 }));
});
afterEach(() => vi.unstubAllGlobals());
describe('meeting API list transport', () => {
  it('preserves filtering and cursor parameters without sending a caller user ID', async () => {
    await fetchMeetingList({ year: 2026, limitParam: 9, groupId: 'g1', status: 'pending', type: 'regular', search: '점심 식사', cursor: 'cursor-token' });
    const url = new URL(mockFetch.mock.calls[0][0], 'http://localhost');
    expect(Object.fromEntries(url.searchParams)).toEqual({ year: '2026', limit: '9', groupId: 'g1', status: 'pending', type: 'regular', search: '점심 식사', cursor: 'cursor-token' });
    expect(mockFetch.mock.calls[0][1].cache).toBe('no-store');
  });
  it('revives JSON dates and retains empty result pagination metadata', async () => {
    const result = await fetchMeetingList({});
    expect(result.meetings[0].dateTime).toBeInstanceOf(Date);
    expect(result.meetings[0].createdAt).toBeInstanceOf(Date);
    expect(result.nextCursor).toBe('next');
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ success: true, meetings: [], totalCount: 0, availableYears: [], nextCursor: 'scan-next', hasMore: true })));
    expect(await fetchMeetingList({})).toMatchObject({ meetings: [], nextCursor: 'scan-next', hasMore: true });
  });
  it('reports server failures without treating them as empty successful lists', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ success: false, error: '로그인이 필요합니다.' }), { status: 401 }));
    await expect(fetchMeetingList({})).rejects.toThrow('로그인이 필요합니다.');
  });
  it('forwards cancellation so unmounted or superseded requests can stop', async () => {
    const controller = new AbortController();
    await fetchMeetingList({}, controller.signal);
    expect(mockFetch.mock.calls[0][1].signal).toBe(controller.signal);
  });
});
