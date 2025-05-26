import { getFriends } from '@/lib/data-store';
import { CreateMeetingForm } from '@/components/meetings/CreateMeetingForm';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default async function NewMeetingPage() {
  const friends = await getFriends();
  // For simplicity, assume current user is the first friend or a mock ID.
  // In a real app, this would come from auth.
  const currentUserId = friends.length > 0 ? friends[0].id : 'mock-user-id'; 

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">새 모임 만들기</CardTitle>
          <CardDescription>모임의 세부 정보를 입력하고 친구들을 초대하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateMeetingForm friends={friends} currentUserId={currentUserId} />
        </CardContent>
      </Card>
    </div>
  );
}
