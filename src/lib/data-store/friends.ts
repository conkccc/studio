import 'server-only';
import { FieldPath } from 'firebase-admin/firestore';
import type { Friend, FriendGroup } from '../types';
import { database, documentData, collectionData, cleanWrite, chunks, FieldValue } from './shared';
import { getUserById } from './users';
import { currentRequestUser } from '../auth/request-user';

export const FRIENDS_COLLECTION = 'friends';
export const FRIEND_GROUPS_COLLECTION = 'friendGroups';

export async function getFriends(): Promise<Friend[]> {
  return collectionData<Friend>(await database().collection(FRIENDS_COLLECTION).get())
    .filter(friend => !friend.isArchived).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export async function addFriend(friendData: Omit<Friend, 'id' | 'createdAt'>): Promise<Friend> {
  const friendRef = database().collection(FRIENDS_COLLECTION).doc();
  const friend = { ...friendData, id: friendRef.id, createdAt: new Date() };
  const groupRef = database().collection(FRIEND_GROUPS_COLLECTION).doc(friendData.groupId);
  await database().runTransaction(async transaction => {
    const group = documentData<FriendGroup>(await transaction.get(groupRef));
    if (!group || group.isArchived) throw new Error('친구 그룹이 삭제되었거나 보관되었습니다.');
    transaction.create(friendRef, cleanWrite({ ...friendData, createdAt: friend.createdAt }));
    transaction.update(groupRef, { memberIds: FieldValue.arrayUnion(friendRef.id) });
  });
  return friend;
}

export async function updateFriend(id: string, updates: Partial<Omit<Friend, 'id' | 'createdAt'>>): Promise<Friend | null> {
  const ref = database().collection(FRIENDS_COLLECTION).doc(id);
  await ref.update(cleanWrite(updates));
  return documentData<Friend>(await ref.get()) || null;
}

export async function deleteFriend(id: string): Promise<void> {
  const ref = database().collection(FRIENDS_COLLECTION).doc(id);
  const friend = documentData<Friend>(await ref.get());
  if (!friend) return;
  const batch = database().batch();
  batch.update(ref, { isArchived: true });
  const groupRef = database().collection(FRIEND_GROUPS_COLLECTION).doc(friend.groupId);
  if ((await groupRef.get()).exists) batch.update(groupRef, { memberIds: FieldValue.arrayRemove(id) });
  await batch.commit();
  // Historical meeting participant IDs and expenses remain intact.
}

export async function getFriendsByGroup(groupId: string): Promise<Friend[]> {
  if (!groupId) return [];
  return collectionData<Friend>(await database().collection(FRIENDS_COLLECTION).where('groupId', '==', groupId).get())
    .filter(friend => !friend.isArchived).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export async function dbGetFriendById(friendId: string): Promise<Friend | undefined> {
  if (!friendId) return undefined;
  return documentData<Friend>(await database().collection(FRIENDS_COLLECTION).doc(friendId).get());
}

export async function getFriendsByIds(ids: string[]): Promise<Friend[]> {
  const validIds = Array.from(new Set(ids.filter(Boolean)));
  const snapshots = await Promise.all(chunks(validIds).map(chunk => database().collection(FRIENDS_COLLECTION).where(FieldPath.documentId(), 'in', chunk).get()));
  return snapshots.flatMap(snapshot => collectionData<Friend>(snapshot));
}

export async function dbGetFriendsByUserFriendGroupIds(groupIds: string[]): Promise<Friend[]> {
  const validIds = Array.from(new Set(groupIds.filter(Boolean)));
  const snapshots = await Promise.all(chunks(validIds).map(chunk => database().collection(FRIENDS_COLLECTION).where('groupId', 'in', chunk).get()));
  return snapshots.flatMap(snapshot => collectionData<Friend>(snapshot)).filter(friend => !friend.isArchived)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export async function getFriendGroupById(id: string): Promise<FriendGroup | undefined> {
  if (!id) return undefined;
  return documentData<FriendGroup>(await database().collection(FRIEND_GROUPS_COLLECTION).doc(id).get());
}

export async function getFriendGroupsByUser(userId: string, includeArchived = false): Promise<FriendGroup[]> {
  if (!userId) return [];
  const verifiedUser = currentRequestUser();
  const user = verifiedUser?.id === userId ? verifiedUser : await getUserById(userId);
  const ids = Array.from(new Set(user?.friendGroupIds || []));
  const snapshots = await Promise.all([
    database().collection(FRIEND_GROUPS_COLLECTION).where('ownerUserId', '==', userId).get(),
    ...chunks(ids).map(chunk => database().collection(FRIEND_GROUPS_COLLECTION).where(FieldPath.documentId(), 'in', chunk).get()),
  ]);
  const groups = new Map(snapshots.flatMap(snapshot => collectionData<FriendGroup>(snapshot)).map(group => [group.id, group]));
  return Array.from(groups.values()).filter(group => includeArchived || !group.isArchived)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export async function addFriendGroup(data: Omit<FriendGroup, 'id' | 'createdAt'>): Promise<FriendGroup> {
  const value = { ...data, createdAt: new Date() };
  const ref = await database().collection(FRIEND_GROUPS_COLLECTION).add(cleanWrite(value));
  return { ...value, id: ref.id };
}

export async function updateFriendGroup(id: string, updates: Partial<Omit<FriendGroup, 'id' | 'createdAt'>>): Promise<FriendGroup | null> {
  const ref = database().collection(FRIEND_GROUPS_COLLECTION).doc(id);
  await ref.update(cleanWrite(updates));
  return documentData<FriendGroup>(await ref.get()) || null;
}

export async function deleteFriendGroup(id: string): Promise<void> {
  await database().collection(FRIEND_GROUPS_COLLECTION).doc(id).update({ isArchived: true });
}

export async function dbGetAllFriendGroups(includeArchived = false): Promise<FriendGroup[]> {
  return collectionData<FriendGroup>(await database().collection(FRIEND_GROUPS_COLLECTION).get())
    .filter(group => includeArchived || !group.isArchived).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}
