'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Friend, FriendGroup, Meeting } from '@/lib/types';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getMeetingsForUserAction } from '@/lib/actions';
import { MeetingCard } from './MeetingCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Loader2, PlusCircle, Search, RotateCcw } from 'lucide-react';
import { useMeetingListPreferences } from '@/hooks/use-meeting-list-preferences';

interface MeetingListClientProps {
  allFriends: Friend[];
  friendGroups: FriendGroup[];
  filtersReady: boolean;
}

// Preserve actual cursors so navigation works even on a page without matches.
function readHistory(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    return Array.isArray(parsed) && parsed.every(item => typeof item === 'string') ? parsed.slice(-100) : [];
  } catch { return []; }
}

export function MeetingListClient({ allFriends, friendGroups, filtersReady }: MeetingListClientProps) {
  const { currentUser, loading: authLoading, appUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const requestSequence = useRef(0);
  const query = searchParams.toString();
  const preferences = useMeetingListPreferences(authLoading ? undefined : currentUser?.uid, query, pathname, router.replace);
  const year = searchParams.get('year') || 'all';
  const type = searchParams.get('type') || 'all';
  const groupId = searchParams.get('groupId') || 'all';
  const status = searchParams.get('status') || 'all';
  const history = readHistory(searchParams.get('history'));
  const hasFilters = [year, type, groupId, status].some(value => value !== 'all') || Boolean(searchParams.get('search'));

  useEffect(() => { setSearch(searchParams.get('search') || ''); }, [searchParams]);

  useEffect(() => {
    if (authLoading) return;
    const sequence = ++requestSequence.current;
    if (!currentUser) {
      setMeetings([]);
      setIsLoading(false);
      return;
    }
    if (!preferences.ready) return;
    let active = true;
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams(query);
    const numericYear = Number(params.get('year'));
    const fetchData = async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          getMeetingsForUserAction({
            year: Number.isInteger(numericYear) && numericYear > 1900 ? numericYear : undefined,
            limitParam: 9,
            groupId: params.get('groupId') || undefined,
            type: params.get('type') === 'regular' ? 'regular' : params.get('type') === 'temporary' ? 'temporary' : undefined,
            status: params.get('status') === 'pending' ? 'pending' : params.get('status') === 'finalized' ? 'finalized' : undefined,
            search: params.get('search') || undefined,
            cursor: params.get('cursor') || undefined,
          }),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('목록 조회 시간이 초과되었습니다. 다시 시도해주세요.')), 15000); }),
        ]);
        if (!active || requestSequence.current !== sequence) return;
        if (!result.success) throw new Error(('error' in result && result.error) || '모임 목록을 불러오지 못했습니다.');
        setMeetings(result.meetings || []);
        setAvailableYears(result.availableYears || []);
        setNextCursor(result.nextCursor || null);
        setHasMore(Boolean(result.hasMore));
      } catch (cause) {
        if (!active || requestSequence.current !== sequence) return;
        setError(cause instanceof Error ? cause.message : '모임 목록을 불러오지 못했습니다.');
      } finally {
        clearTimeout(timeout);
        if (active && requestSequence.current === sequence) setIsLoading(false);
      }
    };
    void fetchData();
    return () => { active = false; };
  }, [authLoading, currentUser?.uid, query, retry, preferences.ready]);

  const navigate = (params: URLSearchParams) => router.push(`${pathname}${params.size ? `?${params}` : ''}`, { scroll: false });
  const changeFilter = (key: string, value: string) => {
    const params = new URLSearchParams(query);
    if (!value || value === 'all') params.delete(key); else params.set(key, value);
    ['cursor', 'history', 'page'].forEach(key => params.delete(key));
    navigate(params);
  };
  const submitSearch = (event: FormEvent) => { event.preventDefault(); changeFilter('search', search.trim()); };
  const nextPage = () => {
    if (!nextCursor) return;
    const params = new URLSearchParams(query);
    params.set('history', JSON.stringify([...history, params.get('cursor') || '']));
    params.set('cursor', nextCursor);
    navigate(params);
  };
  const previousPage = () => {
    const params = new URLSearchParams(query);
    const previous = [...history];
    const cursor = previous.pop();
    if (cursor) params.set('cursor', cursor); else params.delete('cursor');
    if (previous.length) params.set('history', JSON.stringify(previous)); else params.delete('history');
    navigate(params);
  };

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>모임 목록</CardTitle>
          {appUser && ['admin', 'user'].includes(appUser.role) && <Button asChild><Link href="/meetings/new"><PlusCircle className="mr-2 h-4 w-4" />새 모임</Link></Button>}
        </div>
        <form className="flex gap-2" onSubmit={submitSearch} role="search">
          <Input aria-label="모임 이름 검색" placeholder="모임 이름으로 검색" value={search} onChange={event => setSearch(event.target.value)} maxLength={100} />
          <Button type="submit" variant="outline"><Search className="mr-2 h-4 w-4" />검색</Button>
        </form>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Select value={year} onValueChange={value => changeFilter('year', value)}>
            <SelectTrigger aria-label="연도"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">전체 연도</SelectItem>{Array.from(new Set([...availableYears, ...(year !== 'all' ? [Number(year)] : [])])).filter(Number.isFinite).map(value => <SelectItem key={value} value={String(value)}>{value}년</SelectItem>)}</SelectContent>
          </Select>
          <Select value={type} onValueChange={value => changeFilter('type', value)}>
            <SelectTrigger aria-label="모임 종류"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">전체 종류</SelectItem><SelectItem value="regular">일반 모임</SelectItem><SelectItem value="temporary">임시 모임</SelectItem></SelectContent>
          </Select>
          <Select value={groupId} onValueChange={value => changeFilter('groupId', value)} disabled={!filtersReady}>
            <SelectTrigger aria-label="친구 그룹"><SelectValue placeholder="그룹 불러오는 중" /></SelectTrigger>
            <SelectContent><SelectItem value="all">전체 그룹</SelectItem><SelectItem value="none">미지정 / 임시</SelectItem>{friendGroups.map(group => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={status} onValueChange={value => changeFilter('status', value)}>
            <SelectTrigger aria-label="정산 상태"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">전체 정산 상태</SelectItem><SelectItem value="pending">정산 미확정</SelectItem><SelectItem value="finalized">정산 확정</SelectItem></SelectContent>
          </Select>
        </div>
        {hasFilters && <Button variant="ghost" size="sm" className="self-start" onClick={() => { preferences.resetRememberedSelection(); navigate(new URLSearchParams()); }}><RotateCcw className="mr-2 h-4 w-4" />필터 초기화</Button>}
      </CardHeader>
      <CardContent aria-busy={isLoading}>
        {isLoading ? <div role="status" className="flex h-48 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" />모임을 불러오고 있습니다.</div>
          : error ? <div role="alert" className="space-y-3 py-10 text-center"><p>{error}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>다시 시도</Button></div>
          : meetings.length ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{meetings.map(meeting => <MeetingCard key={meeting.id} meeting={meeting} allFriends={allFriends} />)}</div>
          : <div className="space-y-2 py-10 text-center text-muted-foreground"><p>{hasFilters ? '조건에 맞는 모임이 없습니다.' : '등록된 모임이 없습니다.'}</p>{hasMore && <p className="text-sm">다음 목록에서도 같은 조건으로 찾아볼 수 있습니다.</p>}</div>}
        {!isLoading && !error && (history.length > 0 || hasMore) && <div className="flex items-center justify-center gap-4 pt-6">
          <Button variant="outline" onClick={previousPage} disabled={!history.length}><ChevronLeft className="mr-1 h-4 w-4" />이전</Button>
          <span className="text-sm text-muted-foreground">{history.length + 1}번째 목록</span>
          <Button variant="outline" onClick={nextPage} disabled={!hasMore || !nextCursor}>다음<ChevronRight className="ml-1 h-4 w-4" /></Button>
        </div>}
      </CardContent>
    </Card>
  );
}
