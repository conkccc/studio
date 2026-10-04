import { describe, expect, it } from 'vitest';
import { describeSessionError, getSessionErrorCode } from '../session-error';

describe('safe session failure descriptions', () => {
  it('identifies credential setup failures in development', () => {
    const error = { code: 'app/invalid-credential', message: 'secret private key' };
    expect(describeSessionError(error, 'verification', true)).toMatchObject({ status: 503, error: expect.stringContaining('GOOGLE_APPLICATION_CREDENTIALS') });
  });
  it('omits local configuration instructions and SDK details in production', () => {
    const result = describeSessionError({ code: 'app/invalid-credential', message: 'private key' }, 'verification', false);
    expect(result.status).toBe(503);
    expect(result.error).not.toContain('.env');
    expect(result.error).not.toContain('private key');
  });
  it('separates permission failures from invalid user tokens', () => {
    expect(describeSessionError({ code: 7 }, 'profile', true).status).toBe(503);
    expect(describeSessionError({ code: 'auth/id-token-expired' }, 'verification', true).status).toBe(401);
  });
  it('does not log arbitrary error codes that might contain private data', () => {
    expect(getSessionErrorCode({ code: 'credential-secret-value' })).toBe('unknown');
    expect(getSessionErrorCode(new Error('private data'))).toBe('unknown');
  });
});
