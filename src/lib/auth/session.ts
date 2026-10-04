import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { getAdminAuth } from '../firebase-admin';
import { getUserById } from '../data-store';

export const SESSION_COOKIE_NAME = '__session';
export const SESSION_DURATION_MS = 5 * 24 * 60 * 60 * 1000;
export const CSRF_COOKIE_NAME = 'friendsfund-csrf';

export const getAuthenticatedUserId = cache(async (): Promise<string | null> => {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;
  try {
    const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
    return decoded.uid;
  } catch {
    return null;
  }
});

export const getAuthenticatedUser = cache(async () => {
  const uid = await getAuthenticatedUserId();
  return uid ? (await getUserById(uid)) ?? null : null;
});
