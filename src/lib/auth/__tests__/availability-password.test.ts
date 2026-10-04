import { describe, expect, it, vi } from 'vitest';
import { hashAvailabilityPassword, verifyAvailabilityPassword, withoutAvailabilitySecrets } from '../availability-password';
import type { ParticipantAvailability } from '../../types';

vi.mock('server-only', () => ({}));

const availability: ParticipantAvailability = {
  id: 'a1', meetingPrepId: 'p1', selectedFriendId: 'f1',
  storedDates: [], storedAsAvailable: true, submittedAt: new Date(),
};

describe('availability passwords', () => {
  it('uses salted hashes and rejects an incorrect password', async () => {
    const passwordHash = await hashAvailabilityPassword('01234');
    expect(passwordHash).not.toContain('01234');
    expect(await hashAvailabilityPassword('01234')).not.toBe(passwordHash);
    expect(await verifyAvailabilityPassword('01234', { ...availability, passwordHash })).toBe(true);
    expect(await verifyAvailabilityPassword('99999', { ...availability, passwordHash })).toBe(false);
  });

  it('verifies legacy plaintext only when no hash exists', async () => {
    expect(await verifyAvailabilityPassword('old', { ...availability, password: 'old' })).toBe(true);
    expect(await verifyAvailabilityPassword('wrong', { ...availability, password: 'old' })).toBe(false);
    expect(await verifyAvailabilityPassword('old', { ...availability, password: 'old', passwordHash: 'invalid' })).toBe(false);
  });

  it('removes both forms of the secret from action responses', () => {
    const result = withoutAvailabilitySecrets({ ...availability, password: 'old', passwordHash: 'secret' });
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result.selectedFriendId).toBe('f1');
  });
});
