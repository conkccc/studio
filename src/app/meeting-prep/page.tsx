import { Metadata } from 'next';
import { MeetingPrepListClient } from '@/components/meeting-prep/MeetingPrepListClient';

export const metadata: Metadata = {
  title: '모임 준비',
  description: '모임 참석 가능 날짜를 조율하는 모임 준비 목록을 확인하고 관리합니다.',
};

export default function MeetingPrepPage() {
  return (
    <div className="flex flex-col space-y-6">
      <h1 className="text-3xl font-bold">모임 준비</h1>
      <MeetingPrepListClient />
    </div>
  );
}
