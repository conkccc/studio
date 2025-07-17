import { Metadata } from 'next';
import { CreateMeetingPrepForm } from '@/components/meeting-prep/CreateMeetingPrepForm';

export const metadata: Metadata = {
  title: '새 모임 준비 생성',
  description: '새로운 모임 준비를 생성하여 참석 가능 날짜를 조율합니다.',
};

export default function NewMeetingPrepPage() {
  return (
    <div className="flex flex-col space-y-6">
      <h1 className="text-3xl font-bold">새 모임 준비 생성</h1>
      <CreateMeetingPrepForm />
    </div>
  );
}
