import { NextResponse, type NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { addUserOnLogin } from '@/lib/data-store';
import { hasValidCsrfProtection } from '@/lib/auth/csrf';
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME, SESSION_DURATION_MS } from '@/lib/auth/session';
import { describeSessionError, getSessionErrorCode, type SessionStage } from '@/lib/auth/session-error';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!hasValidCsrfProtection(request)) {
    return NextResponse.json({ error: '유효하지 않은 로그인 요청입니다.' }, { status: 403 });
  }
  let idToken: unknown;
  try {
    ({ idToken } = await request.json());
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  if (typeof idToken !== 'string' || idToken.length > 10000 || !idToken) {
    return NextResponse.json({ error: '로그인 인증 정보가 필요합니다.' }, { status: 400 });
  }
  let stage: SessionStage = 'verification';
  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken, true);
    // A previous verified cookie permits token refresh. A new session requires
    // a recent sign-in so a stolen, long-lived client token cannot start one.
    const existingCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    let sameSession = false;
    if (existingCookie) {
      try {
        sameSession = (await auth.verifySessionCookie(existingCookie, true)).uid === decoded.uid;
      } catch {
        sameSession = false;
      }
    }
    if (!sameSession && Date.now() / 1000 - decoded.auth_time > 5 * 60) {
      return NextResponse.json({ error: '안전한 로그인을 위해 Google 계정으로 다시 로그인해주세요.' }, { status: 401 });
    }
    stage = 'cookie';
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_DURATION_MS });
    stage = 'profile';
    const user = await addUserOnLogin({
      id: decoded.uid,
      email: decoded.email ?? null,
      name: typeof decoded.name === 'string' ? decoded.name : null,
    });
    const response = NextResponse.json({ user });
    response.headers.set('Cache-Control', 'no-store');
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DURATION_MS / 1000,
    });
    return response;
  } catch (error) {
    console.error('Server session initialization failed:', { stage, code: getSessionErrorCode(error) });
    const failure = describeSessionError(error, stage, process.env.NODE_ENV === 'development');
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasValidCsrfProtection(request)) {
    return NextResponse.json({ error: '유효하지 않은 로그아웃 요청입니다.' }, { status: 403 });
  }
  const response = NextResponse.json({ success: true });
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set(SESSION_COOKIE_NAME, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  response.cookies.set(CSRF_COOKIE_NAME, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 });
  return response;
}
