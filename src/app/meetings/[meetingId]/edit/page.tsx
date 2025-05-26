
import { getMeetingById, getFriends } from '@/lib/data-store';
import { notFound } from 'next/navigation';
import { CreateMeetingForm } from '@/components/meetings/CreateMeetingForm';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

interface EditMeetingPageProps {
  params: {
    meetingId: string;
  };
}

export default async function EditMeetingPage({ params }: EditMeetingPageProps) {
  const { meetingId } = params; // Explicitly destructure meetingId

  // meetingId가 유효한 문자열인지 기본적인 확인을 합니다.
  // Next.js 라우팅은 보통 이 부분을 보장하지만, 추가적인 방어 코드입니다.
  if (typeof meetingId !== 'string' || !meetingId.trim()) {
    notFound();
  }

  const meeting = await getMeetingById(meetingId);
  const friends = await getFriends();

  // For simplicity, assume current user is the first friend or a mock ID.
  // In a real app, this would come from auth.
  const currentUserId = friends.length > 0 ? friends[0].id : 'mock-user-id';

  if (!meeting) {
    // 이 부분이 404 에러의 가장 일반적인 원인입니다:
    // 제공된 meetingId로 데이터 저장소에서 모임을 찾을 수 없습니다.
    notFound();
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">모임 수정</CardTitle>
          <CardDescription>모임의 세부 정보를 수정하세요.</CardDescription>
        </CardHeader>
        <CardContent>
           <CreateMeetingForm
            initialData={meeting}
            friends={friends}
            currentUserId={currentUserId}
            isEditMode={true}
          />
        </CardContent>
      </Card>
    </div>
  );
}
