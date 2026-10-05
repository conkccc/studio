import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { getMeetingsForUserAction } from '@/lib/actions/meetings';
import { withRequestUser } from '@/lib/auth/request-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const querySchema = z.object({
  requestingUserId: z.string().min(1).max(128).optional(),
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(512).optional(),
  groupId: z.string().max(128).refine(value => !value.includes('/')).optional(),
  type: z.enum(['regular', 'temporary']).optional(),
  status: z.enum(['pending', 'finalized']).optional(),
  search: z.string().max(100).optional(),
});
const empty = { meetings: [], totalCount: 0, availableYears: [], nextCursor: null, hasMore: false };
const respond = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(request: NextRequest) {
  const requestStart = performance.now();
  try {
    const user = await getAuthenticatedUser();
    const authDuration = performance.now() - requestStart;
    if (!user) return respond({ success: false, error: '로그인이 필요합니다.', ...empty }, 401);
    const expectedUser = request.headers.get('X-Expected-User');
    if (expectedUser && expectedUser !== user.id) return respond({ success: false, error: '로그인 계정이 변경되었습니다. 새로고침 후 다시 확인해주세요.', ...empty }, 403);
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return respond({ success: false, error: '검색 조건을 확인해주세요.', ...empty }, 400);
    const { requestingUserId, limit, ...filters } = parsed.data;
    if (requestingUserId && requestingUserId !== user.id) return respond({ success: false, error: '요청한 사용자 정보가 일치하지 않습니다.', ...empty }, 403);
    const start = performance.now();
    const result = await withRequestUser(user, () => getMeetingsForUserAction({ ...filters, limitParam: limit, requestingUserId: user.id }));
    const response = respond(result, result.success ? 200 : 403);
    response.headers.set('Server-Timing', `auth;dur=${authDuration.toFixed(1)}, data;dur=${(performance.now() - start).toFixed(1)}, total;dur=${(performance.now() - requestStart).toFixed(1)}`);
    return response;
  } catch {
    return respond({ success: false, error: '모임 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', ...empty }, 500);
  }
}
