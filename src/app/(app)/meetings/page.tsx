'use client';
import { MeetingListClient } from '@/features/meetings/MeetingListClient';
import { Button } from '@/components/ui/button';
import { useAppData } from '@/hooks/use-app-data';

export default function MeetingsPage() {
  const groups = useAppData('groups');
  return <div className="space-y-6">
    <header><h1 className="text-2xl font-semibold">모임 관리</h1><p className="mt-1 text-muted-foreground">모임을 찾고 지출과 정산 상태를 확인하세요.</p></header>
    {groups.error && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"><span>그룹 필터: {groups.error.message}</span><Button variant="outline" size="sm" onClick={() => void groups.refetch()}>다시 시도</Button></div>}
    <MeetingListClient allFriends={[]} friendGroups={groups.data?.groups || []} filtersReady={!groups.isLoading} />
  </div>;
}
