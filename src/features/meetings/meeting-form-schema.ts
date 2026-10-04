import * as z from 'zod';

const participantIds = z.array(z.string().min(1)).refine(values => new Set(values).size === values.length, '참여자가 중복되었습니다.');
const amount = z.number().int('원 단위 정수를 입력해주세요.').min(0, '금액은 0 이상이어야 합니다.').safe('안전한 정수 범위의 금액을 입력해주세요.');

const meetingSchemaBase = z.object({
  name: z.string().trim().min(1, '모임 이름을 입력해주세요.').max(100, '모임 이름은 100자 이내여야 합니다.'),
  dateTime: z.date({ required_error: '시작 날짜와 시간을 선택해주세요.' }),
  endTime: z.date().optional(),
  locationName: z.string().max(100, '장소 이름은 100자 이내여야 합니다.').optional(),
  locationCoordinates: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
  participantIds: participantIds.optional(),
  useReserveFund: z.boolean().optional(),
  reserveFundCoverAll: z.boolean().optional(),
  isTemporary: z.boolean().optional(),
  temporaryParticipants: z.array(z.object({ id: z.string().min(1).optional(), name: z.string().trim().min(1, '임시 참여자 이름은 비워둘 수 없습니다.').max(100, '참여자 이름은 100자 이내여야 합니다.') })).optional(),
  totalFee: amount.optional(),
  feePerPerson: amount.optional(),
  partialReserveFundAmount: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : Number(String(val).replace(/,/g, ''))),
    amount.optional()
  ),
  nonReserveFundParticipants: participantIds.optional(),
  refundReserveFundToNonParticipants: z.boolean().optional(),
  reserveFundRefundRecipientIds: participantIds.optional(),
  memo: z.string().max(2000, '메모는 2000자 이내여야 합니다.').optional(),
});

export const meetingDraftSchema = meetingSchemaBase.partial();

export const meetingSchema = meetingSchemaBase
  .refine(data => {
    if (!data.isTemporary && data.useReserveFund && !data.reserveFundCoverAll && (data.partialReserveFundAmount === undefined || data.partialReserveFundAmount <= 0)) {
      return false;
    }
    return true;
  }, {
    message: '회비 사용 시, 사용할 회비 금액을 0보다 크게 입력해야 합니다.',
    path: ['partialReserveFundAmount'],
  })
  .refine(data => {
    if (data.endTime && data.dateTime && data.dateTime >= data.endTime) {
      return false;
    }
    return true;
  }, {
    message: '종료 시간은 시작 시간보다 이후여야 합니다.',
    path: ['endTime'],
  })
  .refine(data => {
    if (!data.isTemporary && (!data.participantIds || data.participantIds.length === 0)) {
      return false;
    }
    return true;
  }, {
    message: '기존 모임에는 참여자를 최소 1명 선택해주세요.',
    path: ['participantIds'],
  })
  .refine(data => {
    if (data.isTemporary && (!data.temporaryParticipants || data.temporaryParticipants.length === 0)) {
      return false;
    }
    return true;
  }, {
    message: '임시 모임에는 참여자를 최소 1명 추가해주세요.',
    path: ['temporaryParticipants'],
  })
  .superRefine((data, context) => {
    if (data.isTemporary) {
      const keys = (data.temporaryParticipants || []).map(participant => participant.id || participant.name);
      if (new Set(keys).size !== keys.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['temporaryParticipants'], message: '참여자 식별자가 중복되었습니다.' });
      return;
    }
    if (data.nonReserveFundParticipants?.some(id => !data.participantIds?.includes(id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['nonReserveFundParticipants'], message: '회비 제외 대상은 모임 참여자여야 합니다.' });
    if (data.reserveFundRefundRecipientIds?.some(id => data.participantIds?.includes(id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['reserveFundRefundRecipientIds'], message: '환급 대상은 미참가자여야 합니다.' });
  });

export type MeetingFormData = z.infer<typeof meetingSchema>;
