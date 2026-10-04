import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import { getAdminAuth } from '../../firebase-admin';
import { getAuthenticatedUserId } from '../session';

vi.mock('server-only', () => ({}));
// Next uses React's server build, which provides cache; Vitest uses React 18's
// client build. Preserve request-local behavior by invoking the function here.
vi.mock('react', () => ({ cache: <T extends (...args: never[]) => unknown>(fn: T) => fn }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('../../firebase-admin', () => ({ getAdminAuth: vi.fn() }));
vi.mock('../../data-store', () => ({ getUserById: vi.fn() }));

const verifySessionCookie = vi.fn();

describe('verified server session', () => {
  beforeEach(() => {
    verifySessionCookie.mockReset();
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: 'signed-cookie' }) } as never);
    vi.mocked(getAdminAuth).mockReturnValue({ verifySessionCookie } as never);
  });

  it('checks revocation and returns only the verified UID', async () => {
    verifySessionCookie.mockResolvedValue({ uid: 'verified-user' });
    expect(await getAuthenticatedUserId()).toBe('verified-user');
    expect(verifySessionCookie).toHaveBeenCalledWith('signed-cookie', true);
  });

  it('rejects expired, forged, or revoked cookies', async () => {
    verifySessionCookie.mockRejectedValue(new Error('invalid session'));
    expect(await getAuthenticatedUserId()).toBeNull();
  });

  it('does not attempt authentication without a cookie', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as never);
    expect(await getAuthenticatedUserId()).toBeNull();
    expect(verifySessionCookie).not.toHaveBeenCalled();
  });
});
