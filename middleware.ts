import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Define public paths that do not require authentication
const publicPaths = ['/login', '/share/meeting', '/img', '/favicon.ico', '/api/auth']; 

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the current path is one of the public paths or an internal Next.js path
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));
  const isNextInternal = pathname.startsWith('/_next/') || pathname.startsWith('/static/') || /\.(.*)$/.test(pathname);

  if (isPublicPath || isNextInternal) {
    return NextResponse.next();
  }

  // 항상 다음으로 진행
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
