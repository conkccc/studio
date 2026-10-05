import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppData } from '../use-app-data';
import { fetchAppData } from '@/lib/app-data';
import { appQueryKey, dataScope, getAppQueryClient, setAppDataUser, clearAppData, invalidateAppData } from '@/lib/app-query-client';
import { makeUser, makeFriendGroup } from '@/lib/actions/__tests__/fixtures';
import { ApiReadError } from '@/lib/api-read-error';

let user = makeUser({ id: 'first' });
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ appUser: user, loading: false }) }));
vi.mock('@/lib/app-data', () => ({ fetchAppData: vi.fn() }));
let renderer: ReactTestRenderer | undefined;
let client: QueryClient;
const group = (name: string) => ({ ...makeFriendGroup({ name }), ownerName: '그룹장', isOwned: true, isReferenced: false });
function Probe() {
  const query = useAppData('groups');
  return React.createElement('output', { pending: query.isPending, fetching: query.isFetching, label: query.data?.groups?.[0]?.name, error: query.error?.message });
}
function show(visible = true) {
  act(() => {
    const tree = React.createElement(QueryClientProvider, { client }, visible ? React.createElement(Probe) : null);
    if (renderer) renderer.update(tree); else renderer = create(tree);
  });
}
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
beforeEach(() => {
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  user = makeUser({ id: 'first' }); client = getAppQueryClient(); client.clear(); setAppDataUser(user);
  vi.mocked(fetchAppData).mockReset();
  vi.mocked(fetchAppData).mockResolvedValue({ success: true, groups: [group('기존 그룹')] });
});
afterEach(() => { act(() => renderer?.unmount()); renderer = undefined; client.clear(); clearAppData(); vi.unstubAllGlobals(); });
describe('shared page data cache', () => {
  it('shows cached data synchronously on return without another request or loading screen', async () => {
    show(); await settle();
    expect(fetchAppData).toHaveBeenCalledOnce();
    show(false); show();
    expect(renderer!.root.findByType('output').props).toMatchObject({ pending: false, label: '기존 그룹' });
    await settle(); expect(fetchAppData).toHaveBeenCalledOnce();
  });
  it('deduplicates the same query mounted by multiple consumers', async () => {
    act(() => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(Probe), React.createElement(Probe))); });
    await settle(); expect(fetchAppData).toHaveBeenCalledOnce();
  });
  it('retains old data while a stale query is refreshed', async () => {
    show(); await settle(); show(false);
    await client.invalidateQueries({ queryKey: appQueryKey(dataScope(user), 'groups') });
    let finish!: (value: Awaited<ReturnType<typeof fetchAppData<'groups'>>>) => void;
    vi.mocked(fetchAppData).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    show();
    expect(renderer!.root.findByType('output').props).toMatchObject({ pending: false, label: '기존 그룹' });
    await act(async () => { finish({ success: true, groups: [group('최신 그룹')] }); });
    await settle();
    expect(renderer!.root.findByType('output').props.label).toBe('최신 그룹');
  });
  it('refreshes affected data after a successful mutation invalidates it', async () => {
    show(); await settle();
    vi.mocked(fetchAppData).mockResolvedValue({ success: true, groups: [group('수정한 그룹')] });
    act(() => invalidateAppData(['groups'])); await settle(); await settle();
    expect(fetchAppData).toHaveBeenCalledTimes(2);
    expect(renderer!.root.findByType('output').props.label).toBe('수정한 그룹');
  });
  it('does not display another account cached data and clears private data on sign out', async () => {
    show(); await settle(); show(false);
    const oldKey = appQueryKey(dataScope(user), 'groups');
    user = makeUser({ id: 'second' }); setAppDataUser(user);
    vi.mocked(fetchAppData).mockImplementation(() => new Promise(() => {}));
    show();
    expect(renderer!.root.findByType('output').props.label).toBeUndefined();
    expect(client.getQueryData(oldKey)).toBeUndefined();
    show(false); clearAppData();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
  it('partitions the cache when role or group access changes', () => {
    expect(dataScope(user)).not.toBe(dataScope({ ...user, role: 'viewer' }));
    expect(dataScope(user)).not.toBe(dataScope({ ...user, friendGroupIds: ['new-group'] }));
    expect(dataScope({ ...user, friendGroupIds: ['a', 'b'] })).toBe(dataScope({ ...user, friendGroupIds: ['b', 'a'] }));
  });
  it('drops previous cached data when a refresh is denied by the server', async () => {
    show(); await settle();
    vi.mocked(fetchAppData).mockRejectedValue(new ApiReadError('권한 없음', 403));
    act(() => invalidateAppData(['groups'])); await settle(); await settle();
    expect(renderer!.root.findByType('output').props.label).toBeUndefined();
    expect(renderer!.root.findByType('output').props.error).toBe('권한 없음');
    expect(fetchAppData).toHaveBeenCalledTimes(2);
  });
  it('keeps cached data when a refresh fails temporarily rather than denying access', async () => {
    show(); await settle();
    vi.mocked(fetchAppData).mockRejectedValue(new ApiReadError('일시적 서버 오류', 500));
    act(() => invalidateAppData(['groups'])); await settle(); await settle();
    expect(renderer!.root.findByType('output').props.label).toBe('기존 그룹');
    expect(renderer!.root.findByType('output').props.error).toBe('일시적 서버 오류');
  });
});
