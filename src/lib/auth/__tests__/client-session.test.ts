import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User as FirebaseUser } from 'firebase/auth';

const user = (uid: string) => ({ uid, getIdToken: vi.fn().mockResolvedValue(uid) }) as unknown as FirebaseUser;
const profile = (id: string) => new Response(JSON.stringify({ user: { id, role: 'user', createdAt: '2026-10-05T00:00:00Z' } }));
const csrf = () => new Response(JSON.stringify({ csrfToken: 'nonce' }));
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { vi.resetModules(); fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe('session write ordering', () => {
  it('deduplicates simultaneous requests for the same account', async () => {
    fetchMock.mockImplementation(async (url: string) => url.endsWith('/csrf') ? csrf() : profile('a'));
    const { establishServerSession } = await import('../client-session');
    const account = user('a');
    const results = await Promise.all([establishServerSession(account), establishServerSession(account)]);
    expect(results.map(result => result.id)).toEqual(['a', 'a']);
    expect(fetchMock.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(1);
  });
  it('does not let a slower previous account overwrite the next account session', async () => {
    let finishA!: (response: Response) => void;
    const writes: string[] = [];
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith('/csrf')) return Promise.resolve(csrf());
      const id = JSON.parse(options!.body as string).idToken;
      writes.push(id);
      return id === 'a' ? new Promise(resolve => { finishA = resolve; }) : Promise.resolve(profile(id));
    });
    const { establishServerSession } = await import('../client-session');
    const first = establishServerSession(user('a'));
    const second = establishServerSession(user('b'));
    await vi.waitFor(() => expect(writes).toEqual(['a']));
    finishA(profile('a'));
    expect((await second).id).toBe('b');
    await first;
    expect(writes).toEqual(['a', 'b']);
  });
  it('orders logout after login and does not reuse a pre-logout request for a new login', async () => {
    let finish!: (response: Response) => void;
    const writes: string[] = [];
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith('/csrf')) return Promise.resolve(csrf());
      writes.push(options!.method!);
      if (writes.length === 1) return new Promise(resolve => { finish = resolve; });
      return Promise.resolve(options!.method === 'DELETE' ? new Response('{}') : profile('a'));
    });
    const { establishServerSession, clearServerSession } = await import('../client-session');
    const before = establishServerSession(user('a'));
    const logout = clearServerSession();
    const after = establishServerSession(user('a'));
    await vi.waitFor(() => expect(writes).toEqual(['POST']));
    finish(profile('a'));
    await Promise.all([before, logout, after]);
    expect(writes).toEqual(['POST', 'DELETE', 'POST']);
  });
  it('allows logout even if the previous login failed', async () => {
    const writes: string[] = [];
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/csrf')) return csrf();
      writes.push(options!.method!);
      return options!.method === 'POST' ? new Response(JSON.stringify({ error: '로그인 실패' }), { status: 401 }) : new Response('{}');
    });
    const { establishServerSession, clearServerSession } = await import('../client-session');
    await expect(establishServerSession(user('a'))).rejects.toThrow('로그인 실패');
    await clearServerSession();
    expect(writes).toEqual(['POST', 'DELETE']);
  });
});
