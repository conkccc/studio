
'use client';

import { Sparkles } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function AiAnalysisPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">AI 비용 분석 도구</h1>
          <p className="text-muted-foreground">
            AI 기반 비용 분석 기능은 현재 준비 중이거나 제거되었습니다.
          </p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>분석 기능 안내</CardTitle>
          <CardDescription>
            이 페이지는 이전에 AI를 활용한 비용 분석 기능을 제공했습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center py-8 text-muted-foreground">
            현재 해당 기능을 사용할 수 없습니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
