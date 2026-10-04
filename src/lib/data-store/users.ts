import 'server-only';
import type { User } from '../types';
import { database, documentData, collectionData, cleanWrite } from './shared';

export const USERS_COLLECTION = 'users';

export async function getUserById(userId: string): Promise<User | undefined> {
  if (!userId) return undefined;
  return documentData<User>(await database().collection(USERS_COLLECTION).doc(userId).get());
}

export async function addUserOnLogin(userData: { id: string; email?: string | null; name?: string | null }): Promise<User> {
  const ref = database().collection(USERS_COLLECTION).doc(userData.id);
  return database().runTransaction(async transaction => {
    const existing = documentData<User>(await transaction.get(ref));
    if (existing) return existing;
    const user: User = { ...userData, email: userData.email || null, name: userData.name || null, role: 'none', createdAt: new Date() };
    const { id: _id, ...data } = user;
    void _id;
    transaction.create(ref, data);
    return user;
  });
}

export async function updateUser(userId: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User | null> {
  const ref = database().collection(USERS_COLLECTION).doc(userId);
  await ref.update(cleanWrite(updates));
  return documentData<User>(await ref.get()) || null;
}

export async function getUsers(): Promise<User[]> {
  return collectionData<User>(await database().collection(USERS_COLLECTION).get())
    .sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || '', 'ko'));
}
