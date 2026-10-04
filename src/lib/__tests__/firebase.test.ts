import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

vi.mock('firebase/app', () => ({ getApp: vi.fn(), getApps: vi.fn(), initializeApp: vi.fn() }));
vi.mock('firebase/auth', () => ({ getAuth: vi.fn() }));

const environmentNames = [
  'NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', 'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID', 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
];
const app = { name: '[DEFAULT]' } as FirebaseApp;
const auth = { app } as Auth;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  environmentNames.forEach(name => vi.stubEnv(name, ''));
  vi.mocked(getApps).mockReturnValue([]);
  vi.mocked(initializeApp).mockReturnValue(app);
  vi.mocked(getApp).mockReturnValue(app);
  vi.mocked(getAuth).mockReturnValue(auth);
});
afterEach(() => vi.unstubAllEnvs());

function configureLogin() {
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'test-api-key');
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'test-project');
}

describe('Firebase configuration boundary', () => {
  it('imports safely without environment variables and never initializes the SDK', async () => {
    const firebaseClient = await import('../firebase');
    expect(firebaseClient.missingFirebaseVariables).toEqual(environmentNames.slice(0, 3));
    expect(firebaseClient.firebaseConfigurationError).toContain('설정');
    expect(initializeApp).not.toHaveBeenCalled();
    expect(getAuth).not.toHaveBeenCalled();
    expect(() => firebaseClient.getClientAuth()).toThrow('로그인 설정');
  });

  it('treats copied example values as unset instead of attempting a fake login', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'your-public-firebase-api-key');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'your-project.firebaseapp.com');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'your-project');
    const firebaseClient = await import('../firebase');
    expect(firebaseClient.missingFirebaseVariables).toHaveLength(3);
    expect(() => firebaseClient.getClientAuth()).toThrow();
    expect(getAuth).not.toHaveBeenCalled();
  });

  it('reports only the field that is missing', async () => {
    configureLogin();
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', '');
    expect((await import('../firebase')).missingFirebaseVariables).toEqual(['NEXT_PUBLIC_FIREBASE_PROJECT_ID']);
  });

  it('allows login configuration without unrelated Storage, Messaging, Analytics or Maps settings', async () => {
    configureLogin();
    const firebaseClient = await import('../firebase');
    expect(firebaseClient.firebaseConfigurationError).toBeNull();
    expect(getAuth).not.toHaveBeenCalled();
    expect(firebaseClient.getClientAuth()).toBe(auth);
    expect(initializeApp).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'test-project', authDomain: 'test.firebaseapp.com' }));
  });

  it('initializes authentication once on demand', async () => {
    configureLogin();
    const firebaseClient = await import('../firebase');
    expect(firebaseClient.getClientAuth()).toBe(firebaseClient.getClientAuth());
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(getAuth).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing SDK app', async () => {
    configureLogin();
    vi.mocked(getApps).mockReturnValue([app]);
    expect((await import('../firebase')).getClientAuth()).toBe(auth);
    expect(initializeApp).not.toHaveBeenCalled();
    expect(getApp).toHaveBeenCalledTimes(1);
  });
});
