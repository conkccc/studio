'use client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { appQueryKey, dataScope } from '@/lib/app-query-client';
import { fetchAppData, type AppResource } from '@/lib/app-data';

export function useAppData<R extends AppResource>(resource: R, params: { id?: string; shareToken?: string } = {}, enabled = true) {
  const { appUser, loading } = useAuth();
  const shared = resource === 'prep-detail' && !!params.shareToken;
  return useQuery({
    queryKey: appQueryKey(shared ? 'public' : dataScope(appUser), resource, params),
    queryFn: ({ signal }) => fetchAppData(resource, params, signal, shared ? undefined : appUser?.id),
    enabled: enabled && (shared || (!loading && !!appUser && appUser.role !== 'none')),
    ...(shared ? { staleTime: 0, gcTime: 0, refetchOnMount: 'always' as const } : {}),
    ...(['prep-detail', 'meeting-edit'].includes(resource) ? { refetchOnWindowFocus: false } : {}),
  });
}
