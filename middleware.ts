import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/login', '/share/meeting', '/img', '/favicon.ico', '/api/auth'];

const rateLimitMap = new Map<string, { count: number; last: number }>();
const WINDOW = 60 * 1000;
const LIMIT = 20;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));
  const isNextInternal = pathname.startsWith('/_next/') || pathname.startsWith('/static/') || /\.(.*)$/.test(pathname);

  if (isPublicPath || isNextInternal) {
    return NextResponse.next();
  }

  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, last: now };

  if (now - entry.last > WINDOW) {
    entry.count = 1;
    entry.last = now;
  } else {
    entry.count += 1;
  }
  rateLimitMap.set(ip, entry);

  if (entry.count > LIMIT) {
    return new NextResponse('Too Many Requests (rate limited)', { status: 429 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // _next/static, _next/image, favicon.ico, img/, api/auth/로 시작하는 경로를 제외한 모든 경로에 미들웨어를 적용합니다.
    '/((?!_next/static|_next/image|favicon.ico|img/|api/auth).*)',
  ],
};
