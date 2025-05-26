'use client';

import React, { useState, useTransition } from 'react';
import { costAnalysis } from '@/ai/flows/cost-analysis';
import type { CostAnalysisResult } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Loader2, Lightbulb, FileText, Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAllSpendingDataForYear } from '@/lib/data-store'; // This needs to be callable from client or passed

interface AiCostAnalysisClientProps {
  initialSpendingData: string;
  availableYears: number[];
  selectedYear: number;
}

export function AiCostAnalysisClient({ initialSpendingData, availableYears, selectedYear }: AiCostAnalysisClientProps) {
  const [spendingData, setSpendingData] = useState<string>(initialSpendingData);
  const [result, setResult] = useState<CostAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleYearChange = async (yearStr: string) => {
    const year = parseInt(yearStr);
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    current.set("year", yearStr);
    const query = current.toString();
    
    // Ideally, we'd fetch new data for the year.
    // For this client component, we'll just update the URL and rely on page reload or parent refetch.
    // This example doesn't have a direct client-side `getAllSpendingDataForYear`.
    // A full solution would involve an API route or Server Action to fetch this.
    // For now, we just navigate, and the parent page (`AiAnalysisPage`) will re-render with new props.
    router.push(`${pathname}?${query}`); 
    
    // To make it more interactive on client-side (if data fetching was client-side):
    // setIsLoading(true);
    // const newData = await fetchSpendingDataForYear(year); // Hypothetical client-side fetch
    // setSpendingData(newData);
    // setResult(null); setError(null);
    // setIsLoading(false);
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const analysisResult = await costAnalysis({ spendingData });
      setResult(analysisResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 분석 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
         <CardTitle>비용 분석 입력</CardTitle>
          <div className="w-full sm:w-auto sm:min-w-[180px]">
            <Label htmlFor="year-select-ai" className="text-sm font-medium sr-only">분석 연도 선택</Label>
            <Select onValueChange={handleYearChange} defaultValue={selectedYear.toString()}>
              <SelectTrigger id="year-select-ai" aria-label="분석 연도 선택">
                <SelectValue placeholder="분석 연도 선택..." />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}년 지출 데이터</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <CardDescription>
          아래 텍스트 영역에 분석할 지출 데이터를 입력하거나, 선택된 연도의 데이터를 사용하세요. 데이터가 많을수록 분석이 정확해집니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="spendingData" className="flex items-center gap-1 mb-1">
                <FileText className="h-4 w-4" />
                지출 데이터 ({selectedYear}년)
            </Label>
            <Textarea
              id="spendingData"
              value={spendingData}
              onChange={(e) => setSpendingData(e.target.value)}
              rows={12}
              placeholder="예: 식비 50,000원, 교통비 20,000원..."
              className="text-sm bg-muted/30"
              disabled={isLoading}
            />
          </div>
          <Button type="submit" disabled={isLoading || !spendingData.trim()} className="w-full sm:w-auto">
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            AI 분석 실행
          </Button>
        </form>
      </CardContent>

      {error && (
        <CardFooter>
          <Alert variant="destructive">
            <AlertTitle>오류 발생</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardFooter>
      )}

      {result && (
        <CardFooter className="flex-col items-start gap-4 pt-6 border-t">
            <h3 className="text-xl font-semibold flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-primary"/>
                AI 분석 결과
            </h3>
          <div className="w-full space-y-4">
            <Card className="bg-secondary/50">
              <CardHeader>
                <CardTitle className="text-lg">요약</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-32">
                  <p className="text-sm whitespace-pre-wrap">{result.summary}</p>
                </ScrollArea>
              </CardContent>
            </Card>
            <Card className="bg-secondary/50">
              <CardHeader>
                <CardTitle className="text-lg">비용 절감 제안</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-40">
                 <p className="text-sm whitespace-pre-wrap">{result.costCuttingSuggestions}</p>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
