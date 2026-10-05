import { describe, expect, it } from 'vitest';
import { currentRequestUser, withRequestUser } from '../request-user';
import { makeUser } from '@/lib/actions/__tests__/fixtures';

describe('request-local verified user', () => {
  it('keeps concurrent requests isolated across await boundaries', async () => {
    const first = makeUser({ id: 'first' }), second = makeUser({ id: 'second' });
    const seen = await Promise.all([first, second].map(user => withRequestUser(user, async () => {
      await Promise.resolve(); expect(currentRequestUser()).toBe(user);
      await new Promise(resolve => setTimeout(resolve, 1));
      return currentRequestUser()?.id;
    })));
    expect(seen).toEqual(['first', 'second']);
    expect(currentRequestUser()).toBeUndefined();
  });
});
