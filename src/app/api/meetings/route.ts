import { NextRequest, NextResponse } from 'next/server';

import {
  getFriendGroupsByUser as dbGetFriendGroupsByUser,
  getMeetings as dbGetMeetings,
  getUserById as dbGetUserById,
} from '@/lib/data-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const searchParams = request.nextUrl.searchParams;
  const requestingUserId = searchParams.get('requestingUserId') || '';
  const yearParam = searchParams.get('year');
  const pageParam = searchParams.get('page');
  const limitParam = searchParams.get('limit');
  const year = yearParam ? Number(yearParam) : undefined;
  const page = pageParam ? Number(pageParam) : undefined;
  const limit = limitParam ? Number(limitParam) : undefined;
  const logUserId = requestingUserId ? `${requestingUserId.slice(0, 6)}...` : 'missing';

  if (!requestingUserId) {
    return NextResponse.json(
      { success: false, error: 'User ID is required.', meetings: [], totalCount: 0, availableYears: [] },
      { status: 400 }
    );
  }

  if (yearParam && !Number.isFinite(year)) {
    return NextResponse.json(
      { success: false, error: 'Invalid year.', meetings: [], totalCount: 0, availableYears: [] },
      { status: 400 }
    );
  }

  try {
    const user = await dbGetUserById(requestingUserId);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found.', meetings: [], totalCount: 0, availableYears: [] },
        { status: 404 }
      );
    }

    let actualUserIdForFilter: string | undefined;
    let actualUserFriendGroupIdsForFilter: string[] | undefined;

    if (user.role !== 'admin') {
      actualUserIdForFilter = user.id;
      const accessibleGroupIds = new Set<string>(user.friendGroupIds || []);
      const accessibleGroups = await dbGetFriendGroupsByUser(user.id);

      accessibleGroups.forEach(group => {
        if (user.role === 'viewer' && !user.friendGroupIds?.includes(group.id)) {
          return;
        }
        accessibleGroupIds.add(group.id);
      });

      actualUserFriendGroupIdsForFilter = accessibleGroupIds.size > 0
        ? Array.from(accessibleGroupIds)
        : undefined;
    }

    const dbStartTime = Date.now();
    const result = await dbGetMeetings({
      year,
      page,
      limitParam: limit,
      userId: actualUserIdForFilter,
      userFriendGroupIds: actualUserFriendGroupIdsForFilter,
    });
    const duration = Date.now() - dbStartTime;
    if (duration > 5000) {
      console.warn(`[api/meetings] slow query: ${duration}ms for user ${logUserId}, total ${Date.now() - startTime}ms`);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[api/meetings] error', {
      user: logUserId,
      year,
      page,
      limit,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch meetings.',
        meetings: [],
        totalCount: 0,
        availableYears: [],
      },
      { status: 500 }
    );
  }
}
