import type { Expense, Friend, Meeting } from './types';

export function isUnresolvedParticipantName(name: string | undefined | null): boolean {
  return !name?.trim() || ['이전 참여자', '알 수 없음', '기록된 참여자', '이름 확인 필요'].includes(name.trim())
    || /^(기록된 참여자|이름 확인 필요) \(.+\)$/.test(name.trim());
}

export const missingParticipantName = (id: string) => `이름 확인 필요 (${id.slice(0, 6)})`;

export function meetingReferenceIds(meeting: Meeting, expenses: Expense[] = []): string[] {
  return Array.from(new Set([
    ...(meeting.participantIds || []), ...(meeting.reserveFundRefundRecipientIds || []),
    ...(meeting.participantSnapshot || []).map(person => person.id),
    ...(meeting.settlementSnapshot?.participants || []).map(person => person.friendId),
    ...expenses.flatMap(expense => [expense.paidById, ...(expense.splitAmongIds || []), ...(expense.customSplits || []).map(split => split.friendId)]),
  ].filter(id => typeof id === 'string' && !!id)));
}

/** Preserve recorded names and only repair absent or previously generated fallback labels. */
export function recordedParticipantName(meeting: Meeting, id: string, current?: Pick<Friend, 'name'>): string {
  const candidates = [
    meeting.participantSnapshot?.find(person => person.id === id)?.name,
    meeting.settlementSnapshot?.participants.find(person => person.friendId === id)?.name,
    Object.prototype.hasOwnProperty.call(meeting.participantNames || {}, id) ? meeting.participantNames?.[id] : undefined,
    Object.prototype.hasOwnProperty.call(meeting.settlementSnapshot?.namesById || {}, id) ? meeting.settlementSnapshot?.namesById[id] : undefined,
    current?.name,
  ];
  return candidates.find(name => !isUnresolvedParticipantName(name)) || missingParticipantName(id);
}

/** Dangling roster IDs do not become new participants; historical expense references remain separate. */
export function meetingForDisplay(meeting: Meeting, friends: Pick<Friend, 'id' | 'name'>[]): Meeting {
  if (meeting.isTemporary) return meeting;
  const directory = new Map(friends.map(friend => [friend.id, friend]));
  const names = Object.fromEntries(meetingReferenceIds(meeting).map(id => [id, recordedParticipantName(meeting, id, directory.get(id))]));
  return { ...meeting, participantNames: { ...meeting.participantNames, ...names },
    participantIds: (meeting.participantIds || []).filter(id => !isUnresolvedParticipantName(names[id])) };
}
