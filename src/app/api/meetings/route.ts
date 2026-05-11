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

  console.log('[api/meetings] start', {
    user: logUserId,
    year,
    page,
    limit,
  });

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
    const userLookupStartTime = Date.now();
    const user = await dbGetUserById(requestingUserId);
    console.log('[api/meetings] user lookup completed', {
      user: logUserId,
      durationMs: Date.now() - userLookupStartTime,
      found: Boolean(user),
      role: user?.role,
    });

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
      const groupsLookupStartTime = Date.now();
      const accessibleGroups = await dbGetFriendGroupsByUser(user.id);
      console.log('[api/meetings] group lookup completed', {
        user: logUserId,
        durationMs: Date.now() - groupsLookupStartTime,
        groupCount: accessibleGroups.length,
      });

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

    console.log('[api/meetings] completed', {
      user: logUserId,
      dbDurationMs: Date.now() - dbStartTime,
      totalDurationMs: Date.now() - startTime,
      meetingCount: result.meetings.length,
      totalCount: result.totalCount,
      availableYears: result.availableYears,
    });

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
