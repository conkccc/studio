import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { withRequestUser } from '@/lib/auth/request-user';
import { getFriendGroupsForUserAction, getFriendsByGroupAction, getDashboardAction, getMeetingPrepsAction, getAllUsersAction, getAllFriendGroupsAction, getAllParticipantAvailabilitiesAction } from '@/lib/actions';
import { getMeetingEditDataAction } from '@/lib/actions/page-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const querySchema = z.object({
  resource: z.enum(['groups', 'friends', 'dashboard', 'preps', 'users', 'meeting-edit', 'prep-detail']),
  id: z.string().min(1).max(128).refine(id => !id.includes('/')).optional(),
  shareToken: z.string().min(1).max(200).optional(),
}).refine(value => !['friends', 'meeting-edit', 'prep-detail'].includes(value.resource) || !!value.id);
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(request: NextRequest) {
  const start = performance.now();
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return json({ success: false, error: '조회 조건을 확인해주세요.' }, 400);
    const { resource, id, shareToken } = parsed.data;
    const publicShare = resource === 'prep-detail' && !!shareToken;
    const user = publicShare ? null : await getAuthenticatedUser();
    if (!user && !publicShare) return json({ success: false, error: '로그인이 필요합니다.' }, 401);
    const expectedUser = request.headers.get('X-Expected-User');
    if (!publicShare && expectedUser && expectedUser !== user?.id) return json({ success: false, error: '로그인 계정이 변경되었습니다. 새로고침 후 다시 확인해주세요.' }, 403);
    const read = async () => {
      switch (resource) {
        case 'groups': return getFriendGroupsForUserAction();
        case 'friends': return getFriendsByGroupAction(id!);
        case 'dashboard': return getDashboardAction();
        case 'preps': return getMeetingPrepsAction(user!.id);
        case 'prep-detail': return getAllParticipantAvailabilitiesAction(id!, user?.id, publicShare ? shareToken : undefined);
        case 'meeting-edit': return getMeetingEditDataAction(id!);
        case 'users': {
          if (user?.role !== 'admin') return { success: false, error: '관리자 권한이 필요합니다.' };
          const [users, groups] = await Promise.all([getAllUsersAction(), getAllFriendGroupsAction()]);
          if (!users.success || !groups.success) return { success: false, error: '사용자 정보를 불러오지 못했습니다.' };
          return { success: true, users: users.users, groups: groups.groups };
        }
      }
    };
    const result = user ? await withRequestUser(user, read) : await read();
    const response = json(result, result.success ? 200 : 403);
    response.headers.set('Server-Timing', `total;dur=${(performance.now() - start).toFixed(1)}`);
    return response;
  } catch { return json({ success: false, error: '정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' }, 500); }
}
