import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toggleMeetingShareAction, toggleMeetingPrepShareAction } from '../share';
import { ensureUserPermission } from '../permissions';
import { getMeetingById, updateMeeting, dbGetMeetingPrepById, dbUpdateMeetingPrep } from '../../data-store';
import { makeMeeting, makeUser } from './fixtures';
import type { MeetingPrep, User } from '../../types';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('nanoid', () => ({ nanoid: () => 'new-share-token' }));
vi.mock('../permissions', () => ({ ensureUserPermission: vi.fn() }));
vi.mock('../../data-store', () => ({ getMeetingById: vi.fn(), updateMeeting: vi.fn(), dbGetMeetingPrepById: vi.fn(), dbUpdateMeetingPrep: vi.fn() }));

let user: User;
const meeting = makeMeeting({ creatorId: 'owner' });
const prep: MeetingPrep = { id: 'prep', title: '일정', creatorId: 'owner', friendGroupId: 'g1', participantFriendIds: ['f1'], selectedMonths: ['2026-10'], createdAt: new Date(), isDeleted: false };

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-04T00:00:00Z')); vi.resetAllMocks();
  user = makeUser({ id: 'owner' });
  // Follow the real permission-helper contract so a missing role restriction is observable.
  vi.mocked(ensureUserPermission).mockImplementation(async (uid, options = {}) => {
    const required = options.requiredRole ? Array.isArray(options.requiredRole) ? options.requiredRole : [options.requiredRole] : undefined;
    if (uid !== user.id || user.role === 'none' || (required && !required.includes(user.role))) return { success: false, error: '권한 없음' };
    return { success: true, user };
  });
  vi.mocked(getMeetingById).mockResolvedValue(meeting);
  vi.mocked(updateMeeting).mockResolvedValue(meeting);
  vi.mocked(dbGetMeetingPrepById).mockResolvedValue(prep);
  vi.mocked(dbUpdateMeetingPrep).mockResolvedValue(prep);
});
afterEach(() => vi.useRealTimers());

describe.each([
  ['meeting', toggleMeetingShareAction, getMeetingById, updateMeeting],
  ['preparation', toggleMeetingPrepShareAction, dbGetMeetingPrepById, dbUpdateMeetingPrep],
] as const)('%s sharing', (_label, toggle, read, write) => {
  it('creates a fresh expiring link for the verified owner', async () => {
    const result = await toggle('id', user.id, true, 7);
    expect(result.success).toBe(true);
    expect(write).toHaveBeenCalledWith('id', expect.objectContaining({ shareToken: 'new-share-token', shareExpiryDate: new Date('2026-10-11T00:00:00Z') }));
  });

  it('clears the token and expiry when sharing is disabled', async () => {
    expect((await toggle('id', user.id, false)).success).toBe(true);
    expect(write).toHaveBeenCalledWith('id', expect.objectContaining({ shareToken: null, shareExpiryDate: null }));
  });

  it('denies an unrelated regular user without changing sharing', async () => {
    user = makeUser({ id: 'unrelated' });
    expect((await toggle('id', user.id, true)).success).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it('allows an administrator to manage sharing', async () => {
    user = makeUser({ id: 'admin', role: 'admin' });
    expect((await toggle('id', user.id, true)).success).toBe(true);
  });

  it('does not let a viewer change sharing even if they created the item before their role changed', async () => {
    user = makeUser({ id: 'owner', role: 'viewer' });
    expect((await toggle('id', user.id, true)).success).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each([0, -1, 91, 1.5, NaN])('rejects invalid expiry %s without accessing records', async days => {
    expect((await toggle('id', user.id, true, days)).success).toBe(false);
    expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });
});
