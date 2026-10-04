'use client';

import type { Meeting, Expense, Friend } from '@/lib/types';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, differenceInCalendarDays, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';
import { deleteMeetingAction, finalizeMeetingSettlementAction, reopenMeetingSettlementAction, toggleMeetingShareAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import {
  CalendarDays, MapPin, Users as UsersIcon, Edit3, Trash2, PlusCircle, Loader2, ExternalLink, Eye,
  PiggyBank, CheckCircle2, AlertCircle, Copy, Share2, ArrowLeft
} from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useGoogleMaps } from '@/hooks/use-google-maps';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import type { User } from '@/lib/types';
import { calculateReserveFundBreakdown } from '@/lib/reserve-fund-settlement';
import { isSettlementSnapshot } from '@/lib/settlement';
import { meetingDate } from './meeting-date';

interface MeetingDetailsClientProps {
  initialMeeting: Meeting;
  initialExpenses: Expense[];
  allFriends: Friend[];
  allUsers?: User[];
  isReadOnlyShare?: boolean;
}

const getExpenseTime = (value: unknown) => meetingDate(value).getTime() || 0;

export function MeetingDetailsClient({
  initialMeeting,
  initialExpenses,
  allFriends,
  allUsers = [],
  isReadOnlyShare = false,
}: MeetingDetailsClientProps) {
  const activeMeetingId = useRef(initialMeeting.id);
  activeMeetingId.current = initialMeeting.id;
  const [meeting, setMeeting] = useState<Meeting>(initialMeeting);
  const [expenses, setExpenses] = useState<Expense[]>([...initialExpenses].sort((a, b) => getExpenseTime(b.createdAt) - getExpenseTime(a.createdAt)));
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [formattedMeetingDateTime, setFormattedMeetingDateTime] = useState<string | null>(null);

  const [shareEnabled, setShareEnabled] = useState(initialMeeting.isShareEnabled || false);
  const [selectedExpiryDays, setSelectedExpiryDays] = useState<string>(
    initialMeeting.shareExpiryDate && initialMeeting.dateTime
      ? Math.max(1, differenceInCalendarDays(initialMeeting.shareExpiryDate, new Date())).toString()
      : "7"
  );
  const [currentShareLink, setCurrentShareLink] = useState<string | null>(null);
  const [isShareSettingsSaving, setIsShareSettingsSaving] = useState(false);

  const { toast } = useToast();
  const router = useRouter();
  const { appUser, currentUser, isAdmin, userRole } = useAuth();
  const isCreator = appUser?.id === meeting.creatorId;

  const canManageMeetingActions = (isAdmin || (userRole === 'user' && isCreator)) && !isReadOnlyShare;
  const canManageExpenses = canManageMeetingActions;
  const canFinalize = canManageMeetingActions && !meeting.isSettled && expenses.length > 0;
  const isReadOnlyUser = userRole === 'user' && !isAdmin && !isCreator;

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerInstanceRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [showMap, setShowMap] = useState(false);
  const { isMapsLoaded, mapsLoadError, retryMaps } = useGoogleMaps(showMap);

  useEffect(() => {
    setMeeting(initialMeeting);
    setShareEnabled(initialMeeting.isShareEnabled || false);
    if (initialMeeting.isShareEnabled && initialMeeting.shareToken) {
      setCurrentShareLink(`${window.location.origin}/share/meeting/${initialMeeting.shareToken}`);
    } else {
      setCurrentShareLink(null);
    }
    if (initialMeeting.shareExpiryDate && initialMeeting.dateTime) {
        const diffDays = differenceInCalendarDays(initialMeeting.shareExpiryDate, new Date());
        if (diffDays >= 90) setSelectedExpiryDays("90");
        else if (diffDays >= 30) setSelectedExpiryDays("30");
        else if (diffDays >= 7) setSelectedExpiryDays("7");
        else if (diffDays > 0) setSelectedExpiryDays(diffDays.toString());
        else setSelectedExpiryDays("7");
    } else {
        setSelectedExpiryDays("7");
    }
  }, [initialMeeting]);

  useEffect(() => {
    setExpenses([...initialExpenses].sort((a, b) => getExpenseTime(b.createdAt) - getExpenseTime(a.createdAt)));
  }, [initialExpenses]);

  useEffect(() => {
    if (meeting?.dateTime) {
      let localFormattedString;
      const startTime = meetingDate(meeting.dateTime);
      if (meeting.endTime) {
        const endTime = meetingDate(meeting.endTime);
        if (isValid(startTime) && isValid(endTime)) {
           const duration = differenceInCalendarDays(endTime, startTime);
           localFormattedString = `${format(startTime, 'yyyy년 M월 d일 HH:mm', { locale: ko })} (${Math.max(0, duration) + 1}일)`;
        } else if (isValid(startTime)) {
           localFormattedString = format(startTime, 'yyyy년 M월 d일 (EEE) HH:mm', { locale: ko });
        } else {
           localFormattedString = '날짜 정보 없음';
        }
      } else if (isValid(startTime)) {
        localFormattedString = format(startTime, 'yyyy년 M월 d일 (EEE) HH:mm', { locale: ko });
      } else {
        localFormattedString = '날짜 정보 없음';
      }
      setFormattedMeetingDateTime(localFormattedString);
    }
  }, [meeting?.dateTime, meeting?.endTime]);

  useEffect(() => {
    if (showMap && !meeting.locationCoordinates) {
      setShowMap(false);
      return;
    }

    if (showMap && isMapsLoaded && mapContainerRef.current && meeting.locationCoordinates && window.google?.maps?.Map && window.google?.maps?.marker?.AdvancedMarkerElement) {
      const { AdvancedMarkerElement } = window.google.maps.marker;
      const currentCoords = meeting.locationCoordinates;

      mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
        center: currentCoords,
        zoom: 15,
        disableDefaultUI: true,
        zoomControl: true,
        mapId: 'NBBANG_MAP_ID_CREATE_FORM',
      });
      markerInstanceRef.current = new AdvancedMarkerElement({
        map: mapInstanceRef.current,
        position: currentCoords,
        title: meeting.locationName || '선택된 장소',
      });
      return () => {
        if (markerInstanceRef.current) markerInstanceRef.current.map = null;
        markerInstanceRef.current = null;
        mapInstanceRef.current = null;
      };
    } else if (!showMap) {
      if (markerInstanceRef.current) {
        markerInstanceRef.current.map = null;
        markerInstanceRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current = null;
      }
    }
  }, [showMap, isMapsLoaded, meeting.locationCoordinates, meeting.locationName]);

  const participants = useMemo(() =>
    meeting.participantIds
      .map(id => allFriends.find(f => f.id === id))
      .filter((f): f is Friend => Boolean(f)),
    [meeting.participantIds, allFriends]
  );

  const reserveFundBreakdown = useMemo(
    () => meeting.isSettled && isSettlementSnapshot(meeting.settlementSnapshot)
      ? meeting.settlementSnapshot.reserveFund
      : calculateReserveFundBreakdown({
        settings: meeting,
        expenses,
        participantIds: participants.map(participant => participant.id),
      }),
    [expenses, meeting, participants]
  );

  // Participants list to be used for display and in dialogs/components
  const displayParticipants = useMemo(() => {
    if (meeting.isTemporary) {
      return meeting.temporaryParticipants?.map((p) => ({
        id: p.id || p.name,
        name: p.name,
        description: '',
        groupId: meeting.groupId,
        createdAt: new Date(),
      })) || [];
    }
    return participants;
  }, [meeting.isTemporary, meeting.temporaryParticipants, participants, meeting.groupId]);

  const creatorName = useMemo(() => {
    const creator = allUsers.find(user => user.id === meeting.creatorId);
    let name = meeting.creatorName || '모임 작성자';
    if (creator) {
      name = creator.name || creator.email || meeting.creatorId.substring(0, 6);
      if (appUser && appUser.id === meeting.creatorId) {
        name += " (나)";
      }
    } else if (appUser && appUser.id === meeting.creatorId) {
      name = (appUser.name || appUser.email || appUser.id.substring(0,6)) + " (나)";
    }
    return name;
  }, [meeting.creatorId, meeting.creatorName, allUsers, appUser]);

  const handleExpenseAdded = (newExpense: Expense) => {
    setExpenses(previous => [newExpense, ...previous.filter(item => item.id !== newExpense.id)].sort((a,b) => getExpenseTime(b.createdAt) - getExpenseTime(a.createdAt)));
    if (meeting.isSettled) {
      setMeeting(prev => ({ ...prev, isSettled: false }));
    }
  };

  const handleExpenseUpdated = (updatedExpense: Expense) => {
    setExpenses(previous => previous.map(e => e.id === updatedExpense.id ? updatedExpense : e).sort((a,b) => getExpenseTime(b.createdAt) - getExpenseTime(a.createdAt)));
    if (meeting.isSettled) {
      setMeeting(prev => ({ ...prev, isSettled: false }));
    }
  };

  const handleExpenseDeleted = (deletedExpenseId: string) => {
    setExpenses(prev => prev.filter(e => e.id !== deletedExpenseId));
    if (meeting.isSettled) {
      setMeeting(prev => ({ ...prev, isSettled: false }));
    }
  };

  const handleDeleteMeeting = async () => {
    if (!currentUser?.uid) {
        toast({ title: '오류', description: '로그인이 필요합니다.', variant: 'destructive' });
        return;
    }
    if (!canManageMeetingActions) {
      toast({ title: '권한 없음', description: '모임 삭제 권한이 없습니다.', variant: 'destructive'});
      return;
    }
    setIsDeleting(true);
    try {
      const result = await deleteMeetingAction(meeting.id, currentUser.uid);
      if (activeMeetingId.current !== meeting.id) return;
      if (!result.success) throw new Error(result.error || '모임 삭제에 실패했습니다.');
      toast({ title: '성공', description: '모임이 삭제되었습니다.' });
      router.push('/meetings');
      router.refresh();
    } catch (cause) {
      toast({ title: '오류', description: cause instanceof Error ? cause.message : '모임 삭제에 실패했습니다.', variant: 'destructive' });
    } finally { setIsDeleting(false); }
  };

  const handleFinalizeSettlement = async () => {
    if (!currentUser?.uid) {
        toast({ title: '오류', description: '로그인이 필요합니다.', variant: 'destructive' });
        return;
    }
    if (!canFinalize) {
      toast({ title: '권한 없음 또는 조건 미충족', description: '정산 확정 권한이 없거나 조건이 충족되지 않았습니다.', variant: 'destructive'});
      return;
    }
    setIsFinalizing(true);
    try {
      const result = await finalizeMeetingSettlementAction(meeting.id, currentUser.uid);
      if (activeMeetingId.current !== meeting.id) return;
      if (!result.success || !result.meeting) throw new Error(result.error || '정산 확정에 실패했습니다.');
      setMeeting(result.meeting);
      toast({ title: '성공', description: result.message || '모임 정산이 확정되었습니다.' });
      router.refresh();
    } catch (cause) {
      toast({ title: '오류', description: cause instanceof Error ? cause.message : '정산 확정에 실패했습니다.', variant: 'destructive' });
    } finally { setIsFinalizing(false); }
  };

  const handleReopenSettlement = async () => {
    if (!currentUser || !canManageMeetingActions) return;
    setIsReopening(true);
    try {
      const result = await reopenMeetingSettlementAction(meeting.id, currentUser.uid);
      if (activeMeetingId.current !== meeting.id) return;
      if (!result.success || !result.meeting) throw new Error(result.error || '정산을 다시 열지 못했습니다.');
      setMeeting(result.meeting);
      toast({ title: '정산 다시 열기', description: '수정 후 다시 정산을 확정해주세요.' });
      router.refresh();
    } catch (cause) {
      toast({ title: '오류', description: cause instanceof Error ? cause.message : '정산을 다시 열지 못했습니다.', variant: 'destructive' });
    } finally { setIsReopening(false); }
  };

  const handleSaveShareSettings = async () => {
    if (!currentUser?.uid) {
      toast({ title: "오류", description: "로그인이 필요합니다.", variant: "destructive" });
      return;
    }
    if (!canManageMeetingActions) {
        toast({ title: '권한 없음', description: '공유 설정을 변경할 권한이 없습니다.', variant: 'destructive'});
        return;
    }
    setIsShareSettingsSaving(true);
    try {
      const result = await toggleMeetingShareAction(meeting.id, currentUser.uid, shareEnabled, parseInt(selectedExpiryDays));
      if (activeMeetingId.current !== meeting.id) return;
      if (!result.success || !result.meeting) throw new Error(result.error || '공유 설정 저장에 실패했습니다.');
      toast({ title: '성공', description: '공유 설정이 저장되었습니다.' });
      setMeeting(result.meeting);
      setCurrentShareLink(result.meeting.isShareEnabled && result.meeting.shareToken ? `${window.location.origin}/share/meeting/${result.meeting.shareToken}` : null);
    } catch (cause) {
      toast({ title: '오류', description: cause instanceof Error ? cause.message : '공유 설정 저장에 실패했습니다.', variant: 'destructive' });
    } finally { setIsShareSettingsSaving(false); }
  };

  const handleCopyToClipboard = (copyText: string, descText: string) => {
    navigator.clipboard.writeText(copyText)
      .then(() => toast({ title: "성공", description: `${descText}가 복사되었습니다.` }))
      .catch(() => toast({ title: "오류", description: `${descText} 복사에 실패했습니다.`, variant: "destructive" }));
  };

  const handleCopyShareLink = () => {
    if (currentShareLink)
      handleCopyToClipboard(currentShareLink, "공유 링크");
  };

  const handleCopyLocationName = () => {
    if (meeting.locationName)
      handleCopyToClipboard(meeting.locationName, "장소");
  };

  return (
    <div className="space-y-6">
      {!isReadOnlyShare && (
        <div className="flex items-center justify-between">
          <Button variant="outline" asChild>
            <Link href="/meetings">
              <ArrowLeft className="mr-2 h-4 w-4" />
              모든 모임 목록
            </Link>
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="bg-muted/30 p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-3xl font-bold">{meeting.name}</CardTitle>
                <Badge variant={meeting.isSettled ? 'secondary' : 'outline'} className="shrink-0">
                  {meeting.isSettled ? <CheckCircle2 className="mr-1 h-4 w-4" /> : <AlertCircle className="mr-1 h-4 w-4" />}
                  {meeting.isSettled ? '정산 확정' : '정산 미확정'}
                </Badge>
                 {isReadOnlyShare && (
                    <Badge variant="secondary" className="shrink-0">
                        <Eye className="h-4 w-4 mr-1.5" /> 공유된 페이지 (읽기 전용)
                    </Badge>
                )}
              </div>
              <CardDescription className="text-base mt-1">
                만든이: {creatorName}
              </CardDescription>
              {(() => {
                if (!meeting || !meeting.isShareEnabled) {
                  return null;
                }

                let expiryDate: Date | null = null;
                if (meeting.shareExpiryDate) {
                  if (typeof meeting.shareExpiryDate === 'string') {
                    expiryDate = new Date(meeting.shareExpiryDate);
                  } else if (meeting.shareExpiryDate instanceof Date) {
                    expiryDate = meeting.shareExpiryDate;
                  }
                }

                if (expiryDate && !isNaN(expiryDate.getTime())) {
                  const now = new Date();
                  if (expiryDate < now) {
                    return <p className="text-sm text-red-500 mt-2">공유가 만료되었습니다.</p>;
                  } else {
                    return <p className="text-sm text-gray-600 mt-2">공유 마감: {format(expiryDate, 'yyyy년 MM월 dd일 HH:mm', { locale: ko })}</p>;
                  }
                } else {
                  return null;
                }
              })()}
            </div>
            {canManageMeetingActions && !isReadOnlyUser && (
              <div className="flex space-x-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => router.push(`/meetings/${meeting.id}/edit`)} disabled={isDeleting || isFinalizing || meeting.isSettled }>
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
                        {meeting.isSettled && " 또한, 정산 확정 상태도 취소됩니다."}
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
        <CardContent className="grid grid-cols-3 gap-2 border-t px-4 py-4 text-center sm:px-6">
          <div><p className="text-xs text-muted-foreground">총 지출</p><p className="mt-1 font-semibold sm:text-xl">{expenses.reduce((sum, expense) => sum + expense.totalAmount, 0).toLocaleString()}원</p></div>
          <div><p className="text-xs text-muted-foreground">참여자</p><p className="mt-1 font-semibold sm:text-xl">{displayParticipants.length}명</p></div>
          <div><p className="text-xs text-muted-foreground">정산 상태</p><p className="mt-1 font-semibold sm:text-xl">{meeting.isSettled ? '금액 확정' : '미확정'}</p></div>
        </CardContent>
        <details className="border-t">
          <summary className="cursor-pointer px-6 py-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">일정 · 장소 · 참여자 · 회비 설정 보기</summary>
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
                <div className="flex items-center space-x-2">
                  <span className="font-medium">장소:</span>
                  <p className="text-muted-foreground">
                    {meeting.locationName}
                  </p>
                  <Button type="button" variant="outline" size="icon" onClick={handleCopyLocationName}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {meeting.locationCoordinates && (
                  <div className="flex gap-2 mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="sm:w-auto"
                      onClick={() => setShowMap(prev => !prev)}
                    >
                      <Eye className="mr-2 h-4 w-4" />{showMap ? '지도 숨기기' : '지도 보기'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="sm:w-auto"
                      onClick={() => {
                        const url = `https://www.google.com/maps/search/?api=1&query=${meeting.locationName}`;
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />외부 지도에서 보기
                    </Button>
                  </div>
                )}
                {showMap && !isMapsLoaded && !mapsLoadError && <p role="status" className="mt-2 text-sm text-muted-foreground">지도를 불러오고 있습니다.</p>}
                {showMap && mapsLoadError && <div role="alert" className="mt-2 space-y-2 text-sm"><p>{mapsLoadError.message}</p><Button variant="outline" size="sm" onClick={retryMaps}>지도 다시 불러오기</Button></div>}
                {meeting.locationCoordinates && showMap && (
                  <div
                    ref={mapContainerRef}
                    className={cn(
                      'w-full mt-2 h-64 rounded-md border',
                      isMapsLoaded && !mapsLoadError ? 'block' : 'hidden'
                    )}
                  >
                    {(!meeting.locationCoordinates && showMap && isMapsLoaded) && (
                      <p className="flex items-center justify-center h-full text-muted-foreground">표시할 좌표가 없습니다.</p>
                    )}
                    {(!isMapsLoaded && showMap) && (
                      <p className="flex items-center justify-center h-full text-muted-foreground">지도 API 로딩 중...</p>
                    )}
                    {(mapsLoadError && showMap) && (
                      <p className="flex items-center justify-center h-full text-muted-foreground">지도 API 로드 실패: {mapsLoadError.message}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <UsersIcon className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
            <div>
              <span className="font-medium">
                참여자 (
                {meeting.isTemporary
                  ? meeting.temporaryParticipants?.length || 0
                  : participants.length}
                명):
              </span>
              {meeting.isTemporary ? (
                meeting.temporaryParticipants && meeting.temporaryParticipants.length > 0 ? (
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {meeting.temporaryParticipants.map((p, index) => (
                      <li key={index} className="text-sm">{p.name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">임시 참여자가 없습니다.</p>
                )
              ) : (
                <p className="text-muted-foreground">
                  {participants.map(p => p.name + (p.description ? ` (${p.description})` : '')).join(', ')}
                </p>
              )}
            </div>
          </div>

          {meeting.isTemporary ? (
            <div className="p-3 bg-secondary/30 rounded-md border text-sm space-y-1">
              <div className="flex items-center gap-2">
                <PiggyBank className="h-4 w-4 text-primary" />
                <span className="font-medium">회비 정보 (임시 모임):</span>
              </div>
              {typeof meeting.totalFee === 'number' ? (
                <p className="text-muted-foreground pl-6">총 회비: {meeting.totalFee.toLocaleString()}원</p>
              ) : null}
              {typeof meeting.feePerPerson === 'number' ? (
                <p className="text-muted-foreground pl-6">1인당 회비: {meeting.feePerPerson.toLocaleString()}원</p>
              ) : null}
              {(typeof meeting.totalFee !== 'number' && typeof meeting.feePerPerson !== 'number') && (
                <p className="text-muted-foreground pl-6">설정된 회비 정보가 없습니다.</p>
              )}
            </div>
          ) : meeting.useReserveFund && (meeting.reserveFundCoverAll || (meeting.partialReserveFundAmount || 0) > 0) ? (
            <div className="p-3 bg-secondary/30 rounded-md border border-primary/30 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <PiggyBank className="h-4 w-4 text-primary" />
                <span className="font-medium">회비 사용 설정:</span>
              </div>
              <p className="text-muted-foreground pl-6">
                {meeting.reserveFundCoverAll
                  ? `참가자 비용 전액 자동 지원 · 현재 ${reserveFundBreakdown.baseFundUsed.toLocaleString()}원 (미참가자 환급 별도)`
                  : `참가자 지원 예산 ${(meeting.partialReserveFundAmount || 0).toLocaleString()}원 (미참가자 환급 별도)`}
                {meeting.isSettled && ` (정산 확정됨)`}
              </p>
              {typeof meeting.settledReserveFundAmount === 'number' && (
                <p className="text-muted-foreground pl-6 text-xs">
                  확정된 회비 사용액: {meeting.settledReserveFundAmount.toLocaleString()}원
                </p>
              )}
              {reserveFundBreakdown.perApplicableFundShare > 0 && (
                <p className="text-muted-foreground pl-6 text-xs">
                  참여자 평균 회비 지원액: {reserveFundBreakdown.perApplicableFundShare.toLocaleString()}원
                </p>
              )}
              {meeting.nonReserveFundParticipants && meeting.nonReserveFundParticipants.length > 0 && (
                <p className="text-muted-foreground pl-6 text-xs">
                  (회비 사용 제외: {meeting.nonReserveFundParticipants.map(id => {
                    const f = allFriends.find(f => f.id === id);
                    return f ? f.name + (f.description ? ` (${f.description})` : '') : '알 수 없음';
                  }).join(', ')})
                </p>
              )}
              {meeting.refundReserveFundToNonParticipants && reserveFundBreakdown.refundRecipientIds.length > 0 && (
                <>
                  <p className="text-muted-foreground pl-6 text-xs">
                    미참가자 환급 대상: {reserveFundBreakdown.refundRecipientIds.map((id: string) => {
                      const f = allFriends.find(friend => friend.id === id);
                      return f ? f.name + (f.description ? ` (${f.description})` : '') : '알 수 없음';
                    }).join(', ')}
                  </p>
                  <p className="text-muted-foreground pl-6 text-xs">
                    미참가자 환급 총액: {reserveFundBreakdown.refundTotal.toLocaleString()}원, 총 회비 사용: {reserveFundBreakdown.totalFundUsed.toLocaleString()}원
                  </p>
                </>
              )}
            </div>
          ) : meeting.useReserveFund ? (
             <div className="p-3 bg-secondary/30 rounded-md border text-sm space-y-1">
                <div className="flex items-center gap-2">
                    <PiggyBank className="h-4 w-4 text-primary" />
                    <span className="font-medium">회비 사용 설정:</span>
                </div>
                <p className="text-muted-foreground pl-6">회비 사용하도록 설정되었으나, 사용할 금액이 지정되지 않았습니다. {!isReadOnlyShare && "모임 수정을 통해 금액을 설정해주세요."}</p>
            </div>
          ) : (
            <div className="p-3 bg-secondary/30 rounded-md border text-sm space-y-1">
                <div className="flex items-center gap-2">
                    <PiggyBank className="h-4 w-4" />
                    <span className="font-medium">회비 사용 설정:</span>
                </div>
                <p className="text-muted-foreground pl-6">사용 안함</p>
            </div>
          )}

          {(meeting.memo && meeting.memo.trim() !== '' && (
              <div className="mt-6">
                <Label className="font-medium">메모</Label>
                <div className="w-full mt-2 p-2 border rounded-md min-h-[80px] text-sm bg-muted/50">
                  {meeting.memo}
                </div>
              </div>
            )
          )}
        </CardContent>
        </details>
      </Card>

      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="summary" className="flex-1">정산 요약</TabsTrigger>
          <TabsTrigger value="expenses" className="flex-1">지출 내역 ({expenses.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>지출 내역</CardTitle>
                {canManageExpenses && (
                  <AddExpenseDialog
                    meetingId={meeting.id}
                    participants={displayParticipants}
                    roomCreatorName={creatorName}
                    onExpenseAdded={handleExpenseAdded}
                    triggerButton={
                      <Button variant="outline" size="sm" disabled={isDeleting || isFinalizing || meeting.isSettled || isReadOnlyUser}>
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
                        meetingId={meeting.id}
                        allFriends={allFriends}
                        participants={displayParticipants}
                        onExpenseUpdated={handleExpenseUpdated}
                        onExpenseDeleted={handleExpenseDeleted}
                        isCreator={isCreator}
                        isMeetingSettled={meeting.isSettled || false}
                        isTemporaryMeeting={meeting.isTemporary}
                        isReadOnly={isReadOnlyShare}
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
          <div className="space-y-4">
            {(canFinalize || (canManageMeetingActions && meeting.isSettled)) && <div aria-label="정산 관리" className="flex justify-end">
              {canManageMeetingActions && meeting.isSettled && <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="outline" size="sm" disabled={isReopening || isDeleting || isFinalizing}>{isReopening && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}정산 다시 열기</Button></AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>확정한 정산을 다시 여시겠습니까?</AlertDialogTitle><AlertDialogDescription>확정된 정산을 해제하고 회비 기록을 반영합니다. 수정한 뒤 새 금액으로 다시 확정해주세요.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={handleReopenSettlement}>다시 열기</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
              </AlertDialog>}
                  {canManageExpenses && !meeting.isSettled && !isReadOnlyShare && (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      {canFinalize && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button disabled={isFinalizing || isDeleting} size="sm">
                              {isFinalizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                              정산 확정
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>정산을 확정하시겠습니까?</AlertDialogTitle>
                              <AlertDialogDescription>
                                현재 지출과 참여자 기준으로 정산 금액을 저장합니다. 확정 후 모임과 지출 수정이 제한됩니다.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={isFinalizing || isDeleting}>취소</AlertDialogCancel>
                              <AlertDialogAction onClick={handleFinalizeSettlement} disabled={isFinalizing || isDeleting} className="bg-primary">
                                {isFinalizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                정산 확정
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  )}

            </div>}
            <PaymentSummary
              meeting={meeting}
              expenses={expenses}
              participants={displayParticipants}
              allFriends={allFriends}
            />
          </div>
        </TabsContent>
      </Tabs>

      {canManageMeetingActions && (
        <Accordion type="single" collapsible className="my-4">
          <AccordionItem value="share-settings" className="rounded-lg border bg-white px-4 py-2">
            <AccordionTrigger className="py-4 px-2">
              <div className="flex items-center gap-2">
                <Share2 className="h-5 w-5" />
                모임 공유 설정
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4 px-2">
              <Card className="shadow-none border-none p-0 bg-transparent">
                <CardHeader className="p-0 pb-2">
                  <CardDescription>이 모임의 정산 내역을 다른 사람과 공유할 수 있습니다.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-0">
                  <div className="flex items-center space-x-2 mt-2">
                    <Switch
                      id="share-enable"
                      checked={shareEnabled}
                      onCheckedChange={setShareEnabled}
                      disabled={isShareSettingsSaving || isReadOnlyUser}
                    />
                    <Label htmlFor="share-enable">공유 활성화</Label>
                  </div>
                  {shareEnabled && (
                    <>
                      <div className="mt-2">
                        <Label htmlFor="share-expiry">공유 만료 기간</Label>
                        <Select
                          value={selectedExpiryDays}
                          onValueChange={setSelectedExpiryDays}
                          disabled={isShareSettingsSaving || isReadOnlyUser}
                        >
                          <SelectTrigger id="share-expiry" className="w-[180px] mt-1">
                            <SelectValue placeholder="기간 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="7">7일 후 만료</SelectItem>
                            <SelectItem value="30">30일 후 만료</SelectItem>
                            <SelectItem value="90">90일 후 만료</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {currentShareLink && (
                        <div className="space-y-2 mt-2">
                          <Label>공유 링크 (읽기 전용)</Label>
                          <div className="flex items-center space-x-2">
                            <Input type="text" value={currentShareLink} readOnly className="text-xs" />
                            <Button type="button" variant="outline" size="icon" onClick={handleCopyShareLink}>
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => {
                                if (navigator.share) {
                                  navigator.share({
                                    title: '모임 공유 링크',
                                    text: '모임 정산 내역을 공유합니다.',
                                    url: currentShareLink,
                                  }).catch(() => {});
                                } else {
                                  toast({ title: '공유 불가', description: '이 브라우저에서는 웹 공유 기능을 지원하지 않습니다.', variant: 'destructive' });
                                }
                              }}
                              aria-label="공유"
                            >
                              <Share2 className="h-4 w-4" />
                            </Button>
                          </div>
                          {meeting.shareExpiryDate && (
                            <p className="text-xs text-muted-foreground">
                              만료일: {isValid(meetingDate(meeting.shareExpiryDate)) ? format(meetingDate(meeting.shareExpiryDate), 'yyyy년 M월 d일 HH:mm', { locale: ko }) : '날짜 정보 없음'}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
                <CardFooter className="p-0 pt-4">
                  <Button onClick={handleSaveShareSettings} disabled={isShareSettingsSaving || isReadOnlyUser} className="w-full mt-2 py-3 text-base rounded-md">
                    {isShareSettingsSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    공유 설정 저장
                  </Button>
                </CardFooter>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}


    </div>
  );
}
