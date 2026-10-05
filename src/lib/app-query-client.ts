'use client';

import { QueryCache, QueryClient } from '@tanstack/react-query';
import type { User } from './types';
import { ApiReadError } from './api-read-error';

export const APP_STALE_TIME = 2 * 60 * 1000;
export function createAppQueryClient() {
  return new QueryClient({ queryCache: new QueryCache({
    onError: (error, query) => {
      if (error instanceof ApiReadError && [401, 403].includes(error.status)) {
        query.setState({ data: undefined, dataUpdatedAt: 0 });
      }
    },
  }), defaultOptions: { queries: {
    staleTime: APP_STALE_TIME, gcTime: 20 * 60 * 1000,
    retry: false, refetchOnWindowFocus: true, refetchOnReconnect: true,
  } } });
}
let browserClient: QueryClient | undefined;
let activeScope = 'anonymous';
let activeUserId: string | undefined;
export function getAppQueryClient() {
  if (typeof window === 'undefined') return createAppQueryClient();
  return browserClient ??= createAppQueryClient();
}
export function dataScope(user: User | null | undefined) {
  return user ? JSON.stringify([user.id, user.role, [...(user.friendGroupIds || [])].sort()]) : 'anonymous';
}
export const appQueryKey = (scope: string, resource: string, params: object = {}) => ['app-data', scope, resource, params] as const;

function clearPrivateData() {
  browserClient?.removeQueries({ predicate: query => query.queryKey[0] === 'app-data' && query.queryKey[1] !== 'public' });
}
export function clearAppData() { clearPrivateData(); activeScope = 'anonymous'; activeUserId = undefined; }
export function setAppDataUser(user: User) {
  const nextScope = dataScope(user);
  if (nextScope !== activeScope) clearPrivateData();
  activeScope = nextScope;
  activeUserId = user.id;
}
export function currentDataScope() { return activeScope; }
export function currentDataUserId() { return activeUserId; }
export function invalidateAppData(resources: string[]) {
  if (!browserClient) return;
  // Invalidating an in-flight query must not let its old response mark stale data fresh.
  const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === 'app-data' && resources.includes(String(query.queryKey[2]));
  void browserClient.cancelQueries({ predicate }).then(() => browserClient?.invalidateQueries({ predicate }));
}
