import 'server-only';
import type { MeetingPrep, ParticipantAvailability } from '../types';
import { database, documentData, collectionData, cleanWrite, chunks } from './shared';

export const MEETING_PREPS_COLLECTION = 'meetingPreps';
export const PARTICIPANT_AVAILABILITIES_SUBCOLLECTION = 'participantAvailabilities';

export async function dbAddMeetingPrep(data: Omit<MeetingPrep, 'id' | 'createdAt' | 'isDeleted'>): Promise<MeetingPrep> {
  const value = { ...data, createdAt: new Date(), isDeleted: false };
  const ref = await database().collection(MEETING_PREPS_COLLECTION).add(cleanWrite(value));
  return { ...value, id: ref.id };
}

export async function dbGetMeetingPrepById(id: string): Promise<MeetingPrep | undefined> {
  if (!id) return undefined;
  const prep = documentData<MeetingPrep>(await database().collection(MEETING_PREPS_COLLECTION).doc(id).get());
  return prep?.isDeleted ? undefined : prep;
}

export async function dbGetMeetingPrepsByUser(userId: string, groupIds: string[]): Promise<MeetingPrep[]> {
  const collection = database().collection(MEETING_PREPS_COLLECTION);
  const snapshots = await Promise.all([
    collection.where('creatorId', '==', userId).get(),
    ...chunks(Array.from(new Set(groupIds))).map(chunk => collection.where('friendGroupId', 'in', chunk).get()),
  ]);
  return Array.from(new Map(snapshots.flatMap(snapshot => collectionData<MeetingPrep>(snapshot)).map(prep => [prep.id, prep])).values())
    .filter(prep => !prep.isDeleted).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function dbGetAllMeetingPreps(): Promise<MeetingPrep[]> {
  return collectionData<MeetingPrep>(await database().collection(MEETING_PREPS_COLLECTION).get())
    .filter(prep => !prep.isDeleted).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function dbUpdateMeetingPrep(id: string, updates: Partial<Omit<MeetingPrep, 'id' | 'createdAt'>>): Promise<MeetingPrep | null> {
  const ref = database().collection(MEETING_PREPS_COLLECTION).doc(id);
  const data = cleanWrite(updates, true);
  await ref.update(data);
  return documentData<MeetingPrep>(await ref.get()) || null;
}

export async function dbDeleteMeetingPrep(id: string): Promise<void> {
  await database().collection(MEETING_PREPS_COLLECTION).doc(id).update({ isDeleted: true, shareToken: null, shareExpiryDate: null });
}

export async function dbGetMeetingPrepByShareToken(token: string): Promise<MeetingPrep | undefined> {
  if (!token) return undefined;
  const snapshot = await database().collection(MEETING_PREPS_COLLECTION).where('shareToken', '==', token).limit(1).get();
  const prep = collectionData<MeetingPrep>(snapshot)[0];
  return prep && !prep.isDeleted && prep.shareExpiryDate instanceof Date && prep.shareExpiryDate.getTime() > Date.now() ? prep : undefined;
}

export async function dbAddParticipantAvailability(data: Omit<ParticipantAvailability, 'id' | 'submittedAt'>): Promise<ParticipantAvailability> {
  const collection = database().collection(MEETING_PREPS_COLLECTION).doc(data.meetingPrepId).collection(PARTICIPANT_AVAILABILITIES_SUBCOLLECTION);
  // Stable document ID prevents two simultaneous first submissions from creating duplicate records.
  const ref = collection.doc(data.selectedFriendId);
  const value = { ...data, submittedAt: new Date() };
  await ref.create(cleanWrite(value));
  return { ...value, id: ref.id };
}

export async function dbGetParticipantAvailability(prepId: string, friendId: string): Promise<ParticipantAvailability | undefined> {
  if (!prepId || !friendId) return undefined;
  const collection = database().collection(MEETING_PREPS_COLLECTION).doc(prepId).collection(PARTICIPANT_AVAILABILITIES_SUBCOLLECTION);
  return collectionData<ParticipantAvailability>(await collection.where('selectedFriendId', '==', friendId).limit(1).get())[0];
}

export async function dbUpdateParticipantAvailability(prepId: string, friendId: string, updates: Partial<Omit<ParticipantAvailability, 'id' | 'submittedAt' | 'meetingPrepId' | 'selectedFriendId'>>): Promise<ParticipantAvailability | null> {
  const collection = database().collection(MEETING_PREPS_COLLECTION).doc(prepId).collection(PARTICIPANT_AVAILABILITIES_SUBCOLLECTION);
  const snapshot = await collection.where('selectedFriendId', '==', friendId).limit(1).get();
  if (snapshot.empty) return null;
  const ref = snapshot.docs[0].ref;
  const data = cleanWrite(updates, true);
  if (updates.passwordHash) {
    const { FieldValue } = await import('firebase-admin/firestore');
    data.password = FieldValue.delete();
  }
  await ref.update(data);
  return documentData<ParticipantAvailability>(await ref.get()) || null;
}

export async function dbGetAllParticipantAvailabilities(prepId: string): Promise<ParticipantAvailability[]> {
  if (!prepId) return [];
  return collectionData<ParticipantAvailability>(await database().collection(MEETING_PREPS_COLLECTION).doc(prepId)
    .collection(PARTICIPANT_AVAILABILITIES_SUBCOLLECTION).orderBy('submittedAt', 'asc').get());
}
