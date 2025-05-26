import { getMeetingById, getFriends } from '@/lib/data-store';
import { notFound } from 'next/navigation';
import { CreateMeetingForm } from '@/components/meetings/CreateMeetingForm';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface EditMeetingPageProps {
  params: {
    meetingId: string;
  };
}

export default async function EditMeetingPage({ params }: EditMeetingPageProps) {
  const meeting = await getMeetingById(params.meetingId);
  const friends = await getFriends();

  // For simplicity, assume current user is the first friend or a mock ID.
  // In a real app, this would come from auth.
  const currentUserId = friends.length > 0 ? friends[0].id : 'mock-user-id';

  if (!meeting) {
    notFound(); // Use Next.js notFound for 404
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">모임 수정</CardTitle>
          <CardDescription>모임의 세부 정보를 수정하세요.</CardDescription>
        </CardHeader>
        <CardContent>
           {/* Assuming MeetingForm is a unified component for create/edit */}
           <CreateMeetingForm
            initialData={meeting}
            friends={friends}
            currentUserId={currentUserId}
            isEditMode={true} // <-- isEditMode prop 추가
          />
        </CardContent>
      </Card>
    </div>
  );
}