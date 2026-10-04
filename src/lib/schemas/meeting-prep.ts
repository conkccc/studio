import { z } from 'zod';

export const meetingPrepInputSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력해주세요.').max(120),
  memo: z.string().max(5000).optional(),
  friendGroupId: z.string().min(1).max(200),
  participantFriendIds: z.array(z.string().min(1).max(200)).min(1).max(200)
    .refine(ids => new Set(ids).size === ids.length, '참여자를 중복 선택할 수 없습니다.'),
  selectedMonths: z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)).min(1).max(12)
    .refine(months => new Set(months).size === months.length, '월을 중복 선택할 수 없습니다.'),
  shareExpiryDays: z.number().int().min(1).max(365).optional(),
}).strict();
