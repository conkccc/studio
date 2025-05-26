import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { AiCostAnalysisClient } from '@/components/ai/AiCostAnalysisClient';
import { Sparkles } from 'lucide-react';
import { getAllSpendingDataForYear, getMeetings } from '@/lib/data-store'; // Assuming this function exists

export default async function AiAnalysisPage({
  searchParams,
}: {
  searchParams?: { year?: string };
}) {
  const currentYear = new Date().getFullYear();
  const selectedYear = searchParams?.year ? parseInt(searchParams.year) : currentYear;
  
  const allMeetings = await getMeetings();
  const yearsWithMeetings = Array.from(new Set(allMeetings.map(m => m.dateTime.getFullYear()))).sort((a, b) => b - a);
  
  // Fetch default spending data for the selected/current year
  const defaultSpendingData = await getAllSpendingDataForYear(selectedYear);

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
        initialSpendingData={defaultSpendingData}
        availableYears={yearsWithMeetings}
        selectedYear={selectedYear}
      />
    </div>
  );
}
