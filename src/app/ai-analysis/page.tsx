
'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { AiCostAnalysisClient } from '@/components/ai/AiCostAnalysisClient';
import { Sparkles } from 'lucide-react';
import { getAllSpendingDataForYear, getMeetings } from '@/lib/data-store'; // Now async
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext'; // For public access control, if any

export default function AiAnalysisPage() {
  const searchParams = useSearchParams();
  const yearParam = searchParams.get('year');
  const { currentUser, isAdmin, loading: authLoading } = useAuth(); // Though public, auth state might be useful

  const [initialSpendingData, setInitialSpendingData] = useState<string>("");
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    setSelectedYear(yearParam ? parseInt(yearParam) : new Date().getFullYear());
  }, [yearParam]);

  useEffect(() => {
    const fetchData = async () => {
      setDataLoading(true);
      try {
        const [allMeetingsData, spendingDataForSelectedYear] = await Promise.all([
          getMeetings(),
          getAllSpendingDataForYear(selectedYear)
        ]);
        
        const years = Array.from(new Set(allMeetingsData.map(m => m.dateTime.getFullYear()))).sort((a, b) => b - a);
        setAvailableYears(years);
        setInitialSpendingData(spendingDataForSelectedYear);

      } catch (error) {
        console.error("Failed to fetch AI analysis data:", error);
      } finally {
        setDataLoading(false);
      }
    };
    // Fetch data regardless of auth state for this public page, but only after auth state is known
    if (!authLoading) {
        fetchData();
    }
  }, [authLoading, selectedYear]);


  if (authLoading || dataLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">AI 분석 도구 로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">AI 비용 분석 도구</h1>
          <p className="text-muted-foreground">
            지출 내역을 입력하고 AI의 분석과 비용 절감 제안을 받아보세요.
          </p>
        </div>
      </div>
      <AiCostAnalysisClient 
        initialSpendingData={initialSpendingData}
        availableYears={availableYears}
        selectedYear={selectedYear}
      />
    </div>
  );
}
