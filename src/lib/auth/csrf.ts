import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { CSRF_COOKIE_NAME } from './session';

export function hasValidCsrfProtection(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  let expectedOrigin = request.nextUrl.origin;
  const host = request.headers.get('host');
  // NextURL normalizes loopback IPs to localhost. Preserve the incoming authority for origin checks.
  if (host) {
    if (!/^[a-zA-Z0-9.:[\]-]+$/.test(host)) return false;
    try { expectedOrigin = new URL(`${request.nextUrl.protocol}//${host}`).origin; } catch { return false; }
  }
  if (origin !== expectedOrigin) return false;
  const cookie = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const header = request.headers.get('x-csrf-token');
  if (!cookie || !header || !/^[a-f0-9]{64}$/.test(cookie) || !/^[a-f0-9]{64}$/.test(header)) return false;
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(header));
}
