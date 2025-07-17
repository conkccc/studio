import { Metadata } from 'next';
import { EditMeetingPrepForm } from '@/components/meeting-prep/EditMeetingPrepForm';
import { getMeetingPrepByIdAction } from '@/lib/actions';

type EditMeetingPrepPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: EditMeetingPrepPageProps): Promise<Metadata> {
  const { id } = await params;
  const meetingPrepResult = await getMeetingPrepByIdAction(id);
  const title = meetingPrepResult.success && meetingPrepResult.meetingPrep ? `모임 준비 수정 - ${meetingPrepResult.meetingPrep.title}` : '모임 준비 수정';
  return {
    title: title,
    description: `모임 준비 ID ${id}의 정보를 수정합니다.`,
  };
}

export default async function EditMeetingPrepPage({ params }: EditMeetingPrepPageProps) {
  const { id } = await params;
  const meetingPrepResult = await getMeetingPrepByIdAction(id);

  if (!meetingPrepResult.success || !meetingPrepResult.meetingPrep) {
    return (
      <div className="flex flex-col space-y-6">
        <h1 className="text-3xl font-bold">모임 준비 수정</h1>
        <p className="text-red-500">{meetingPrepResult.error || '모임 준비 정보를 불러오는데 실패했습니다.'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-6">
      <h1 className="text-3xl font-bold">모임 준비 수정</h1>
      <EditMeetingPrepForm initialData={meetingPrepResult.meetingPrep} />
    </div>
  );
}
