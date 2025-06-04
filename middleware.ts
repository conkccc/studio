import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/login', '/share/meeting', '/img', '/favicon.ico', '/api/auth']; 

// --- 간단한 메모리 기반 Rate Limiting (IP 기준) ---
const rateLimitMap = new Map<string, { count: number; last: number }>();
const WINDOW = 60 * 1000; // 1분 (밀리초)
const LIMIT = 20; // 1분당 최대 요청 횟수

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
     * 다음으로 시작하는 경로를 제외한 모든 요청 경로와 일치시킵니다:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화 파일)
     * - favicon.ico (파비콘 파일)
     * - img/ (public/img 내의 이미지 파일 - publicPaths에서도 처리됨)
     * - api/auth/ (인증 관련 API 라우트 - publicPaths에서도 처리됨)
     *
     * 위의 경로로 시작하지 않는 모든 경로에 미들웨어를 적용합니다.
     * '?!'는 부정 전방 탐색(negative lookahead)입니다.
     */
    '/((?!_next/static|_next/image|favicon.ico|img/|api/auth).*)',
  ],
};
