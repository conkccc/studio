import { z } from 'zod';

export const paymentInfoSchema = z.object({
  bankName: z.string().trim().max(30, '은행명은 30자 이내로 입력해주세요.').optional(),
  accountNumber: z.string().trim().max(40).refine(value => !value || /^[0-9 -]+$/.test(value), '계좌번호에는 숫자, 공백, 하이픈만 입력해주세요.').optional(),
  accountHolder: z.string().trim().max(50, '예금주명은 50자 이내로 입력해주세요.').optional(),
}).refine(value => {
  const fields = [value.bankName, value.accountNumber, value.accountHolder];
  return fields.every(field => !field) || fields.every(Boolean) && /\d/.test(value.accountNumber!);
}, { message: '계좌를 등록할 때는 은행, 계좌번호, 예금주를 모두 입력해주세요.', path: ['accountNumber'] });

export type PaymentInfo = z.infer<typeof paymentInfoSchema>;

export function registeredPaymentAccount(value: unknown): Required<PaymentInfo> | undefined {
  const parsed = paymentInfoSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const { bankName, accountNumber, accountHolder } = parsed.data;
  if (!bankName || !accountNumber || !accountHolder) return undefined;
  return { bankName, accountNumber, accountHolder };
}

/** Experimental app handoff; mobile support must be verified on the installed Toss version. */
export function buildTossTransferLink(value: unknown, amount: number): string | undefined {
  const account = registeredPaymentAccount(value);
  if (!account || !Number.isSafeInteger(amount) || amount <= 0) return undefined;
  const params = new URLSearchParams({
    bank: account.bankName,
    accountNo: account.accountNumber.replace(/[ -]/g, ''),
    amount: String(amount),
    origin: 'qr',
  });
  return `supertoss://send?${params.toString()}`;
}
