import * as z from 'zod';

const wonInput = (positive: boolean) => z.preprocess(
  value => typeof value === 'string' ? Number(value.replace(/,/g, '').trim() || NaN) : value,
  positive
    ? z.number().finite().safe().int('금액은 1원 단위로 입력해주세요.').positive('금액은 0보다 커야 합니다.')
    : z.number().finite().safe().int('금액은 1원 단위로 입력해주세요.').min(0, '금액은 0 이상이어야 합니다.')
);

export function createExpenseSchema(participantIds: readonly string[]) {
  const membership = new Set(participantIds);
  return z.object({
    description: z.string().trim().min(1, '설명을 입력해주세요.').max(100, '설명은 100자 이내여야 합니다.'),
    totalAmount: wonInput(true),
    paidById: z.string().min(1, '결제자를 선택해주세요.'),
    splitType: z.enum(['equally', 'custom']),
    splitAmongIds: z.array(z.string().min(1)).optional(),
    customSplits: z.array(z.object({ friendId: z.string().min(1), amount: wonInput(false) })).optional(),
  }).superRefine((data, context) => {
    const issue = (message: string, path: (string | number)[]) => context.addIssue({ code: z.ZodIssueCode.custom, message, path });
    if (!membership.has(data.paidById)) issue('결제자는 모임 참여자여야 합니다.', ['paidById']);
    const ids = data.splitType === 'equally' ? data.splitAmongIds || [] : data.customSplits?.map(split => split.friendId) || [];
    const path = data.splitType === 'equally' ? 'splitAmongIds' : 'customSplits';
    if (!ids.length) issue('분배 대상은 최소 1명이어야 합니다.', [path]);
    if (new Set(ids).size !== ids.length) issue('같은 참여자를 중복해서 분배할 수 없습니다.', [path]);
    if (ids.some(id => !membership.has(id))) issue('분배 대상은 모임 참여자여야 합니다.', [path]);
    if (data.splitType === 'custom' && data.customSplits?.reduce((sum, split) => sum + split.amount, 0) !== data.totalAmount) {
      issue('개별 금액의 총합이 전체 금액과 일치해야 합니다.', ['customSplits']);
    }
  });
}

export type ExpenseFormData = z.infer<ReturnType<typeof createExpenseSchema>>;

/** Server actions must supply participant IDs read from the authorized meeting. */
export const validateExpenseInput = (input: unknown, participantIds: readonly string[]) => createExpenseSchema(participantIds).safeParse(input);
