import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMeetingPrepByIdAction } from '../meeting-prep';
import { getAllParticipantAvailabilitiesAction, getParticipantAvailabilityAction, submitParticipantAvailabilityAction } from '../participant-availability';
import { ensureUserPermission } from '../permissions';
import { dbGetMeetingPrepById, dbGetFriendById, dbGetAllParticipantAvailabilities, dbGetParticipantAvailability, dbUpdateParticipantAvailability, dbAddParticipantAvailability } from '../../data-store';
import type { MeetingPrep, ParticipantAvailability } from '../../types';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../permissions', () => ({ ensureUserPermission: vi.fn() }));
vi.mock('../friends', () => ({ getFriendsByGroupAction: vi.fn() }));
vi.mock('../../data-store', () => ({
  dbAddMeetingPrep: vi.fn(), dbGetMeetingPrepById: vi.fn(), dbGetMeetingPrepsByUser: vi.fn(),
  dbGetAllMeetingPreps: vi.fn(), dbUpdateMeetingPrep: vi.fn(), dbDeleteMeetingPrep: vi.fn(),
  dbGetFriendsByUserFriendGroupIds: vi.fn(), dbGetFriendById: vi.fn(), getFriendGroupById: vi.fn(),
  dbGetAllParticipantAvailabilities: vi.fn(), dbGetParticipantAvailability: vi.fn(),
  dbUpdateParticipantAvailability: vi.fn(), dbAddParticipantAvailability: vi.fn(),
}));

const prep: MeetingPrep = {
  id: 'p1', title: '준비', creatorId: 'owner', friendGroupId: 'g1', participantFriendIds: ['f1'],
  selectedMonths: ['2030-01'], createdAt: new Date(), shareToken: 'valid-share-token', shareExpiryDate: new Date('2099-01-01'),
};
const availability: ParticipantAvailability = {
  id: 'a1', meetingPrepId: 'p1', selectedFriendId: 'f1', password: 'old-password',
  storedDates: ['2030-01-01'], storedAsAvailable: true, submittedAt: new Date(),
};

describe('meeting preparation share access', () => {
  beforeEach(() => {
    vi.mocked(ensureUserPermission).mockResolvedValue({ success: false, error: '로그인이 필요합니다.' });
    vi.mocked(dbGetMeetingPrepById).mockResolvedValue(prep);
    vi.mocked(dbGetFriendById).mockResolvedValue({ id: 'f1', name: '참여자', groupId: 'g1', createdAt: new Date() });
    vi.mocked(dbGetAllParticipantAvailabilities).mockResolvedValue([availability]);
    vi.mocked(dbGetParticipantAvailability).mockResolvedValue(availability);
    vi.mocked(dbUpdateParticipantAvailability).mockImplementation(async (_prep, _friend, updates) => ({ ...availability, ...updates }));
    vi.mocked(dbAddParticipantAvailability).mockImplementation(async data => ({ ...data, id: 'a2', submittedAt: new Date() }));
  });

  it('rejects anonymous access using only a prep ID', async () => {
    expect((await getMeetingPrepByIdAction('p1')).success).toBe(false);
    expect((await getAllParticipantAvailabilitiesAction('p1')).success).toBe(false);
    expect(dbGetAllParticipantAvailabilities).not.toHaveBeenCalled();
  });

  it('checks the exact live token even when a signed-in visitor uses a share link', async () => {
    expect((await getMeetingPrepByIdAction('p1', 'signed-in-user', 'valid-share-token')).success).toBe(true);
    expect(ensureUserPermission).not.toHaveBeenCalled();
    expect((await getMeetingPrepByIdAction('p1', 'signed-in-user', 'wrong-token')).success).toBe(false);
  });

  it('rejects expired, disabled, and deleted shares on every action', async () => {
    for (const change of [{ shareExpiryDate: new Date('2000-01-01') }, { shareToken: null }, { isDeleted: true }]) {
      vi.mocked(dbGetMeetingPrepById).mockResolvedValue({ ...prep, ...change });
      expect((await getAllParticipantAvailabilitiesAction('p1', undefined, 'valid-share-token')).success).toBe(false);
      const result = await submitParticipantAvailabilityAction({ meetingPrepId: 'p1', selectedFriendId: 'f1', password: 'old-password', availableDates: [], unavailableDates: [] }, undefined, 'valid-share-token');
      expect(result.success).toBe(false);
    }
    expect(dbUpdateParticipantAvailability).not.toHaveBeenCalled();
  });

  it('never exposes either password format in single or aggregate responses', async () => {
    vi.mocked(dbGetAllParticipantAvailabilities).mockResolvedValue([{ ...availability, passwordHash: 'hash' }]);
    vi.mocked(dbGetParticipantAvailability).mockResolvedValue({ ...availability, passwordHash: 'hash' });
    const aggregate = await getAllParticipantAvailabilitiesAction('p1', undefined, 'valid-share-token');
    const single = await getParticipantAvailabilityAction('p1', 'f1', undefined, 'valid-share-token');
    expect(JSON.stringify(aggregate)).not.toContain('password');
    expect(JSON.stringify(single)).not.toContain('password');
  });

  it('upgrades a correctly supplied legacy password and returns a sanitized result', async () => {
    const result = await submitParticipantAvailabilityAction({ meetingPrepId: 'p1', selectedFriendId: 'f1', password: 'old-password', availableDates: ['2030-01-01'], unavailableDates: [] }, undefined, 'valid-share-token');
    expect(result.success).toBe(true);
    const updates = vi.mocked(dbUpdateParticipantAvailability).mock.calls[0][2];
    expect(updates.passwordHash).toMatch(/^scrypt\$/);
    expect(updates).not.toHaveProperty('password');
    expect(JSON.stringify(result)).not.toContain('password');
  });

  it('rejects a wrong password and a friend outside the participant list', async () => {
    const payload = { meetingPrepId: 'p1', selectedFriendId: 'f1', password: 'wrong-password', availableDates: [], unavailableDates: [] };
    expect((await submitParticipantAvailabilityAction(payload, undefined, 'valid-share-token')).success).toBe(false);
    expect((await submitParticipantAvailabilityAction({ ...payload, selectedFriendId: 'outsider' }, undefined, 'valid-share-token')).success).toBe(false);
    expect(dbUpdateParticipantAvailability).not.toHaveBeenCalled();
  });
});
