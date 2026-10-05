import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // API handlers verify sessions or share tokens and return JSON errors.
  if (pathname === '/login' || pathname.startsWith('/share/') || pathname.startsWith('/api/')) {
    return NextResponse.next();
  }
  // Navigation shortcut only: the layout and actions verify the signed cookie.
  if (!request.cookies.get('__session')?.value) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|img/|api/|.*\\..*).*)'],
};
