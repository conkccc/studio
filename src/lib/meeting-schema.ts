import { z } from 'zod';

const ids = z.array(z.string().min(1)).refine(values => new Set(values).size === values.length, '참여자가 중복되었습니다.');
const amount = z.number().int('금액은 원 단위 정수로 입력해주세요.').nonnegative().safe();

export const meetingInputSchema = z.object({
  name: z.string().trim().min(1, '모임 이름을 입력해주세요.').max(100),
  dateTime: z.date(),
  endTime: z.date().nullable().optional(),
  locationName: z.string().max(100).default(''),
  locationCoordinates: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
  participantIds: ids.default([]),
  groupId: z.string().default(''),
  isTemporary: z.boolean().default(false),
  temporaryParticipants: z.array(z.object({ id: z.string().min(1).optional(), name: z.string().trim().min(1).max(100) })).optional(),
  useReserveFund: z.boolean().default(false),
  reserveFundCoverAll: z.boolean().default(false),
  partialReserveFundAmount: amount.optional(),
  nonReserveFundParticipants: ids.default([]),
  refundReserveFundToNonParticipants: z.boolean().default(false),
  reserveFundRefundRecipientIds: ids.default([]),
  totalFee: amount.optional(),
  feePerPerson: amount.optional(),
  memo: z.string().max(2000).optional(),
}).superRefine((data, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  if (data.endTime && data.endTime <= data.dateTime) issue('endTime', '종료 시간은 시작 시간 이후여야 합니다.');
  if (data.isTemporary) {
    if (!data.temporaryParticipants?.length) issue('temporaryParticipants', '참여자를 최소 1명 추가해주세요.');
    const values = data.temporaryParticipants || [];
    const participantKeys = values.map(value => value.id || value.name);
    if (new Set(participantKeys).size !== values.length) issue('temporaryParticipants', '참여자 식별자가 중복되었습니다.');
  } else {
    if (!data.groupId) issue('groupId', '일반 모임은 친구 그룹을 선택해야 합니다.');
    if (!data.participantIds.length) issue('participantIds', '참여자를 최소 1명 선택해주세요.');
    if (data.nonReserveFundParticipants.some(id => !data.participantIds.includes(id))) issue('nonReserveFundParticipants', '회비 제외 대상은 모임 참여자여야 합니다.');
    if (data.reserveFundRefundRecipientIds.some(id => data.participantIds.includes(id))) issue('reserveFundRefundRecipientIds', '환급 대상은 미참가자여야 합니다.');
    if (data.useReserveFund && !data.reserveFundCoverAll && !data.partialReserveFundAmount) issue('partialReserveFundAmount', '사용할 회비 금액을 입력해주세요.');
  }
});
