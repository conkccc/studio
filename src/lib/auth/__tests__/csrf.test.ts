import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hasValidCsrfProtection } from '../csrf';

vi.mock('server-only', () => ({}));
vi.mock('../session', () => ({ CSRF_COOKIE_NAME: 'friendsfund-csrf' }));

const token = 'a'.repeat(64);
function request(origin?: string, headerToken = token) {
  return new NextRequest('https://friendsfund.example/api/auth/session', {
    method: 'POST',
    headers: { ...(origin ? { origin } : {}), cookie: `friendsfund-csrf=${token}`, 'x-csrf-token': headerToken },
  });
}

describe('auth request CSRF validation', () => {
  it('accepts the exact loopback IP origin instead of NextURL normalized localhost', () => {
    const token = 'a'.repeat(64);
    const request = new NextRequest('http://127.0.0.1:9004/api/auth/session', { headers: {
      host: '127.0.0.1:9004', origin: 'http://127.0.0.1:9004', cookie: `friendsfund-csrf=${token}`, 'x-csrf-token': token,
    } });
    expect(hasValidCsrfProtection(request)).toBe(true);
  });

  it('rejects a different origin, even if it is another loopback alias', () => {
    const token = 'a'.repeat(64);
    const request = new NextRequest('http://127.0.0.1:9004/api/auth/session', { headers: {
      host: '127.0.0.1:9004', origin: 'http://localhost:9004', cookie: `friendsfund-csrf=${token}`, 'x-csrf-token': token,
    } });
    expect(hasValidCsrfProtection(request)).toBe(false);
  });

  it('does not trust a host value containing URL credentials or an extra authority', () => {
    const token = 'a'.repeat(64);
    const request = new NextRequest('https://friendsfund.example/api/auth/session', { headers: {
      host: 'attacker@friendsfund.example', origin: 'https://friendsfund.example', cookie: `friendsfund-csrf=${token}`, 'x-csrf-token': token,
    } });
    expect(hasValidCsrfProtection(request)).toBe(false);
  });
  it('accepts matching tokens only from the same origin', () => {
    expect(hasValidCsrfProtection(request('https://friendsfund.example'))).toBe(true);
    expect(hasValidCsrfProtection(request('https://attacker.example'))).toBe(false);
    expect(hasValidCsrfProtection(request())).toBe(false);
    expect(hasValidCsrfProtection(request('https://friendsfund.example', 'b'.repeat(64)))).toBe(false);
  });

  it('rejects missing or malformed tokens without a comparison exception', () => {
    expect(hasValidCsrfProtection(request('https://friendsfund.example', 'short'))).toBe(false);
  });
});
