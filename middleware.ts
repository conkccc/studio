import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Define public paths that do not require authentication
const publicPaths = ['/login', '/share/meeting', '/img', '/favicon.ico', '/api/auth']; 

// --- 간단한 메모리 기반 Rate Limiting (IP 기준) ---
const rateLimitMap = new Map<string, { count: number; last: number }>();
const WINDOW = 60 * 1000; // 1분
const LIMIT = 20; // 1분에 20회

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));
  const isNextInternal = pathname.startsWith('/_next/') || pathname.startsWith('/static/') || /\.(.*)$/.test(pathname);

  if (isPublicPath || isNextInternal) {
    return NextResponse.next();
  }

  // --- Rate Limiting 적용 ---
  // Next.js Edge 환경에서는 request.ip가 없으므로 x-forwarded-for만 사용
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
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - img (image files in public/img) - Covered by publicPaths
     * - api/auth (auth related API routes) - Covered by publicPaths
     *
     * Match all paths NOT starting with these, to apply the middleware.
     * The '?!' is a negative lookahead.
     */
    '/((?!_next/static|_next/image|favicon.ico|img/|api/auth).*)',
  ],
};
