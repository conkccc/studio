import 'server-only';

import { FieldValue, Timestamp, type DocumentData, type DocumentSnapshot, type QuerySnapshot } from 'firebase-admin/firestore';
import { getAdminDb } from '../firebase-admin';

export const database = getAdminDb;
export { FieldValue, Timestamp };

const dateFields = new Set(['createdAt', 'dateTime', 'endTime', 'date', 'shareExpiryDate', 'submittedAt', 'settledReserveFundAt']);

function fromFirestore(value: unknown, field?: string): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (field && dateFields.has(field) && typeof value === 'string') {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date;
  }
  if (Array.isArray(value)) return value.map(child => fromFirestore(child));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, fromFirestore(child, key)]));
  }
  return value;
}

export function documentData<T extends { id: string }>(snapshot: DocumentSnapshot): T | undefined {
  if (!snapshot.exists) return undefined;
  return { ...fromFirestore(snapshot.data()) as object, id: snapshot.id } as T;
}

export function collectionData<T extends { id: string }>(snapshot: QuerySnapshot): T[] {
  return snapshot.docs.map(doc => documentData<T>(doc)!).filter(Boolean);
}

export function cleanWrite(data: object, removeUndefined = false): DocumentData {
  return Object.fromEntries(Object.entries(data).flatMap(([key, value]) => {
    if (value === undefined) return removeUndefined ? [[key, FieldValue.delete()]] : [];
    if (Array.isArray(value)) return [[key, value.map(item => item && typeof item === 'object' && !(item instanceof Date) && !(item instanceof Timestamp) && !(item instanceof FieldValue) ? cleanWrite(item) : item)]];
    if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof Timestamp) && !(value instanceof FieldValue)) {
      return [[key, cleanWrite(value)]];
    }
    return [[key, value]];
  }));
}

export const chunks = <T,>(items: T[], size = 30): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
