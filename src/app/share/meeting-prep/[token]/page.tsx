import { Metadata } from 'next';
import { MeetingPrepDetailsClient } from '@/components/meeting-prep/MeetingPrepDetailsClient';
import { dbGetMeetingPrepByShareToken } from '@/lib/data-store';

type ShareMeetingPrepPageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({ params }: ShareMeetingPrepPageProps): Promise<Metadata> {
  const { token } = await params;
  const meetingPrep = await dbGetMeetingPrepByShareToken(token);
  const title = meetingPrep ? `모임 준비: ${meetingPrep.title}` : '모임 준비';
  const description = meetingPrep ? meetingPrep.memo : '모임 참석 가능 날짜를 조율합니다.';

  return {
    title: title,
    description: description,
  };
}

export default async function ShareMeetingPrepPage({ params }: ShareMeetingPrepPageProps) {
  const { token } = await params;
  const meetingPrep = await dbGetMeetingPrepByShareToken(token);

  if (!meetingPrep) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-6rem)] p-4">
        <h1 className="text-3xl font-bold text-red-500">유효하지 않거나 만료된 공유 링크입니다.</h1>
        <p className="text-muted-foreground mt-2">링크를 다시 확인하거나 모임 생성자에게 문의해주세요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-6 p-4">
      <h1 className="text-3xl font-bold">모임 준비: {meetingPrep.title}</h1>
      <MeetingPrepDetailsClient meetingPrepId={meetingPrep.id} shareToken={token} />
    </div>
  );
}
