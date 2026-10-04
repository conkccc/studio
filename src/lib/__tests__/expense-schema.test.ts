import { describe, expect, it } from 'vitest';
import { validateExpenseInput } from '../expense-schema';

const input = { description: '식사', totalAmount: 10000, paidById: 'a', splitType: 'equally', splitAmongIds: ['a', 'b'] };
const validate = (overrides: Record<string, unknown> = {}) => validateExpenseInput({ ...input, ...overrides }, ['a', 'b']);

describe('shared expense validation', () => {
  it('accepts comma formatted integer won and trims descriptions', () => {
    const result = validate({ totalAmount: '10,000', description: ' 식사 ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.totalAmount).toBe(10000);
  });
  it.each([0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '10원', ''])('rejects invalid total %s', totalAmount => {
    expect(validate({ totalAmount }).success).toBe(false);
  });
  it('rejects non-participant payers and split IDs', () => {
    expect(validate({ paidById: 'outsider' }).success).toBe(false);
    expect(validate({ splitAmongIds: ['a', 'outsider'] }).success).toBe(false);
    expect(validate({ splitType: 'custom', customSplits: [{ friendId: 'outsider', amount: 10000 }] }).success).toBe(false);
  });
  it('rejects duplicate and empty split members', () => {
    expect(validate({ splitAmongIds: [] }).success).toBe(false);
    expect(validate({ splitAmongIds: ['a', 'a'] }).success).toBe(false);
    expect(validate({ splitType: 'custom', customSplits: [{ friendId: 'a', amount: 5000 }, { friendId: 'a', amount: 5000 }] }).success).toBe(false);
  });
  it('requires exact integer custom split totals', () => {
    expect(validate({ splitType: 'custom', customSplits: [{ friendId: 'a', amount: 1 }, { friendId: 'b', amount: 9999 }] }).success).toBe(true);
    expect(validate({ splitType: 'custom', customSplits: [{ friendId: 'a', amount: 5000 }, { friendId: 'b', amount: 4999 }] }).success).toBe(false);
    expect(validate({ splitType: 'custom', customSplits: [{ friendId: 'a', amount: 5000.5 }, { friendId: 'b', amount: 4999.5 }] }).success).toBe(false);
    expect(validate({ splitType: 'custom', customSplits: [{ friendId: 'a', amount: -1 }, { friendId: 'b', amount: 10001 }] }).success).toBe(false);
  });
});
