'use client';

import type { Meeting, Expense, Friend, CostAnalysisResult } from '@/lib/types';
import React, { useState, useTransition, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { deleteMeetingAction } from '@/lib/actions'; // Assuming updateMeetingAction exists
import { useToast } from '@/hooks/use-toast';
import { CalendarDays, MapPin, Users, Edit3, Trash2, PlusCircle, Loader2, Sparkles, ExternalLink } from 'lucide-react';
import { AddExpenseDialog } from './AddExpenseDialog';
import { ExpenseItem } from './ExpenseItem';
import { PaymentSummary } from './PaymentSummary';
import { costAnalysis } from '@/ai/flows/cost-analysis';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import Image from 'next/image';

interface MeetingDetailsClientProps {
  initialMeeting: Meeting;
  initialExpenses: Expense[];
  allFriends: Friend[];
  currentUserId: string;
  spendingDataForAI: string;
}

export function MeetingDetailsClient({ 
  initialMeeting, 
  initialExpenses, 
  allFriends, 
  currentUserId,
  spendingDataForAI
}: MeetingDetailsClientProps) {
  const [meeting, setMeeting] = useState<Meeting>(initialMeeting);
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<CostAnalysisResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();


  const participants = useMemo(() => 
    meeting.participantIds
      .map(id => allFriends.find(f => f.id === id))
      .filter((f): f is Friend => Boolean(f)),
    [meeting.participantIds, allFriends]
  );

  const creator = useMemo(() => 
    allFriends.find(f => f.id === meeting.creatorId),
    [meeting.creatorId, allFriends]
  );
  
  const isCreator = meeting.creatorId === currentUserId;

  const handleExpenseAdded = (newExpense: Expense) => {
    setExpenses(prev => [newExpense, ...prev].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ));
  };

  const handleExpenseUpdated = (updatedExpense: Expense) => {
    setExpenses(prev => prev.map(e => e.id === updatedExpense.id ? updatedExpense : e).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };
  
  const handleExpenseDeleted = (deletedExpenseId: string) => {
    setExpenses(prev => prev.filter(e => e.id !== deletedExpenseId));
  };

  const handleDeleteMeeting = async () => {
    setIsDeleting(true);
    startTransition(async () => {
      const result = await deleteMeetingAction(meeting.id);
      if (result.success) {
        toast({ title: '성공', description: '모임이 삭제되었습니다.' });
        router.push('/meetings');
      } else {
        toast({ title: '오류', description: result.error || '모임 삭제에 실패했습니다.', variant: 'destructive' });
        setIsDeleting(false);
      }
    });
  };
  
  const runAiAnalysis = async () => {
    setIsAiLoading(true);
    setAiError(null);
    setAiResult(null);
    try {
      const result = await costAnalysis({ spendingData: spendingDataForAI });
      setAiResult(result);
    } catch (error) {
      console.error("AI Analysis error:", error);
      setAiError(error instanceof Error ? error.message : "AI 분석 중 오류가 발생했습니다.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const mapLink = `https://maps.google.com/?q=${encodeURIComponent(meeting.locationName)}`;


  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardHeader className="bg-muted/30 p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <CardTitle className="text-3xl font-bold">{meeting.name}</CardTitle>
              <CardDescription className="text-base mt-1">
                만든이: {creator?.nickname || '알 수 없음'}
              </CardDescription>
            </div>
            {isCreator && (
              <div className="flex space-x-2">
                {/* TODO: Edit Meeting Functionality */}
                {/* <Button variant="outline" size="sm" disabled> 
                  <Edit3 className="mr-2 h-4 w-4" /> 수정
                </Button> */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={isDeleting || isPending}>
                      {isDeleting || isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                       삭제
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>정말로 이 모임을 삭제하시겠습니까?</AlertDialogTitle>
                      <AlertDialogDescription>
                        이 작업은 되돌릴 수 없습니다. 모임과 관련된 모든 지출 내역도 함께 삭제됩니다.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDeleting || isPending}>취소</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteMeeting} disabled={isDeleting || isPending} className="bg-destructive hover:bg-destructive/90">
                        {isDeleting || isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        삭제 확인
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <CalendarDays className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
              <div>
                <span className="font-medium">날짜 및 시간:</span>
                <p className="text-muted-foreground">{format(new Date(meeting.dateTime), 'yyyy년 M월 d일 (EEE) HH:mm', { locale: ko })}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
              <div>
                <span className="font-medium">장소:</span>
                <p className="text-muted-foreground">{meeting.locationName}
                  <a href={mapLink} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary hover:underline">
                    <ExternalLink className="inline-block h-3 w-3" /> 지도 보기
                  </a>
                </p>
              </div>
            </div>
          </div>
           <div className="flex items-start gap-2">
            <Users className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
            <div>
                <span className="font-medium">참여자 ({participants.length}명):</span>
                <p className="text-muted-foreground">{participants.map(p => p.nickname).join(', ')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="expenses" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="expenses">지출 내역</TabsTrigger>
          <TabsTrigger value="summary">정산 요약</TabsTrigger>
          <TabsTrigger value="ai-analysis">AI 비용 분석</TabsTrigger>
        </TabsList>
        
        <TabsContent value="expenses">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>지출 내역</CardTitle>
                <AddExpenseDialog 
                  meetingId={meeting.id} 
                  participants={participants} 
                  onExpenseAdded={handleExpenseAdded}
                  triggerButton={
                     <Button variant="outline" size="sm">
                        <PlusCircle className="mr-2 h-4 w-4" /> 새 지출 추가
                      </Button>
                  }
                />
              </div>
              <CardDescription>이 모임에서 발생한 모든 지출 항목입니다.</CardDescription>
            </CardHeader>
            <CardContent>
              {expenses.length > 0 ? (
                <ScrollArea className="h-[400px] pr-4">
                  <ul className="space-y-4">
                    {expenses.map(expense => (
                      <ExpenseItem 
                        key={expense.id} 
                        expense={expense} 
                        allFriends={allFriends} 
                        participants={participants}
                        currentUserId={currentUserId}
                        onExpenseUpdated={handleExpenseUpdated}
                        onExpenseDeleted={handleExpenseDeleted}
                      />
                    ))}
                  </ul>
                </ScrollArea>
              ) : (
                <p className="text-center text-muted-foreground py-8">등록된 지출 내역이 없습니다.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary">
          <PaymentSummary expenses={expenses} participants={participants} allFriends={allFriends} />
        </TabsContent>

        <TabsContent value="ai-analysis">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> AI 비용 분석</CardTitle>
              <CardDescription>AI를 통해 이 모임의 지출을 분석하고 절약 팁을 얻어보세요.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">분석할 지출 데이터:</h3>
                <Textarea value={spendingDataForAI} readOnly rows={8} className="bg-muted/50 text-sm"/>
              </div>
              <Button onClick={runAiAnalysis} disabled={isAiLoading || isPending}>
                {isAiLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                분석 실행
              </Button>
              {aiError && <p className="text-destructive text-sm">{aiError}</p>}
              {isAiLoading && <p className="text-muted-foreground text-sm">AI가 분석 중입니다. 잠시만 기다려주세요...</p>}
              {aiResult && (
                <div className="space-y-4 pt-4 border-t mt-4">
                  <div>
                    <h3 className="font-semibold text-lg mb-2">분석 요약</h3>
                    <p className="text-sm whitespace-pre-wrap bg-secondary p-3 rounded-md">{aiResult.summary}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">비용 절감 제안</h3>
                    <p className="text-sm whitespace-pre-wrap bg-secondary p-3 rounded-md">{aiResult.costCuttingSuggestions}</p>
                  </div>
                </div>
              )}
            </CardContent>
             <CardFooter>
              <p className="text-xs text-muted-foreground">AI 분석 결과는 참고용이며, 실제 상황과 다를 수 있습니다.</p>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
