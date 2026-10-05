'use client';

import { useState } from 'react';
import { useAppData } from '@/hooks/use-app-data';
import { CreateMeetingForm } from '@/features/meetings/CreateMeetingForm';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NewMeetingPage() {
  const { currentUser, appUser, isAdmin, userRole, loading: authLoading } = useAuth();

  const [selectedMeetingGroupId, setSelectedMeetingGroupId] = useState<string | null>(null);
  const groups = useAppData('groups');
  const friends = useAppData('friends', { id: selectedMeetingGroupId || undefined }, !!selectedMeetingGroupId);
  const allOwnedGroups = groups.data?.groups || [];
  const friendsForParticipantSelect = friends.data?.friends || [];
  const isLoadingInitialData = groups.isLoading;
  const isLoadingParticipants = friends.isLoading;

  if (authLoading || isLoadingInitialData) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-150px)]">
        <p className="text-xl text-muted-foreground">페이지 로딩 중...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">로그인이 필요합니다</h1>
        <p className="text-muted-foreground">새 모임을 만들려면 로그인이 필요합니다.</p>
         <Button asChild className="mt-4">
          <Link href="/login">로그인 페이지로 이동</Link>
        </Button>
      </div>
    );
  }

  if (!(isAdmin || userRole === 'user')) {
    return (
      <div className="container mx-auto py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">접근 권한 없음</h1>
        <p className="text-muted-foreground">새 모임 만들기는 관리자 또는 사용자만 가능합니다.</p>
         <Button asChild className="mt-4">
          <Link href="/">대시보드로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const currentUserId = appUser!.id;

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">새 모임 만들기</CardTitle>
          <CardDescription>모임의 세부 정보를 입력하고 친구들을 초대하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          {(groups.error || friends.error) && <p role="alert" className="mb-3 text-destructive">{groups.error?.message || friends.error?.message}</p>}
          <CreateMeetingForm
            currentUserId={currentUserId}
            groups={allOwnedGroups}
            selectedGroupId={selectedMeetingGroupId}
            onGroupChange={setSelectedMeetingGroupId}
            friends={friendsForParticipantSelect}
            isLoadingFriends={isLoadingParticipants}
            isEditMode={false}
          />
        </CardContent>
      </Card>
    </div>
  );
}
