import { describe, expect, it } from 'vitest';
import { paymentInfoSchema, registeredPaymentAccount, buildTossTransferLink } from '../payment-info';

const account = { bankName: ' 국민은행 ', accountNumber: '0012-345 678', accountHolder: ' 친구 ' };

describe('account-based Toss handoff', () => {
  it('encodes the recipient bank and exact amount, preserving leading account zeroes', () => {
    const link = new URL(buildTossTransferLink(account, 12345)!);
    expect(link.protocol).toBe('supertoss:');
    expect(link.hostname).toBe('send');
    expect(Object.fromEntries(link.searchParams)).toEqual({ bank: '국민은행', accountNo: '0012345678', amount: '12345', origin: 'qr' });
    expect(link.searchParams.has('name')).toBe(false);
  });

  it('encodes bank text without permitting extra parameters', () => {
    const link = new URL(buildTossTransferLink({ ...account, bankName: '은행&amount=1#fragment' }, 5000)!);
    expect(link.searchParams.get('bank')).toBe('은행&amount=1#fragment');
    expect(link.searchParams.getAll('amount')).toEqual(['5000']);
    expect(link.hash).toBe('');
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid amounts: %s', amount => {
    expect(buildTossTransferLink(account, amount)).toBeUndefined();
  });

  it.each([undefined, {}, { accountNumber: '123' }, { ...account, accountNumber: '---' }, { ...account, accountNumber: '123&amount=1' }])('does not hand off missing or invalid accounts: %s', value => {
    expect(registeredPaymentAccount(value)).toBeUndefined();
    expect(buildTossTransferLink(value, 1000)).toBeUndefined();
  });

  it('strips obsolete links and permits clearing every account field', () => {
    expect(paymentInfoSchema.parse({ ...account, tossUrl: 'javascript:alert(1)', kakaopayUrl: 'https://example.com' })).toEqual({ bankName: '국민은행', accountNumber: '0012-345 678', accountHolder: '친구' });
    expect(paymentInfoSchema.safeParse({ bankName: '', accountNumber: '', accountHolder: '' }).success).toBe(true);
  });
});
