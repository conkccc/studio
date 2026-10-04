'use client';

import type { User as FirebaseUser } from 'firebase/auth';
import type { User } from '../types';

let csrfRequest: Promise<string> | undefined;
let pendingSession: { uid: string; request: Promise<User> } | undefined;

async function getCsrfToken(): Promise<string> {
  if (!csrfRequest) {
    csrfRequest = fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('로그인 보안 정보를 가져올 수 없습니다.');
        return (await response.json()).csrfToken as string;
      });
  }
  try {
    return await csrfRequest;
  } finally {
    csrfRequest = undefined;
  }
}

export async function establishServerSession(user: FirebaseUser): Promise<User> {
  if (pendingSession?.uid === user.uid) return pendingSession.request;
  const request = (async () => {
    const csrfToken = await getCsrfToken();
    const idToken = await user.getIdToken();
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ idToken }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '서버 로그인에 실패했습니다.');
    return { ...result.user, createdAt: new Date(result.user.createdAt) } as User;
  })();
  pendingSession = { uid: user.uid, request };
  try {
    return await request;
  } finally {
    if (pendingSession?.request === request) pendingSession = undefined;
  }
}

export async function clearServerSession(): Promise<void> {
  if (pendingSession) await pendingSession.request.catch(() => {});
  const csrfToken = await getCsrfToken();
  const response = await fetch('/api/auth/session', {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { 'x-csrf-token': csrfToken },
  });
  if (!response.ok) throw new Error('서버에서 로그아웃할 수 없습니다. 다시 시도해주세요.');
}
