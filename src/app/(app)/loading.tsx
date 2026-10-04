import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return <div role="status" aria-label="페이지를 불러오는 중" className="space-y-6">
    <Skeleton className="h-8 w-48" />
    <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map(id => <Skeleton key={id} className="h-52 rounded-xl" />)}</div>
  </div>;
}
