
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Define public paths that do not require authentication
const publicPaths = ['/login', '/share/meeting', '/img', '/favicon.ico', '/api/auth']; 

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // If dev mode skip auth is enabled, allow all requests
  if (process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH === "true") {
    return NextResponse.next();
  }

  // Check if the current path is one of the public paths or an internal Next.js path
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));
  const isNextInternal = pathname.startsWith('/_next/') || pathname.startsWith('/static/') || /\.(.*)$/.test(pathname);

  if (isPublicPath || isNextInternal) {
    return NextResponse.next();
  }

  // For all other paths, check for an authentication token (cookie)
  // The actual name of the cookie might vary based on Firebase SDK version or custom setup.
  // Common names: 'firebaseIdToken', '__session', etc.
  // For simplicity, we'll assume a generic name or that Firebase SDK handles client-side redirection effectively
  // if server-side cookie check is too complex here.
  // This basic check is for UI redirection, not for API security.
  const authTokenCookie = request.cookies.get('firebaseIdToken'); // Placeholder name, might need adjustment
                                                               // Or, more reliably, check for a session cookie if you implement server-side sessions.

  if (!authTokenCookie) {
    // If no auth token, redirect to login, preserving the intended destination
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectedFrom', pathname);
    console.log(`Middleware: No auth token, redirecting to ${loginUrl.toString()}`);
    return NextResponse.redirect(loginUrl);
  }

  // If token exists, proceed. Actual token validation and role checks happen client-side in AuthContext and pages.
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
