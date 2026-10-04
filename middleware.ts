import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/login' || pathname.startsWith('/share/') || pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }
  // Navigation shortcut only: the layout and actions verify the signed cookie.
  if (!request.cookies.get('__session')?.value) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|img/|api/auth/|.*\\..*).*)'],
};
