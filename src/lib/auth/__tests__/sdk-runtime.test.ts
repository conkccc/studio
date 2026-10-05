import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('Firebase Auth runtime compatibility', () => {
  it('loads the SDK and verifies JWKS signatures without require(ESM) support', () => {
    // Use a fresh process with real dependencies: SDK mocks cannot catch the Vercel startup failure.
    const output = execFileSync(process.execPath, ['--no-experimental-require-module', '-e', `
      const assert = require('node:assert/strict');
      const { generateKeyPairSync } = require('node:crypto');
      require('firebase-admin/auth');
      const jwksClient = require('jwks-rsa');
      const jwt = require('jsonwebtoken');

      (async () => {
        const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
        const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'runtime-test', alg: 'RS256', use: 'sig' };
        const client = jwksClient({ fetcher: async () => ({ keys: [jwk] }) });
        const key = await client.getSigningKey(jwk.kid);
        const token = jwt.sign({ sub: 'test-user' }, privateKey, { algorithm: 'RS256', keyid: jwk.kid });
        assert.equal(jwt.verify(token, key.getPublicKey(), { algorithms: ['RS256'] }).sub, 'test-user');
        const [header, , signature] = token.split('.');
        const forgedPayload = Buffer.from(JSON.stringify({ sub: 'forged-user' })).toString('base64url');
        assert.throws(() => jwt.verify([header, forgedPayload, signature].join('.'), key.getPublicKey(), { algorithms: ['RS256'] }), /invalid signature/);
        console.log('Firebase Auth CommonJS and JWKS verification: OK');
      })().catch((error) => { console.error(error); process.exitCode = 1; });
    `], { encoding: 'utf8', timeout: 20_000 });

    expect(output).toContain('Firebase Auth CommonJS and JWKS verification: OK');
  });
});
