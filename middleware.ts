
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/login', '/api/auth', '/img', '/favicon.ico']; // 인증 없이 접근 가능한 경로 추가

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authToken = request.cookies.get('firebaseIdToken'); // Firebase Auth SDK가 사용하는 쿠키 이름 (실제 이름은 다를 수 있음, 확인 필요)

  // 공개 경로 또는 API 경로는 미들웨어 처리에서 제외 (Next.js 정적 파일 및 API 경로 패턴)
  if (
    publicPaths.some(path => pathname.startsWith(path)) ||
    pathname.startsWith('/_next/') || // Next.js 내부 정적 파일
    pathname.startsWith('/static/') || // 일반적인 정적 파일 폴더 (만약 사용한다면)
    /\.(.*)$/.test(pathname) // 파일 확장자가 있는 경우 (예: .png, .jpg)
  ) {
    return NextResponse.next();
  }

  // 인증 토큰이 없고, 보호된 경로에 접근하려는 경우 로그인 페이지로 리디렉션
  if (!authToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectedFrom', pathname); // 원래 경로를 쿼리 파라미터로 전달 (선택 사항)
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // 미들웨어가 실행될 경로를 지정합니다.
  // 모든 경로에 대해 실행하되, 특정 경로는 위에서 프로그래밍 방식으로 제외합니다.
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - img (image files in public/img) - 이 부분은 publicPaths로 처리했으므로 matcher에서 제외해도 됨
     */
    '/((?!api|_next/static|_next/image|favicon.ico|img).*)',
  ],
};
