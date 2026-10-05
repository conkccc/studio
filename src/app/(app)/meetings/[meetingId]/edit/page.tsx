'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useAppData } from '@/hooks/use-app-data';
import { CreateMeetingForm } from '@/features/meetings/CreateMeetingForm';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export default function EditMeetingPage() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const { appUser, loading: authLoading } = useAuth();
  const edit = useAppData('meeting-edit', { id: meetingId }, !!meetingId);
  const data = edit.data?.success ? edit.data : undefined;
  const [chosenGroup, setChosenGroup] = useState<string | null | undefined>(undefined);
  const groupId = chosenGroup === undefined ? data?.meeting.groupId : chosenGroup;
  const changedGroup = !!groupId && groupId !== data?.meeting.groupId;
  const friends = useAppData('friends', { id: groupId || undefined }, changedGroup);

  if (authLoading || edit.isLoading) return <div role="status" className="flex min-h-48 items-center justify-center"><Loader2 className="mr-2 h-6 w-6 animate-spin" />모임 정보를 불러오고 있습니다.</div>;
  if (!data || !appUser) return <div role="alert" className="space-y-3 py-10 text-center"><p>{edit.error?.message || '모임을 찾을 수 없거나 수정 권한이 없습니다.'}</p><Button variant="outline" onClick={() => void edit.refetch()}>다시 시도</Button><Button asChild variant="ghost"><Link href="/meetings">모임 목록</Link></Button></div>;
  return <div className="mx-auto max-w-2xl"><Card>
    <CardHeader><CardTitle className="text-2xl">모임 수정</CardTitle><CardDescription>모임의 세부 정보를 수정하세요. {data.meeting.isSettled && <span className="font-bold text-destructive">정산을 다시 열어야 수정할 수 있습니다.</span>}</CardDescription></CardHeader>
    <CardContent>
      {friends.error && <p role="alert" className="mb-3 text-destructive">{friends.error.message}</p>}
      <CreateMeetingForm key={meetingId} currentUserId={appUser.id} isEditMode initialData={data.meeting}
        friends={changedGroup ? friends.data?.friends || [] : data.friends || []} expenses={data.expenses}
        isLoadingFriends={changedGroup && friends.isLoading} groups={data.groups}
        selectedGroupId={groupId} onGroupChange={setChosenGroup} />
    </CardContent>
  </Card></div>;
}
