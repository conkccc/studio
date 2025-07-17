import { Metadata } from 'next';
import { MeetingPrepDetailsClient } from '@/components/meeting-prep/MeetingPrepDetailsClient';

type MeetingPrepDetailsPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: MeetingPrepDetailsPageProps): Promise<Metadata> {
  const { id } = await params;

  return {
    title: `모임 준비 상세 - ${id}`,
    description: `모임 준비 ID ${id}의 상세 정보를 확인하고 참석 가능 여부를 제출합니다.`,
  };
}

export default async function MeetingPrepDetailsPage({ params }: MeetingPrepDetailsPageProps) {
  const { id } = await params;

  return (
    <div className="flex flex-col space-y-6">
      <h1 className="text-3xl font-bold">모임 준비 상세</h1>
      <MeetingPrepDetailsClient meetingPrepId={id} />
    </div>
  );
}
