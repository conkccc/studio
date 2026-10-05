import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { currentRequestUser } from '@/lib/auth/request-user';
import * as actions from '@/lib/actions';
import { getMeetingEditDataAction } from '@/lib/actions/page-data';
import { makeUser } from '@/lib/actions/__tests__/fixtures';

vi.mock('@/lib/auth/session', () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock('@/lib/actions/page-data', () => ({ getMeetingEditDataAction: vi.fn() }));
vi.mock('@/lib/actions', () => ({
  getFriendGroupsForUserAction: vi.fn(), getFriendsByGroupAction: vi.fn(), getDashboardAction: vi.fn(),
  getMeetingPrepsAction: vi.fn(), getAllUsersAction: vi.fn(), getAllFriendGroupsAction: vi.fn(), getAllParticipantAvailabilitiesAction: vi.fn(),
}));
const request = (query: string) => new NextRequest(`http://localhost/api/app-data?${query}`);
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getAuthenticatedUser).mockResolvedValue(makeUser({ id: 'verified' })); });
describe('page read API', () => {
  it('rejects a session/account mismatch before it can populate the wrong account cache', async () => {
    const response = await GET(new NextRequest('http://localhost/api/app-data?resource=groups', { headers: { 'X-Expected-User': 'previous-account' } }));
    expect(response.status).toBe(403);
    expect(actions.getFriendGroupsForUserAction).not.toHaveBeenCalled();
  });
  it('requires a session for private resources even if a share token is supplied', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    expect((await GET(request('resource=groups&shareToken=anything'))).status).toBe(401);
    expect(actions.getFriendGroupsForUserAction).not.toHaveBeenCalled();
  });
  it('passes only the verified profile to the request-local permission context', async () => {
    vi.mocked(actions.getFriendGroupsForUserAction).mockImplementation(async () => {
      expect(currentRequestUser()?.id).toBe('verified');
      return { success: true, groups: [] };
    });
    const response = await GET(request('resource=groups&requestingUserId=other'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Server-Timing')).toContain('total;dur=');
    expect(currentRequestUser()).toBeUndefined();
  });
  it.each(['resource=unknown', 'resource=friends', 'resource=friends&id=a%2Fb'])('rejects invalid resource parameters: %s', async query => {
    expect((await GET(request(query))).status).toBe(400);
    expect(actions.getFriendsByGroupAction).not.toHaveBeenCalled();
  });
  it('blocks admin data before launching either query', async () => {
    expect((await GET(request('resource=users'))).status).toBe(403);
    expect(actions.getAllUsersAction).not.toHaveBeenCalled();
    expect(actions.getAllFriendGroupsAction).not.toHaveBeenCalled();
  });
  it('starts independent admin reads together in the same verified request', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(makeUser({ role: 'admin' }));
    let complete!: () => void;
    vi.mocked(actions.getAllUsersAction).mockImplementation(() => new Promise(resolve => { complete = () => resolve({ success: true, users: [] }); }));
    vi.mocked(actions.getAllFriendGroupsAction).mockImplementation(async () => { complete(); return { success: true, groups: [] }; });
    const response = await GET(request('resource=users'));
    expect(response.status).toBe(200);
  });
  it('delegates share validation without waiting for a login session', async () => {
    vi.mocked(actions.getAllParticipantAvailabilitiesAction).mockResolvedValue({ success: false, error: '만료된 공유' });
    const response = await GET(request('resource=prep-detail&id=p1&shareToken=expired'));
    expect(response.status).toBe(403);
    expect(getAuthenticatedUser).not.toHaveBeenCalled();
    expect(actions.getAllParticipantAvailabilitiesAction).toHaveBeenCalledWith('p1', undefined, 'expired');
  });
  it('requires the dedicated edit access check for the edit bundle', async () => {
    vi.mocked(getMeetingEditDataAction).mockResolvedValue({ success: false, error: '수정 권한 없음' });
    expect((await GET(request('resource=meeting-edit&id=m1'))).status).toBe(403);
    expect(getMeetingEditDataAction).toHaveBeenCalledWith('m1');
  });
});
