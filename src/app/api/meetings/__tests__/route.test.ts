import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { getMeetingsForUserAction } from '@/lib/actions/meetings';
import { makeUser } from '@/lib/actions/__tests__/fixtures';

vi.mock('@/lib/auth/session', () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock('@/lib/actions/meetings', () => ({ getMeetingsForUserAction: vi.fn() }));
const empty = { meetings: [], totalCount: 0, availableYears: [], nextCursor: null, hasMore: false };
const request = (query = '') => new NextRequest(`http://localhost:9002/api/meetings?${query}`);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAuthenticatedUser).mockResolvedValue(makeUser({ id: 'verified-user' }));
  vi.mocked(getMeetingsForUserAction).mockResolvedValue({ success: true, ...empty });
});
describe('merged meeting API authorization', () => {
  it('rejects anonymous access even if another user ID is supplied', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    const response = await GET(request('requestingUserId=admin'));
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(getMeetingsForUserAction).not.toHaveBeenCalled();
  });
  it('rejects impersonation before running a query', async () => {
    expect((await GET(request('requestingUserId=other-user'))).status).toBe(403);
    expect(getMeetingsForUserAction).not.toHaveBeenCalled();
  });
  it('passes all filters and cursor with the verified user instead of requiring a caller ID', async () => {
    const response = await GET(request('year=2026&limit=9&groupId=g1&type=regular&status=pending&search=meal&cursor=cursor-value'));
    expect(response.status).toBe(200);
    expect(getMeetingsForUserAction).toHaveBeenCalledWith({ requestingUserId: 'verified-user', year: 2026, limitParam: 9, groupId: 'g1', type: 'regular', status: 'pending', search: 'meal', cursor: 'cursor-value' });
    expect(await response.json()).toEqual({ success: true, ...empty });
  });
  it.each(['year=NaN', 'limit=51', 'page=0', 'groupId=a%2Fb'])('rejects malformed filters: %s', async query => {
    expect((await GET(request(query))).status).toBe(400);
    expect(getMeetingsForUserAction).not.toHaveBeenCalled();
  });
  it('honors access rejection from the server action', async () => {
    vi.mocked(getMeetingsForUserAction).mockResolvedValue({ success: false, error: '권한 없음', ...empty });
    expect((await GET(request())).status).toBe(403);
  });
  it('does not expose credential paths or SDK errors in a failing response', async () => {
    vi.mocked(getAuthenticatedUser).mockRejectedValue(new Error('private credential details'));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('private credential details');
  });
});
