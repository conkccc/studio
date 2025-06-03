'use client';

import type { Meeting, Expense, Friend } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import React, { useState, useTransition, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, differenceInCalendarDays, isValid, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { deleteMeetingAction, finalizeMeetingSettlementAction, toggleMeetingShareAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import {
  CalendarDays, MapPin, Users as UsersIcon, Edit3, Trash2, PlusCircle, Loader2, ExternalLink, Eye,
  PiggyBank, CheckCircle2, AlertCircle, Info, Settings, Link2, Copy, Share2, ArrowLeft
} from 'lucide-react';
import { AddExpenseDialog } from './AddExpenseDialog';
import { EditExpenseDialog } from './EditExpenseDialog';
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
import { Loader } from '@googlemaps/js-api-loader';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

const googleMapsLibraries: ("places" | "maps" | "marker")[] = ["places", "maps", "marker"];

interface MeetingDetailsClientProps {
  initialMeeting: Meeting;
  initialExpenses: Expense[];
  allFriends: Friend[];
  isReadOnlyShare?: boolean;
}

export function MeetingDetailsClient({
  initialMeeting,
  initialExpenses,
  allFriends,
  isReadOnlyShare = false,
}: MeetingDetailsClientProps) {
  const [meeting, setMeeting] = useState<Meeting>(initialMeeting);
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses.sort((a, b) => (b.createdAt instanceof Date ? b.createdAt.getTime() : (b.createdAt as any).toDate().getTime()) - (a.createdAt instanceof Date ? a.createdAt.getTime() : (a.createdAt as any).toDate().getTime())));
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [formattedMeetingDateTime, setFormattedMeetingDateTime] = useState<string | null>(null);

  const [shareEnabled, setShareEnabled] = useState(initialMeeting.isShareEnabled || false);
  const [selectedExpiryDays, setSelectedExpiryDays] = useState<string>(
    initialMeeting.shareExpiryDate && initialMeeting.dateTime
      ? Math.max(1, differenceInCalendarDays(initialMeeting.shareExpiryDate, new Date())).toString() // Ensure at least 1 day if date is in past
      : "7" // Default to 7 days
  );
  const [currentShareLink, setCurrentShareLink] = useState<string | null>(null);
  const [isShareSettingsSaving, setIsShareSettingsSaving] = useState(false);

  const { toast } = useToast();
  const router = useRouter();
  const { currentUser, isAdmin, userRole } = useAuth();
  const isCreator = currentUser?.uid === meeting.creatorId;
  // userRole: 'admin' | 'user' | 'none'

  // 권한 플래그: user도 모든 정보는 볼 수 있으나, 수정/삭제/추가 등은 불가
  const canManageMeetingActions = (isAdmin || isCreator) && !isReadOnlyShare;
  const canManageExpenses = (isAdmin || isCreator) && !isReadOnlyShare;
  const canFinalize = isAdmin && meeting.useReserveFund && meeting.partialReserveFundAmount && meeting.partialReserveFundAmount > 0 && !meeting.isSettled && expenses.length > 0 && !isReadOnlyShare;
  const isReadOnlyUser = userRole === 'user' && !isAdmin && !isCreator;

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerInstanceRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [isMapsLoaded, setIsMapsLoaded] = useState(false);
  const [mapsLoadError, setMapsLoadError] = useState<Error | null>(null);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setMapsLoadError(new Error("Google Maps API key is not configured."));
      setIsMapsLoaded(false);
      return;
    }
    const loader = new Loader({
      apiKey,
      version: "weekly",
      libraries: googleMapsLibraries,
    });
    loader.load()
      .then(() => {
        setIsMapsLoaded(true);
        setMapsLoadError(null);
      })
      .catch(e => {
        setMapsLoadError(e as Error);
        setIsMapsLoaded(false);
      });
  }, []);

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
        else if (diffDays > 0) setSelectedExpiryDays(diffDays.toString()); // For custom or very near expiry
        else setSelectedExpiryDays("7"); // Default or if expired
    } else {
        setSelectedExpiryDays("7");
    }
  }, [initialMeeting]);

  useEffect(() => {
    setExpenses(initialExpenses.sort((a, b) => (b.createdAt instanceof Date ? b.createdAt.getTime() : (b.createdAt as any).toDate().getTime()) - (a.createdAt instanceof Date ? a.createdAt.getTime() : (a.createdAt as any).toDate().getTime())));
  }, [initialExpenses]);

  useEffect(() => {
    if (meeting?.dateTime) {
      let localFormattedString;
      const startTime = meeting.dateTime instanceof Timestamp ? meeting.dateTime.toDate() : new Date(meeting.dateTime);
      if (meeting.endTime) {
        const endTime = meeting.endTime instanceof Timestamp ? meeting.endTime.toDate() : new Date(meeting.endTime);
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
    if (showMap && isMapsLoaded && mapContainerRef.current && window.google?.maps?.Map && window.google?.maps?.marker?.AdvancedMarkerElement) {
      const { AdvancedMarkerElement } = window.google.maps.marker;
      const currentCoords = meeting.locationCoordinates!;

      // 항상 새로 생성
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
    } else if (!showMap) {
      // 숨길 때 ref 초기화
      if (markerInstanceRef.current) {
        markerInstanceRef.current.map = null;
        markerInstanceRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current = null;
      }
    }
  }, [showMap, isMapsLoaded, meeting.locationCoordinates, meeting.locationName]);

  const participants = useMemo(() => // This is for regular meetings
    meeting.participantIds
      .map(id => allFriends.find(f => f.id === id))
      .filter((f): f is Friend => Boolean(f)),
    [meeting.participantIds, allFriends]
  );

  // Participants list to be used for display and in dialogs/components
  const displayParticipants = useMemo(() => {
    if (meeting.isTemporary) {
      return meeting.temporaryParticipants?.map((p, index) => ({
        id: `temp_${index}_${p.name}`, // Synthetic ID for UI key/selection
        name: p.name,
        description: '(임시)',
        groupId: meeting.groupId, // Associate with the meeting's group if any
        createdAt: new Date(), // Placeholder
      })) || [];
    }
    return participants;
  }, [meeting.isTemporary, meeting.temporaryParticipants, participants, meeting.groupId]);

  const creatorName = useMemo(() => {
    if (currentUser && meeting.creatorId === currentUser.uid && isAdmin) {
      return '관리자 (나)';
    }
    const creatorFriend = allFriends.find(f => f.id === meeting.creatorId);
    if (creatorFriend) return creatorFriend.name + (creatorFriend.description ? ` (${creatorFriend.description})` : '');
    if (currentUser && meeting.creatorId === currentUser.uid) return currentUser.displayName || currentUser.email || '알 수 없는 생성자';
    return '관리자';
  }, [meeting.creatorId, allFriends, currentUser, isAdmin]);

  const handleExpenseAdded = (newExpense: Expense) => {
    const newExpenses = [newExpense, ...expenses].sort((a,b) => (b.createdAt instanceof Date ? b.createdAt.getTime() : (b.createdAt as any).toDate().getTime()) - (a.createdAt instanceof Date ? a.createdAt.getTime() : (a.createdAt as any).toDate().getTime()));
    setExpenses(newExpenses);
    if (meeting.isSettled) {
      setMeeting(prev => ({ ...prev, isSettled: false }));
    }
  };

  const handleExpenseUpdated = (updatedExpense: Expense) => {
    const newExpenses = expenses.map(e => e.id === updatedExpense.id ? updatedExpense : e).sort((a,b) => (b.createdAt instanceof Date ? b.createdAt.getTime() : (b.createdAt as any).toDate().getTime()) - (a.createdAt instanceof Date ? a.createdAt.getTime() : (a.createdAt as any).toDate().getTime()));
    setExpenses(newExpenses);
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
    const result = await deleteMeetingAction(meeting.id, currentUser.uid);
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
    if (!currentUser?.uid) {
        toast({ title: '오류', description: '로그인이 필요합니다.', variant: 'destructive' });
        return;
    }
    if (!canFinalize) {
      toast({ title: '권한 없음 또는 조건 미충족', description: '정산 확정 권한이 없거나 조건이 충족되지 않았습니다.', variant: 'destructive'});
      return;
    }
    setIsFinalizing(true);
    const result = await finalizeMeetingSettlementAction(meeting.id, currentUser.uid);
    if (result.success && result.meeting) {
      setMeeting(result.meeting);
      toast({ title: '성공', description: result.message || '모임 정산이 확정되고 회비 사용 내역이 기록되었습니다.' });
      router.refresh();
    } else {
      toast({ title: '오류', description: result.error || '정산 확정에 실패했습니다.', variant: 'destructive' });
    }
    setIsFinalizing(false);
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
    const result = await toggleMeetingShareAction(meeting.id, currentUser.uid, shareEnabled, parseInt(selectedExpiryDays));
    if (result.success && result.meeting) {
      toast({ title: "성공", description: "공유 설정이 저장되었습니다." });
      setMeeting(result.meeting); 
      if (result.meeting.isShareEnabled && result.meeting.shareToken) {
        setCurrentShareLink(`${window.location.origin}/share/meeting/${result.meeting.shareToken}`);
      } else {
        setCurrentShareLink(null);
      }
    } else {
      toast({ title: "오류", description: result.error || "공유 설정 저장에 실패했습니다.", variant: "destructive" });
    }
    setIsShareSettingsSaving(false);
  };

  const handleCopyShareLink = () => {
    if (currentShareLink) {
      navigator.clipboard.writeText(currentShareLink)
        .then(() => toast({ title: "성공", description: "공유 링크가 클립보드에 복사되었습니다." }))
        .catch(() => toast({ title: "오류", description: "링크 복사에 실패했습니다.", variant: "destructive" }));
    }
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
                {meeting.useReserveFund && meeting.partialReserveFundAmount && meeting.partialReserveFundAmount > 0 && !isReadOnlyShare ? (
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
                ) : meeting.useReserveFund && !isReadOnlyShare ? (
                     <Badge variant="outline" className="border-yellow-500 text-yellow-600 shrink-0">
                        <Info className="h-4 w-4 mr-1.5" /> 회비 사용 예정 (금액 미설정)
                    </Badge>
                ): null}
                 {isReadOnlyShare && (
                    <Badge variant="secondary" className="shrink-0">
                        <Eye className="h-4 w-4 mr-1.5" /> 공유된 페이지 (읽기 전용)
                    </Badge>
                )}
              </div>
              <CardDescription className="text-base mt-1">
                만든이: {creatorName}
              </CardDescription>
              {/* Share Expiry Date Display Logic */}
              {(() => {
                if (!meeting || !meeting.isShareEnabled) {
                  return null;
                }

                let expiryDate: Date | null = null;
                if (meeting.shareExpiryDate) {
                  if (typeof meeting.shareExpiryDate === 'string') {
                    expiryDate = new Date(meeting.shareExpiryDate);
                  } else if ((meeting.shareExpiryDate as any)?.toDate && typeof (meeting.shareExpiryDate as any).toDate === 'function') {
                    expiryDate = (meeting.shareExpiryDate as any).toDate();
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
                  return null; // No valid expiry date to display
                }
              })()}
            </div>
            {canManageMeetingActions && !isReadOnlyUser && (
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
                <p className="text-muted-foreground">{meeting.locationName}</p>
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
                        //const coords = meeting.locationCoordinates!;
                        //const url = `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
                        const url = `https://www.google.com/maps/search/?api=1&query=${meeting.locationName}`;
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />외부 지도에서 보기
                    </Button>
                  </div>
                )}
                {/* 지도 보기 토글 시 지도 표시 */}
                {meeting.locationCoordinates && showMap && (
                  <div
                    ref={mapContainerRef}
                    className={cn(
                      'w-full mt-2 h-64 rounded-md border',
                      isMapsLoaded ? 'block' : 'hidden'
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
          {/* Participant Info Display */}
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

          {/* Fee Info Display */}
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
          ) : meeting.useReserveFund && meeting.partialReserveFundAmount && meeting.partialReserveFundAmount > 0 ? (
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
                  (회비 사용 제외: {meeting.nonReserveFundParticipants.map(id => {
                    const f = allFriends.find(f => f.id === id);
                    return f ? f.name + (f.description ? ` (${f.description})` : '') : '알 수 없음';
                  }).join(', ')})
                </p>
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

          {/* Memo Section */}
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
      </Card>

      {!isReadOnlyShare && (isAdmin || isCreator || userRole === 'user') && (
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
                          </div>
                          {meeting.shareExpiryDate && (
                            <p className="text-xs text-muted-foreground">
                              만료일: {format(meeting.shareExpiryDate instanceof Timestamp ? meeting.shareExpiryDate.toDate() : new Date(meeting.shareExpiryDate), 'yyyy년 M월 d일 HH:mm', { locale: ko })}
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
                {canManageExpenses && (
                  <AddExpenseDialog
                    meetingId={meeting.id}
                    participants={displayParticipants} // Use displayParticipants
                    onExpenseAdded={handleExpenseAdded}
                    triggerButton={
                      <Button variant="outline" size="sm" disabled={isDeleting || isFinalizing || (meeting.isSettled && !isAdmin) || isReadOnlyUser}>
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
                        allFriends={allFriends} // allFriends might be needed if paidById can be a real friend
                        participants={displayParticipants} // Use displayParticipants for consistency
                        onExpenseUpdated={handleExpenseUpdated}
                        onExpenseDeleted={handleExpenseDeleted}
                        isMeetingSettled={meeting.isSettled || false}
                        isTemporaryMeeting={meeting.isTemporary}
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
              <CardTitle>정산 요약</CardTitle>
              {meeting.isTemporary ? (
                <CardDescription>
                  임시 모임의 지출 내역 및 설정된 회비 정보를 바탕으로 요약됩니다.
                </CardDescription>
              ) : (
                <>
                  {/* Finalize button and related descriptions for regular meetings */}
                  {canManageExpenses && !meeting.isSettled && !isReadOnlyShare && ( // Ensure !isReadOnlyShare for finalize button container
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      {canFinalize && ( // canFinalize already includes !isReadOnlyShare
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            {/* meeting.isTemporary check is technically redundant here due to outer if, but kept for safety/clarity */}
                            <Button disabled={isFinalizing || isDeleting || meeting.isTemporary} size="sm">
                              {isFinalizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                              정산 확정 및 회비 사용 기록
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>정산을 확정하시겠습니까?</AlertDialogTitle>
                              <AlertDialogDescription>
                                이 작업은 되돌릴 수 없습니다. 회비 사용 내역이 기록되며, 이후에는 수정이 불가합니다.
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
                  {meeting.useReserveFund && meeting.isSettled && expenses.length > 0 && !isReadOnlyShare && (
                    <CardDescription className="text-green-600 flex items-center gap-1 mt-2">
                        <CheckCircle2 className="h-4 w-4"/> 이 모임의 회비 사용 정산이 확정되어 회비 내역에 기록되었습니다.
                    </CardDescription>
                  )}
                  {meeting.useReserveFund && !meeting.isSettled && expenses.length === 0 && typeof meeting.partialReserveFundAmount === 'number' && meeting.partialReserveFundAmount > 0 && !isReadOnlyShare &&(
                    <CardDescription className="text-muted-foreground flex items-center gap-1 mt-2">
                        <AlertCircle className="h-4 w-4"/> 지출 내역이 없어 회비 사용을 확정할 수 없습니다.
                    </CardDescription>
                  )}
                  {/* Display if meeting is settled without reserve fund usage (for regular meetings) */}
                  {!meeting.useReserveFund && meeting.isSettled && !isReadOnlyShare && (
                     <CardDescription className="text-green-600 flex items-center gap-1 mt-2">
                        <CheckCircle2 className="h-4 w-4"/> 이 모임의 정산이 완료되었습니다 (회비 미사용).
                    </CardDescription>
                  )}
                </>
              )}
            </CardHeader>
            <PaymentSummary
              meeting={meeting}
              expenses={expenses}
              participants={displayParticipants}
              allFriends={allFriends}
            />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
