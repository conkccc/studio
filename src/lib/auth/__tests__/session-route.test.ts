import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, DELETE } from '@/app/api/auth/session/route';
import { getAdminAuth } from '../../firebase-admin';
import { addUserOnLogin } from '../../data-store';

vi.mock('server-only', () => ({}));
vi.mock('../../firebase-admin', () => ({ getAdminAuth: vi.fn() }));
vi.mock('../../data-store', () => ({ addUserOnLogin: vi.fn() }));
vi.mock('../session', () => ({ CSRF_COOKIE_NAME: 'friendsfund-csrf', SESSION_COOKIE_NAME: '__session', SESSION_DURATION_MS: 432000000 }));

const verifyIdToken = vi.fn();
const verifySessionCookie = vi.fn();
const createSessionCookie = vi.fn();
const token = 'a'.repeat(64);

function request(options: { method?: string; origin?: string; cookie?: string; body?: object } = {}) {
  return new NextRequest('https://friendsfund.example/api/auth/session', {
    method: options.method ?? 'POST',
    headers: { origin: options.origin ?? 'https://friendsfund.example', cookie: `friendsfund-csrf=${token}${options.cookie ? `; __session=${options.cookie}` : ''}`, 'x-csrf-token': token, 'Content-Type': 'application/json' },
    ...(options.method === 'DELETE' ? {} : { body: JSON.stringify(options.body ?? { idToken: 'id-token', uid: 'forged-admin', role: 'admin' }) }),
  });
}

describe('server session exchange', () => {
  beforeEach(() => {
    verifyIdToken.mockReset().mockResolvedValue({ uid: 'verified-user', email: 'real@example.com', name: 'Actual name', auth_time: Date.now() / 1000 });
    verifySessionCookie.mockReset();
    createSessionCookie.mockReset().mockResolvedValue('signed-session');
    vi.mocked(getAdminAuth).mockReturnValue({ verifyIdToken, verifySessionCookie, createSessionCookie } as never);
    vi.mocked(addUserOnLogin).mockReset().mockResolvedValue({ id: 'verified-user', role: 'none', createdAt: new Date() });
  });

  it('uses verified claims, creates an HttpOnly cookie, and ignores client UID and role', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(verifyIdToken).toHaveBeenCalledWith('id-token', true);
    expect(addUserOnLogin).toHaveBeenCalledWith({ id: 'verified-user', email: 'real@example.com', name: 'Actual name' });
    expect(response.cookies.get('__session')?.httpOnly).toBe(true);
    expect(response.cookies.get('__session')?.sameSite).toBe('lax');
    expect((await response.json()).user.role).toBe('none');
  });

  it('rejects cross-origin session creation before verifying a token', async () => {
    expect((await POST(request({ origin: 'https://attacker.example' }))).status).toBe(403);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('requires recent login unless an existing verified session belongs to the same user', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'verified-user', auth_time: Date.now() / 1000 - 3600 });
    expect((await POST(request())).status).toBe(401);
    expect(createSessionCookie).not.toHaveBeenCalled();
    verifySessionCookie.mockResolvedValue({ uid: 'other-user' });
    expect((await POST(request({ cookie: 'other-session' }))).status).toBe(401);
    verifySessionCookie.mockResolvedValue({ uid: 'verified-user' });
    expect((await POST(request({ cookie: 'same-session' }))).status).toBe(200);
    expect(verifySessionCookie).toHaveBeenCalledWith('same-session', true);
  });

  it('does not create a session for a rejected ID token', async () => {
    verifyIdToken.mockRejectedValue(Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' }));
    expect((await POST(request())).status).toBe(401);
    expect(createSessionCookie).not.toHaveBeenCalled();
    expect(addUserOnLogin).not.toHaveBeenCalled();
  });

  it('requires CSRF validation for logout and expires both cookies', async () => {
    expect((await DELETE(request({ method: 'DELETE', origin: 'https://attacker.example' }))).status).toBe(403);
    const response = await DELETE(request({ method: 'DELETE' }));
    expect(response.status).toBe(200);
    expect(response.cookies.get('__session')?.maxAge).toBe(0);
    expect(response.cookies.get('friendsfund-csrf')?.maxAge).toBe(0);
  });

  it('distinguishes missing server credentials from a rejected login without leaking SDK details', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    try {
      verifyIdToken.mockRejectedValue(Object.assign(new Error('credential payload: private-key-that-must-not-leak'), { code: 'app/invalid-credential' }));
      const response = await POST(request());
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toContain('GOOGLE_APPLICATION_CREDENTIALS');
      expect(body.error).not.toContain('private-key-that-must-not-leak');
      expect(createSessionCookie).not.toHaveBeenCalled();
      expect(addUserOnLogin).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('does not describe a user-profile storage failure as an invalid Google login', async () => {
    vi.mocked(addUserOnLogin).mockRejectedValue(new Error('internal database details'));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe('사용자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    expect(response.cookies.get('__session')).toBeUndefined();
  });
});
