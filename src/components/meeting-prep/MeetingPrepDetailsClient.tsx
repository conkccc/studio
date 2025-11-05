'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  getMeetingPrepByIdAction,
  getFriendsByGroupAction,
  submitParticipantAvailabilityAction,
  getAllParticipantAvailabilitiesAction,
  toggleMeetingPrepShareAction,
  deleteMeetingPrepAction,
  getAllFriendsAction,
} from '@/lib/actions';
import type { MeetingPrep, Friend, ParticipantAvailability } from '@/lib/types';
import { format, getDaysInMonth, startOfMonth, addMonths, isSameDay, parseISO, isBefore, isAfter } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Share2, Trash2, Copy } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { MeetingPrepSummaryCalendar } from './MeetingPrepSummaryCalendar';
import { cn } from '@/lib/utils';

interface MeetingPrepDetailsClientProps {
  meetingPrepId: string;
  shareToken?: string; // Optional: for public share page
}

export function MeetingPrepDetailsClient({ meetingPrepId, shareToken }: MeetingPrepDetailsClientProps) {
  const { currentUser, appUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [meetingPrep, setMeetingPrep] = useState<MeetingPrep | null>(null);
  const [friendsInGroups, setFriendsInGroups] = useState<Friend[]>([]);
  const [allAvailabilities, setAllAvailabilities] = useState<ParticipantAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedFriendId, setSelectedFriendId] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [currentAvailability, setCurrentAvailability] = useState<Set<string>>(new Set()); // Dates available for selected friend

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Date | null>(null);
  const [dragEnd, setDragEnd] = useState<Date | null>(null);
  const initialDragSelectionState = React.useRef<boolean | null>(null);

  const isCreator = useMemo(() => meetingPrep?.creatorId === currentUser?.uid, [meetingPrep, currentUser]);
  const isAdmin = useMemo(() => appUser?.role === 'admin', [appUser]);
  const isOwnerOrAdmin = useMemo(() => isCreator || isAdmin, [isCreator, isAdmin]);
  const isPublicShare = useMemo(() => !!shareToken, [shareToken]);

  const fetchMeetingPrepData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const prepResult = await getMeetingPrepByIdAction(meetingPrepId, currentUser?.uid);
      if (!prepResult.success || !prepResult.meetingPrep) {
        setError(prepResult.error || '모임 준비 정보를 불러오는데 실패했습니다.');
        setLoading(false);
        return;
      }
      setMeetingPrep(prepResult.meetingPrep || null);

      // participantFriends are now populated by getMeetingPrepByIdAction
      if (prepResult.meetingPrep?.participantFriends) {
        setFriendsInGroups(prepResult.meetingPrep.participantFriends);
      } else {
        setFriendsInGroups([]);
      }

      // Fetch all participant availabilities
      const availResult = await getAllParticipantAvailabilitiesAction(meetingPrepId, currentUser?.uid);
      if (availResult.success && availResult.availabilities) {
        setAllAvailabilities(availResult.availabilities);
      }

    } catch (err) {
      console.error('Failed to fetch meeting prep data:', err);
      setError('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [meetingPrepId, currentUser]);

  useEffect(() => {
    if (!authLoading && (currentUser || isPublicShare)) {
      fetchMeetingPrepData();
    }
  }, [authLoading, currentUser, isPublicShare, fetchMeetingPrepData]);

  // Update currentAvailability when selectedFriendId or allAvailabilities changes
  useEffect(() => {
    if (selectedFriendId) {
      const friendAvailability = allAvailabilities.find(avail => avail.selectedFriendId === selectedFriendId);
      if (friendAvailability) {
        setCurrentAvailability(new Set(friendAvailability.availableDates));
        setPassword(friendAvailability.password || ''); // Load saved password if exists
      } else {
        setCurrentAvailability(new Set());
        setPassword('');
      }
    }
  }, [selectedFriendId, allAvailabilities]);

  const handleDateToggle = (date: Date) => {
    const dateString = format(date, 'yyyy-MM-dd');
    setCurrentAvailability(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dateString)) {
        newSet.delete(dateString);
      } else {
        newSet.add(dateString);
      }
      return newSet;
    });
  };

  const handleSelectDateRange = useCallback((start: Date, end: Date, select: boolean) => {
    setCurrentAvailability(prev => {
      const newSet = new Set(prev);
      const dates = [start, end].sort((a, b) => a.getTime() - b.getTime());
      let currentDate = dates[0];

      while (currentDate <= dates[1]) {
        const dateString = format(currentDate, 'yyyy-MM-dd');
        const isPastDate = isBefore(currentDate, new Date()) && !isSameDay(currentDate, new Date());

        if (!isPastDate) {
          if (select) {
            newSet.add(dateString);
          } else {
            newSet.delete(dateString);
          }
        }
        currentDate = new Date(currentDate.setDate(currentDate.getDate() + 1));
      }
      return newSet;
    });
  }, []);

  const handleMouseDown = useCallback((date: Date) => {
    if (!selectedFriendId || isSubmitting || (isBefore(date, new Date()) && !isSameDay(date, new Date()))) return;
    setIsDragging(true);
    setDragStart(date);
    setDragEnd(date);
    initialDragSelectionState.current = currentAvailability.has(format(date, 'yyyy-MM-dd'));
    handleDateToggle(date); // Toggle the initial date immediately
  }, [selectedFriendId, isSubmitting, currentAvailability, handleDateToggle]);

  const handleMouseEnter = useCallback((date: Date) => {
    if (!isDragging || !dragStart) return;
    setDragEnd(date);

    const datesToModify: Date[] = [];
    const sortedDates = [dragStart, date].sort((a, b) => a.getTime() - b.getTime());
    let currentDate = sortedDates[0];

    while (currentDate <= sortedDates[1]) {
      datesToModify.push(new Date(currentDate)); // Push a new Date object to avoid reference issues
      currentDate.setDate(currentDate.getDate() + 1);
    }

    setCurrentAvailability(prev => {
      const newSet = new Set(prev);
      datesToModify.forEach(d => {
        const dateString = format(d, 'yyyy-MM-dd');
        const isPastDate = isBefore(d, new Date()) && !isSameDay(d, new Date());
        if (!isPastDate) {
          if (initialDragSelectionState.current === false) { // If drag started on an unselected date, select all
            newSet.add(dateString);
          } else { // If drag started on a selected date, deselect all
            newSet.delete(dateString);
          }
        }
      });
      return newSet;
    });
  }, [isDragging, dragStart, initialDragSelectionState]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    initialDragSelectionState.current = null;
  }, []);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp();
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, handleMouseUp]);

  const handleSelectAll = (available: boolean) => {
    if (!meetingPrep) return;
    const newSet = new Set<string>();
    meetingPrep.selectedMonths.forEach(monthStr => {
      const [year, month] = monthStr.split('-').map(Number);
      const daysInMonth = getDaysInMonth(new Date(year, month - 1));
      for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(year, month - 1, i);
        // Only add dates from today onwards
        if (isBefore(date, new Date()) && !isSameDay(date, new Date())) continue;
        if (available) {
          newSet.add(format(date, 'yyyy-MM-dd'));
        }
      }
    });
    setCurrentAvailability(newSet);
  };

  const handleSubmitAvailability = async () => {
    if (!selectedFriendId) {
      toast({ title: "친구 선택 필요", description: "날짜를 제출할 친구를 선택해주세요.", variant: "destructive" });
      return;
    }
    if (!password) {
      toast({ title: "비밀번호 입력 필요", description: "수정을 위해 비밀번호를 입력해주세요.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const availableDates = Array.from(currentAvailability);
      const allDatesInPrep: string[] = [];
      meetingPrep?.selectedMonths.forEach(monthStr => {
        const [year, month] = monthStr.split('-').map(Number);
        const daysInMonth = getDaysInMonth(new Date(year, month - 1));
        for (let i = 1; i <= daysInMonth; i++) {
          const date = new Date(year, month - 1, i);
          // Only consider dates from today onwards for submission
          if (isBefore(date, new Date()) && !isSameDay(date, new Date())) continue;
          allDatesInPrep.push(format(date, 'yyyy-MM-dd'));
        }
      });
      const unavailableDates = allDatesInPrep.filter(date => !currentAvailability.has(date));

      const result = await submitParticipantAvailabilityAction({
        meetingPrepId,
        selectedFriendId,
        password: password,
        availableDates,
        unavailableDates,
      }, currentUser?.uid);

      if (result.success) {
        toast({ title: "제출 완료", description: "참석 가능 날짜가 성공적으로 저장되었습니다." });
        const availResult = await getAllParticipantAvailabilitiesAction(meetingPrepId, currentUser?.uid);
        if (availResult.success && availResult.availabilities) {
          setAllAvailabilities(availResult.availabilities);
        }
      } else {
        toast({ title: "제출 실패", description: result.error || "날짜 제출 중 오류가 발생했습니다.", variant: "destructive" });
      }
    } catch (err) {
      console.error('Submit availability error:', err);
      toast({ title: "오류", description: "날짜 제출 중 알 수 없는 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleShare = async (enable: boolean) => {
    if (!meetingPrep) return;
    const result = await toggleMeetingPrepShareAction(meetingPrep.id, currentUser!.uid, enable);
    if (result.success) {
      setMeetingPrep(result.meetingPrep || null);
      toast({ title: "공유 설정 변경", description: `모임 준비 공유가 ${enable ? '활성화' : '비활성화'}되었습니다.` });
    } else {
      toast({ title: "공유 설정 실패", description: result.error || "공유 설정 변경 중 오류가 발생했습니다.", variant: "destructive" });
    }
  };

  const handleDeleteMeetingPrep = async () => {
    if (!meetingPrep) return;
    const result = await deleteMeetingPrepAction(meetingPrep.id, currentUser!.uid);
    if (result.success) {
      toast({ title: "모임 준비 삭제", description: "모임 준비가 성공적으로 삭제되었습니다." });
      router.push('/meeting-prep');
    } else {
      toast({ title: "삭제 실패", description: result.error || "모임 준비 삭제 중 오류가 발생했습니다.", variant: "destructive" });
    }
  };

  const copyShareLink = () => {
    if (meetingPrep?.shareToken) {
      const link = `${window.location.origin}/share/meeting-prep/${meetingPrep.shareToken}`;
      navigator.clipboard.writeText(link);
      toast({ title: "링크 복사 완료", description: "공유 링크가 클립보드에 복사되었습니다." });
    } else {
      toast({ title: "링크 없음", description: "공유 링크가 생성되지 않았습니다.", variant: "destructive" });
    }
  };

  const renderCalendar = () => {
    if (!meetingPrep) return null;

    const monthsToDisplay = meetingPrep.selectedMonths.map(monthStr => {
      const [year, month] = monthStr.split('-').map(Number);
      return startOfMonth(new Date(year, month - 1));
    }).sort((a, b) => a.getTime() - b.getTime());

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" onMouseLeave={handleMouseUp}>
        {monthsToDisplay.map((monthStart, monthIndex) => {
          const daysInMonth = getDaysInMonth(monthStart);
          const firstDayOfMonth = monthStart.getDay(); // 0 = Sunday, 1 = Monday, etc.
          const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

          return (
            <Card key={monthIndex}>
              <CardHeader>
                <CardTitle className="text-center">{format(monthStart, 'yyyy년 MM월', { locale: ko })}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-1 text-center text-sm font-medium mb-2">
                  <div className="text-red-500">일</div>
                  <div>월</div>
                  <div>화</div>
                  <div>수</div>
                  <div>목</div>
                  <div>금</div>
                  <div className="text-blue-500">토</div>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: firstDayOfMonth }, (_, i) => (
                    <div key={`empty-${i}`} className="h-8 w-8"></div>
                  ))}
                  {days.map(day => {
                    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
                    const dateString = format(date, 'yyyy-MM-dd');
                    const isSelected = currentAvailability.has(dateString);
                    const isPastDate = isBefore(date, new Date()) && !isSameDay(date, new Date());

                    return (
                      <Button
                        key={dateString}
                        variant={isSelected ? 'default' : 'outline'}
                        size="icon"
                        className={cn(
                          "h-8 w-8 rounded-full text-xs",
                          isSelected ? "bg-green-500 hover:bg-green-600 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-800",
                          isPastDate && "opacity-50 cursor-not-allowed",
                          date.getDay() === 0 && "text-red-500", // Sunday
                          date.getDay() === 6 && "text-blue-500" // Saturday
                        )}
                        onMouseDown={() => handleMouseDown(date)}
                        onMouseEnter={() => handleMouseEnter(date)}
                        onMouseUp={handleMouseUp}
                        disabled={!selectedFriendId || isSubmitting || isPastDate}
                      >
                        {day}
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  const renderSummary = () => {
    if (!meetingPrep || allAvailabilities.length === 0) return null;

    const allDatesInPrep: Date[] = [];
    meetingPrep.selectedMonths.forEach(monthStr => {
      const [year, month] = monthStr.split('-').map(Number);
      const daysInMonth = getDaysInMonth(new Date(year, month - 1));
      for (let i = 1; i <= daysInMonth; i++) {
        allDatesInPrep.push(new Date(year, month - 1, i));
      }
    });
    allDatesInPrep.sort((a, b) => a.getTime() - b.getTime());

    const friendNames = friendsInGroups.reduce((acc, friend) => {
      acc[friend.id] = friend.name;
      return acc;
    }, {} as Record<string, string>);

    const dateSummary: Record<string, {
      availableCount: number;
      availableFriends: string[];
      unavailableFriends: string[];
    }> = {};

    allDatesInPrep.forEach(date => {
      const dateString = format(date, 'yyyy-MM-dd');
      dateSummary[dateString] = {
        availableCount: 0,
        availableFriends: [],
        unavailableFriends: [],
      };
    });

    allAvailabilities.forEach(avail => {
      const friendName = friendNames[avail.selectedFriendId] || `알 수 없는 친구 (${avail.selectedFriendId})`;
      (avail.availableDates || []).forEach(dateString => {
        if (dateSummary[dateString]) {
          dateSummary[dateString].availableCount++;
          dateSummary[dateString].availableFriends.push(friendName);
        }
      });
      (avail.unavailableDates || []).forEach(dateString => {
        if (dateSummary[dateString]) {
          dateSummary[dateString].unavailableFriends.push(friendName);
        }
        });
    });

    const totalParticipantsCount = friendsInGroups.length;

    const respondedFriendIds = new Set(allAvailabilities.map(a => a.selectedFriendId));
    const respondedFriends = friendsInGroups.filter(f => respondedFriendIds.has(f.id));
    const unrespondedFriends = friendsInGroups.filter(f => !respondedFriendIds.has(f.id));

    return (
      <>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>응답 현황</CardTitle>
            <CardDescription>
              총 {totalParticipantsCount}명 중 {respondedFriends.length}명 응답 완료
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-2">
              <span className="font-medium">응답 완료 ({respondedFriends.length}명):</span>
              {respondedFriends.length > 0 ? respondedFriends.map(f => f.name).join(', ') : '없음'}
            </p>
            <p className="text-sm">
              <span className="font-medium">미응답 ({unrespondedFriends.length}명):</span>
              {unrespondedFriends.length > 0 ? unrespondedFriends.map(f => f.name).join(', ') : '없음'}
            </p>
          </CardContent>
        </Card>
        <MeetingPrepSummaryCalendar
          selectedMonths={meetingPrep.selectedMonths}
          dateSummary={dateSummary}
          totalParticipants={totalParticipantsCount}
        />
      </>
    );
  };

  const formatSelectedMonths = (months: string[]) => {
    if (!months || months.length === 0) return '없음';

    const groupedByYear: { [year: string]: string[] } = {};
    months.forEach(monthStr => {
      const [year, month] = monthStr.split('-');
      if (!groupedByYear[year]) {
        groupedByYear[year] = [];
      }
      groupedByYear[year].push(month);
    });

    return Object.entries(groupedByYear).map(([year, monthNumbers]) => {
      const formattedMonths = monthNumbers.map(m => `${parseInt(m, 10)}월`).join(', ');
      return `${year}년 - ${formattedMonths}`;
    }).join('; ');
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-24" />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500">오류: {error}</div>;
  }

  if (!meetingPrep) {
    return <div className="text-muted-foreground">모임 준비 정보를 찾을 수 없습니다.</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{meetingPrep.title}</CardTitle>
          <CardDescription>{meetingPrep.memo}</CardDescription>
          <p className="text-sm text-muted-foreground">
            생성일: {format(meetingPrep.createdAt, 'yyyy년 MM월 dd일', { locale: ko })}
          </p>
          <p className="text-sm text-muted-foreground">
            참여자: {meetingPrep.participantFriends && meetingPrep.participantFriends.length > 0 
              ? `${meetingPrep.participantFriends.length}명 (${meetingPrep.participantFriends.map(f => f.name).join(', ')})` 
              : '없음'}
          </p>
          <p className="text-sm text-muted-foreground">
            선택 월: {formatSelectedMonths(meetingPrep.selectedMonths)}
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {isOwnerOrAdmin && (
            <Button variant="outline" onClick={() => router.push(`/meeting-prep/${meetingPrep.id}/edit`)}>
              수정
            </Button>
          )}
          {isOwnerOrAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive"><Trash2 className="mr-2 h-4 w-4" /> 삭제</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>모임 준비 삭제</AlertDialogTitle>
                  <AlertDialogDescription>
                    정말로 이 모임 준비를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteMeetingPrep}>삭제</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>공유 링크 정보</CardTitle>
          <CardDescription>
            이 링크를 통해 계정이 없는 친구들도 참석 가능 날짜를 입력할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="enable-share"
              checked={!!meetingPrep.shareToken}
              onCheckedChange={(checked) => handleToggleShare(checked as boolean)}
              disabled={!isOwnerOrAdmin}
            />
            <Label htmlFor="enable-share" className={cn(!isOwnerOrAdmin && "text-muted-foreground")}>공유 링크 활성화</Label>
          </div>
          {meetingPrep.shareToken && (
            <div className="flex w-full max-w-sm items-center space-x-2">
              <Input
                type="text"
                readOnly
                value={`${window.location.origin}/share/meeting-prep/${meetingPrep.shareToken}`}
              />
              <Button type="button" size="sm" onClick={copyShareLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
          {meetingPrep.shareToken && meetingPrep.shareExpiryDate && (
            <p className="text-sm text-muted-foreground">
              링크 만료일: {format(meetingPrep.shareExpiryDate, 'yyyy년 MM월 dd일 HH:mm', { locale: ko })}
            </p>
          )}
          {!meetingPrep.shareToken && (
            <p className="text-sm text-muted-foreground">공유 링크가 비활성화되어 있습니다.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>참석 가능 날짜 입력</CardTitle>
          <CardDescription>
            본인의 이름을 선택하고 참석 가능한 날짜를 표시해주세요. 수정 시 사용할 비밀번호를 입력해주세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="friend-select">본인 이름 선택</Label>
              <Select onValueChange={setSelectedFriendId} value={selectedFriendId} disabled={isSubmitting}>
                <SelectTrigger id="friend-select">
                  <SelectValue placeholder="친구 선택" />
                </SelectTrigger>
                <SelectContent>
                  {friendsInGroups.map(friend => (
                    <SelectItem key={friend.id} value={friend.id}>
                      {friend.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedFriendId && (
              <div>
                <Label htmlFor="password">수정용 비밀번호 (숫자)</Label>
                <Input
                  id="password"
                  type="number"
                  placeholder="비밀번호 (숫자)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={() => handleSelectAll(true)} variant="outline" disabled={!selectedFriendId || isSubmitting}>모두 가능</Button>
            <Button onClick={() => handleSelectAll(false)} variant="outline" disabled={!selectedFriendId || isSubmitting}>모두 불가능</Button>
          </div>

          {renderCalendar()}

          <Button onClick={handleSubmitAvailability} disabled={!selectedFriendId || isSubmitting}>
            {isSubmitting ? '저장 중...' : '내 날짜 저장'}
          </Button>
        </CardContent>
      </Card>

      {renderSummary()}
    </div>
  );
}
