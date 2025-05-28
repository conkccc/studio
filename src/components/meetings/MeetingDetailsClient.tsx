
'use client';

import type { Meeting, Expense, Friend } from '@/lib/types';
import React, { useState, useTransition, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, differenceInCalendarDays, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';
import { deleteMeetingAction, finalizeMeetingSettlementAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { CalendarDays, MapPin, Users, Edit3, Trash2, PlusCircle, Loader2, ExternalLink, PiggyBank, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { AddExpenseDialog } from './AddExpenseDialog';
import { ExpenseItem } from './ExpenseItem';
import { PaymentSummary } from './PaymentSummary';
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
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';

interface MeetingDetailsClientProps {
  initialMeeting: Meeting;
  initialExpenses: Expense[];
  allFriends: Friend[];
}

export function MeetingDetailsClient({
  initialMeeting,
  initialExpenses,
  allFriends,
}: MeetingDetailsClientProps) {
  const [meeting, setMeeting] = useState<Meeting>(initialMeeting);
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [formattedMeetingDateTime, setFormattedMeetingDateTime] = useState<string | null>(null);

  const { toast } = useToast();
  const router = useRouter();
  const { currentUser, isAdmin } = useAuth(); 
  const isCreator = currentUser?.uid === meeting.creatorId;

  useEffect(() => {
    setMeeting(initialMeeting);
  }, [initialMeeting]);

  useEffect(() => {
    setExpenses(initialExpenses.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }, [initialExpenses]);


  useEffect(() => {
    if (meeting?.dateTime) {
      let localFormattedString;
      const startTime = meeting.dateTime; 
      if (meeting.endTime && isValid(new Date(meeting.endTime))) { 
        const endTime = new Date(meeting.endTime); 
        const duration = differenceInCalendarDays(endTime, startTime);
        localFormattedString = `${format(startTime, 'yyyy년 M월 d일 HH:mm', { locale: ko })} (${Math.max(0, duration) + 1}일)`;
      } else if (isValid(startTime)) {
        localFormattedString = format(startTime, 'yyyy년 M월 d일 (EEE) HH:mm', { locale: ko });
      } else {
        localFormattedString = '날짜 정보 없음';
      }
      setFormattedMeetingDateTime(localFormattedString);
    }
  }, [meeting?.dateTime, meeting?.endTime]);


  const participants = useMemo(() =>
    meeting.participantIds
      .map(id => allFriends.find(f => f.id === id))
      .filter((f): f is Friend => Boolean(f)),
    [meeting.participantIds, allFriends]
  );

  const creatorName = useMemo(() => {
    if (currentUser && meeting.creatorId === currentUser.uid && isAdmin) {
      return '관리자 (나)';
    }
    const creatorFriend = allFriends.find(f => f.id === meeting.creatorId);
    return creatorFriend?.nickname || '알 수 없음';
  }, [meeting.creatorId, allFriends, currentUser, isAdmin]);


  const handleExpenseAdded = (newExpense: Expense) => {
    const newExpenses = [newExpense, ...expenses].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setExpenses(newExpenses);
    if (meeting.isSettled) {
      // If meeting was settled, adding an expense should make it unsettled
      setMeeting(prev => ({ ...prev, isSettled: false }));
    }
  };

  const handleExpenseUpdated = (updatedExpense: Expense) => {
    const newExpenses = expenses.map(e => e.id === updatedExpense.id ? updatedExpense : e).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setExpenses(newExpenses);
     if (meeting.isSettled) {
       // If meeting was settled, updating an expense should make it unsettled
        setMeeting(prev => ({ ...prev, isSettled: false }));
    }
  };

  const handleExpenseDeleted = (deletedExpenseId: string) => {
    setExpenses(prev => prev.filter(e => e.id !== deletedExpenseId));
     if (meeting.isSettled) {
        // If meeting was settled, deleting an expense should make it unsettled
        setMeeting(prev => ({ ...prev, isSettled: false }));
    }
  };

  const handleDeleteMeeting = async () => {
    if (!isAdmin && !isCreator) {
      toast({ title: '권한 없음', description: '모임 삭제는 관리자 또는 모임 생성자만 가능합니다.', variant: 'destructive'});
      return;
    }
    setIsDeleting(true);
    // startTransition not defined here, should wrap startTransition around this function if needed
    const result = await deleteMeetingAction(meeting.id);
    if (result.success) {
      toast({ title: '성공', description: '모임이 삭제되었습니다.' });
      router.push('/meetings');
      router.refresh(); 
    } else {
      toast({ title: '오류', description: result.error || '모임 삭제에 실패했습니다.', variant: 'destructive' });
      setIsDeleting(false);
    }
  };

  const handleFinalizeSettlement = async () => {
    if (!isAdmin) {
      toast({ title: '권한 없음', description: '정산 확정은 관리자만 가능합니다.', variant: 'destructive'});
      return;
    }
    setIsFinalizing(true);
    // startTransition not defined here
    const result = await finalizeMeetingSettlementAction(meeting.id);
    if (result.success && result.meeting) {
      setMeeting(result.meeting); 
      toast({ title: '성공', description: result.message || '모임 정산이 확정되고 회비 사용 내역이 기록되었습니다.' });
      router.refresh(); 
    } else {
      toast({ title: '오류', description: result.error || '정산 확정에 실패했습니다.', variant: 'destructive' });
    }
    setIsFinalizing(false);
  };

  const mapLink = meeting.locationCoordinates 
    ? `https://www.google.com/maps/search/?api=1&query=${meeting.locationCoordinates.lat},${meeting.locationCoordinates.lng}`
    : `https://maps.google.com/?q=${encodeURIComponent(meeting.locationName)}`;


  const canFinalizeSettlement = meeting.useReserveFund && 
                                 meeting.partialReserveFundAmount && 
                                 meeting.partialReserveFundAmount > 0 && 
                                 !meeting.isSettled && 
                                 expenses.length > 0 &&
                                 isAdmin; 

  const canManageMeeting = isAdmin || isCreator;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardHeader className="bg-muted/30 p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-3xl font-bold">{meeting.name}</CardTitle>
                {meeting.useReserveFund && meeting.partialReserveFundAmount && meeting.partialReserveFundAmount > 0 ? (
                    meeting.isSettled ? (
                    <Badge variant="default" className="bg-green-600 hover:bg-green-700 shrink-0">
                        <CheckCircle2 className="h-4 w-4 mr-1.5" /> 정산 확정됨
                    </Badge>
                    ) : expenses.length > 0 ? (
                    <Badge variant="outline" className="border-orange-500 text-orange-600 shrink-0">
                        <AlertCircle className="h-4 w-4 mr-1.5" /> 정산 확정 필요
                    </Badge>
                    ) : (
                    <Badge variant="outline" className="border-blue-500 text-blue-600 shrink-0">
                        <Info className="h-4 w-4 mr-1.5" /> 회비 사용 예정
                    </Badge>
                    )
                ) : meeting.useReserveFund ? (
                     <Badge variant="outline" className="border-yellow-500 text-yellow-600 shrink-0">
                        <Info className="h-4 w-4 mr-1.5" /> 회비 사용 예정 (금액 미설정)
                    </Badge>
                ): null}
              </div>
              <CardDescription className="text-base mt-1">
                만든이: {creatorName}
              </CardDescription>
            </div>
            {canManageMeeting && (
              <div className="flex space-x-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => router.push(`/meetings/${meeting.id}/edit`)} disabled={isDeleting || isFinalizing || (meeting.isSettled && !isAdmin) }>
                  <Edit3 className="mr-2 h-4 w-4" /> 수정
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={isDeleting || isFinalizing}>
                      {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                      삭제
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>정말로 이 모임을 삭제하시겠습니까?</AlertDialogTitle>
                      <AlertDialogDescription>
                        이 작업은 되돌릴 수 없습니다. 모임과 관련된 모든 지출 내역도 함께 삭제됩니다.
                        {meeting.isSettled && " 또한, 기록된 회비 사용 내역도 취소됩니다."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDeleting || isFinalizing}>취소</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteMeeting} disabled={isDeleting || isFinalizing} className="bg-destructive hover:bg-destructive/90">
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
                <p className="text-muted-foreground">{formattedMeetingDateTime || '날짜 정보 로딩 중...'}</p>
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
          {meeting.useReserveFund && meeting.partialReserveFundAmount && meeting.partialReserveFundAmount > 0 ? (
            <div className="p-3 bg-secondary/30 rounded-md border border-primary/30 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <PiggyBank className="h-4 w-4 text-primary" />
                <span className="font-medium">회비 사용 설정:</span>
              </div>
              <p className="text-muted-foreground pl-6">
                {`회비에서 ${(meeting.partialReserveFundAmount || 0).toLocaleString()}원 사용`}
                {meeting.isSettled && ` (정산 확정됨)`}
              </p>
              {meeting.nonReserveFundParticipants && meeting.nonReserveFundParticipants.length > 0 && (
                <p className="text-muted-foreground pl-6 text-xs">
                  (회비 사용 제외: {meeting.nonReserveFundParticipants.map(id => allFriends.find(f => f.id === id)?.nickname || '알 수 없음').join(', ')})
                </p>
              )}
            </div>
          ) : meeting.useReserveFund ? (
             <div className="p-3 bg-secondary/30 rounded-md border text-sm space-y-1">
                <div className="flex items-center gap-2">
                    <PiggyBank className="h-4 w-4 text-primary" />
                    <span className="font-medium">회비 사용 설정:</span>
                </div>
                <p className="text-muted-foreground pl-6">회비 사용하도록 설정되었으나, 사용할 금액이 지정되지 않았습니다. 모임 수정을 통해 금액을 설정해주세요.</p>
            </div>
          ) : (
            <div className="p-3 bg-secondary/30 rounded-md border text-sm space-y-1">
                <div className="flex items-center gap-2">
                    <PiggyBank className="h-4 w-4" /> {/* No text-primary if not used */}
                    <span className="font-medium">회비 사용 설정:</span>
                </div>
                <p className="text-muted-foreground pl-6">사용 안함</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="expenses" className="w-full">
        <TabsList className="grid w-full grid-cols-2"> 
          <TabsTrigger value="expenses">지출 내역</TabsTrigger>
          <TabsTrigger value="summary">정산 요약</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>지출 내역</CardTitle>
                {(isAdmin || isCreator) && ( 
                  <AddExpenseDialog
                    meetingId={meeting.id}
                    participants={participants}
                    onExpenseAdded={handleExpenseAdded}
                    triggerButton={
                       <Button variant="outline" size="sm" disabled={isDeleting || isFinalizing || (meeting.isSettled && !isAdmin) }>
                          <PlusCircle className="mr-2 h-4 w-4" /> 새 지출 추가
                        </Button>
                    }
                  />
                )}
              </div>
              <CardDescription>이 모임에서 발생한 모든 지출 항목입니다.</CardDescription>
            </CardHeader>
            <CardContent>
              {expenses.length > 0 ? (
                  <ul className="space-y-4"> 
                    {expenses.map(expense => (
                      <ExpenseItem
                        key={expense.id}
                        expense={expense}
                        meetingId={meeting.id} // Pass meetingId
                        allFriends={allFriends}
                        participants={participants}
                        onExpenseUpdated={handleExpenseUpdated}
                        onExpenseDeleted={handleExpenseDeleted}
                        isMeetingSettled={meeting.isSettled || false}
                        canManage={isAdmin || (isCreator && currentUser?.uid === expense.paidById) || (isCreator && !expense.paidById) } // Creator can manage their own expenses or unassigned ones
                      />
                    ))}
                  </ul>
              ) : (
                <p className="text-center text-muted-foreground py-8">등록된 지출 내역이 없습니다.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle>정산 요약</CardTitle>
                {canFinalizeSettlement && (
                  <Button onClick={handleFinalizeSettlement} disabled={isFinalizing || isDeleting} size="sm">
                    {isFinalizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    정산 확정 및 회비 사용 기록
                  </Button>
                )}
              </div>
              {meeting.useReserveFund && meeting.isSettled && expenses.length > 0 && (
                 <CardDescription className="text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4"/> 이 모임의 회비 사용 정산이 확정되어 회비 내역에 기록되었습니다.
                 </CardDescription>
              )}
               {meeting.useReserveFund && !meeting.isSettled && expenses.length === 0 && meeting.partialReserveFundAmount && meeting.partialReserveFundAmount > 0 && (
                 <CardDescription className="text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="h-4 w-4"/> 지출 내역이 없어 회비 사용을 확정할 수 없습니다.
                 </CardDescription>
              )}
            </CardHeader>
            <PaymentSummary meeting={meeting} expenses={expenses} participants={participants} allFriends={allFriends} />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

    