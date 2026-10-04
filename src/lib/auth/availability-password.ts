import 'server-only';

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { ParticipantAvailability } from '../types';

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashAvailabilityPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyAvailabilityPassword(password: string, availability: ParticipantAvailability): Promise<boolean> {
  if (availability.passwordHash) {
    const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(availability.passwordHash);
    if (!match) return false;
    const key = await deriveKey(password, match[1]);
    return timingSafeEqual(key, Buffer.from(match[2], 'hex'));
  }
  // Legacy plaintext is used only for verification, then replaced by a hash.
  if (typeof availability.password === 'string' && availability.password) {
    const actual = createHash('sha256').update(password).digest();
    const expected = createHash('sha256').update(availability.password).digest();
    return timingSafeEqual(actual, expected);
  }
  return true;
}

export function withoutAvailabilitySecrets(availability: ParticipantAvailability) {
  const publicAvailability = { ...availability };
  delete publicAvailability.password;
  delete publicAvailability.passwordHash;
  return publicAvailability;
}
