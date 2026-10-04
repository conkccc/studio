import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getApps: vi.fn(), initializeApp: vi.fn(), cert: vi.fn(), applicationDefault: vi.fn(),
  initializeFirestore: vi.fn(), getFirestore: vi.fn(), getAuth: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/app', () => ({ getApps: mocks.getApps, initializeApp: mocks.initializeApp, cert: mocks.cert, applicationDefault: mocks.applicationDefault }));
vi.mock('firebase-admin/firestore', () => ({ initializeFirestore: mocks.initializeFirestore, getFirestore: mocks.getFirestore }));
vi.mock('firebase-admin/auth', () => ({ getAuth: mocks.getAuth }));
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  for (const key of ['FIREBASE_SERVICE_ACCOUNT', 'GOOGLE_APPLICATION_CREDENTIALS', 'VERCEL', 'FIREBASE_PROJECT_ID', 'GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID']) vi.stubEnv(key, '');
  mocks.getApps.mockReturnValue([]);
  mocks.initializeApp.mockReturnValue({ name: 'test-app' });
  mocks.cert.mockReturnValue({ type: 'certificate' });
  mocks.applicationDefault.mockReturnValue({ type: 'adc' });
});
afterEach(() => vi.unstubAllEnvs());
describe('merged Firebase server initialization', () => {
  it('does not initialize credentials merely by importing during a build', async () => {
    await import('../firebase-admin');
    expect(mocks.initializeApp).not.toHaveBeenCalled();
    expect(mocks.applicationDefault).not.toHaveBeenCalled();
  });
  it('supports JSON credentials and initializes REST Firestore', async () => {
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', JSON.stringify({ project_id: 'test-project' }));
    vi.stubEnv('FIREBASE_PROJECT_ID', 'explicit-project');
    const { getAdminDb } = await import('../firebase-admin');
    getAdminDb();
    expect(mocks.cert).toHaveBeenCalledWith({ project_id: 'test-project' });
    expect(mocks.initializeApp).toHaveBeenCalledWith({ credential: { type: 'certificate' }, projectId: 'explicit-project' });
    expect(mocks.initializeFirestore).toHaveBeenCalledWith({ name: 'test-app' }, { preferRest: true });
  });
  it('preserves Base64 credentials and Google Cloud project fallback', async () => {
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', Buffer.from(JSON.stringify({ project_id: 'test-project' })).toString('base64'));
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'cloud-project');
    const { getAdminAuth } = await import('../firebase-admin');
    getAdminAuth();
    expect(mocks.cert).toHaveBeenCalledWith({ project_id: 'test-project' });
    expect(mocks.initializeApp.mock.calls[0][0].projectId).toBe('cloud-project');
    expect(mocks.getAuth).toHaveBeenCalledWith({ name: 'test-app' });
  });
  it('fails promptly on Vercel without credentials instead of looking up a metadata server', async () => {
    vi.stubEnv('VERCEL', '1');
    const { getAdminDb } = await import('../firebase-admin');
    expect(() => getAdminDb()).toThrow(expect.objectContaining({ code: 'app/invalid-credential' }));
    expect(mocks.applicationDefault).not.toHaveBeenCalled();
  });
  it('continues to use ADC for local and Google-managed runtimes', async () => {
    vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', 'test-credentials-path');
    const { getAdminDb } = await import('../firebase-admin');
    getAdminDb();
    expect(mocks.applicationDefault).toHaveBeenCalledOnce();
    expect(mocks.initializeApp.mock.calls[0][0].credential).toEqual({ type: 'adc' });
  });
  it('reuses an existing app without parsing or replacing credentials', async () => {
    mocks.getApps.mockReturnValue([{ name: 'existing-app' }]);
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', 'invalid-json');
    const { getAdminDb } = await import('../firebase-admin');
    getAdminDb();
    expect(mocks.initializeApp).not.toHaveBeenCalled();
    expect(mocks.initializeFirestore).toHaveBeenCalledWith({ name: 'existing-app' }, { preferRest: true });
  });
  it('keeps a development Firestore instance initialized before hot reload', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    mocks.getApps.mockReturnValue([{ name: 'existing-app' }]);
    mocks.initializeFirestore.mockImplementation(() => { throw Object.assign(new Error('different options'), { code: 'firestore/failed-precondition' }); });
    mocks.getFirestore.mockReturnValue('existing-db');
    const { getAdminDb } = await import('../firebase-admin');
    expect(getAdminDb()).toBe('existing-db');
    expect(mocks.getFirestore).toHaveBeenCalledWith({ name: 'existing-app' });
  });
  it('does not hide Firestore initialization errors in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mocks.getApps.mockReturnValue([{ name: 'existing-app' }]);
    mocks.initializeFirestore.mockImplementation(() => { throw Object.assign(new Error('different options'), { code: 'firestore/failed-precondition' }); });
    const { getAdminDb } = await import('../firebase-admin');
    expect(() => getAdminDb()).toThrow('different options');
    expect(mocks.getFirestore).not.toHaveBeenCalled();
  });
});
