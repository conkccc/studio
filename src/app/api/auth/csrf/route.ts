import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { CSRF_COOKIE_NAME } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const existing = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const token = existing && /^[a-f0-9]{64}$/.test(existing) ? existing : randomBytes(32).toString('hex');
  const response = NextResponse.json({ csrfToken: token });
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 30 * 60,
  });
  return response;
}
