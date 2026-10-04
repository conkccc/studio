'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getFriendGroupsForUserAction } from '@/lib/actions';
import { MeetingListClient } from '@/features/meetings/MeetingListClient';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import type { FriendGroup } from '@/lib/types';

export default function MeetingsPage() {
  const { currentUser, appUser, loading: authLoading } = useAuth();
  const [friendGroups, setFriendGroups] = useState<FriendGroup[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    if (!currentUser || !appUser?.id) { setDataLoading(false); setFriendGroups([]); return; }
    setDataLoading(true);
    setFilterError(null);
    const fetchGroups = async () => {
      try {
        const result = await getFriendGroupsForUserAction(appUser.id);
        if (!active) return;
        if (!result.success) throw new Error(result.error || '그룹 목록을 불러오지 못했습니다.');
        setFriendGroups(result.groups || []);
      } catch (cause) {
        if (active) setFilterError(cause instanceof Error ? cause.message : '그룹 목록을 불러오지 못했습니다.');
      } finally {
        if (active) setDataLoading(false);
      }
    };
    void fetchGroups();
    return () => { active = false; };
  }, [authLoading, currentUser?.uid, appUser?.id, retry]);

  if (!authLoading && !currentUser) return <div className="py-10 text-center"><h1 className="mb-2 text-2xl font-semibold">로그인이 필요합니다.</h1><Button asChild><Link href="/login">로그인</Link></Button></div>;

  return <div className="space-y-6">
    <header><h1 className="text-2xl font-semibold">모임 관리</h1><p className="mt-1 text-muted-foreground">모임을 찾고 지출과 정산 상태를 확인하세요.</p></header>
    {filterError && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"><span>그룹 필터: {filterError}</span><Button variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>다시 시도</Button></div>}
    <MeetingListClient allFriends={[]} friendGroups={friendGroups} filtersReady={!dataLoading} />
  </div>;
}
