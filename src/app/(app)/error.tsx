'use client';

import { Button } from '@/components/ui/button';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <div role="alert" className="mx-auto max-w-lg space-y-4 py-16 text-center">
    <h1 className="text-xl font-semibold">페이지를 불러오지 못했습니다.</h1>
    <p className="text-muted-foreground">잠시 후 다시 시도해주세요.</p>
    <Button onClick={reset}>다시 시도</Button>
  </div>;
}
