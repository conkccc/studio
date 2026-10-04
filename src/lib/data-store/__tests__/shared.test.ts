import { describe, expect, it, vi } from 'vitest';
import { FieldValue, Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore';
import { cleanWrite, collectionData, documentData } from '../shared';

vi.mock('server-only', () => ({}));
vi.mock('../../firebase-admin', () => ({ getAdminDb: vi.fn() }));

function snapshot(data?: object, id = 'actual-document-id'): DocumentSnapshot {
  return { id, exists: data !== undefined, data: () => data } as unknown as DocumentSnapshot;
}

describe('Firestore serialization', () => {
  it('converts nested timestamps and known ISO date fields while retaining native Dates', () => {
    const nativeDate = new Date('2026-10-04T02:00:00Z');
    const data = documentData<Record<string, unknown> & { id: string }>(snapshot({
      id: 'forged-field-id',
      createdAt: Timestamp.fromDate(nativeDate),
      dateTime: '2026-10-04T03:00:00Z',
      nested: { submittedAt: '2026-10-04T04:00:00Z', recorded: Timestamp.fromDate(nativeDate) },
      children: [{ date: '2026-10-04T05:00:00Z' }],
      endTime: nativeDate,
      shareExpiryDate: null,
    }));
    expect(data?.id).toBe('actual-document-id');
    expect(data?.createdAt).toEqual(nativeDate);
    expect(data?.dateTime).toEqual(new Date('2026-10-04T03:00:00Z'));
    expect(data?.nested).toEqual({ submittedAt: new Date('2026-10-04T04:00:00Z'), recorded: nativeDate });
    expect(data?.children).toEqual([{ date: new Date('2026-10-04T05:00:00Z') }]);
    expect(data?.endTime).toBe(nativeDate);
    expect(data?.shareExpiryDate).toBeNull();
  });

  it('does not interpret arbitrary text, month selections, or invalid date fields as dates', () => {
    const data = documentData<Record<string, unknown> & { id: string }>(snapshot({
      title: '2026-10-04T03:00:00Z', dateTime: 'invalid-date',
      storedDates: ['2026-10-04'], selectedMonths: ['2026-10'], password: '2026-10-04',
    }));
    expect(data?.title).toBe('2026-10-04T03:00:00Z');
    expect(data?.dateTime).toBe('invalid-date');
    expect(data?.storedDates).toEqual(['2026-10-04']);
    expect(data?.selectedMonths).toEqual(['2026-10']);
    expect(data?.password).toBe('2026-10-04');
  });

  it('returns no data for missing documents and skips them in collections', () => {
    expect(documentData(snapshot())).toBeUndefined();
    expect(collectionData({ docs: [snapshot(), snapshot({ name: '있는 문서' }, 'present')] } as never))
      .toEqual([{ id: 'present', name: '있는 문서' }]);
  });

  it('removes undefined create fields, preserves nulls, and cleans nested objects', () => {
    expect(cleanWrite({ missing: undefined, present: null, nested: { missing: undefined, name: '이름' }, children: [{ extra: undefined, id: 'a' }] }))
      .toEqual({ present: null, nested: { name: '이름' }, children: [{ id: 'a' }] });
  });

  it('uses deletion only for explicitly supplied undefined update fields and preserves sentinels', () => {
    const deletion = FieldValue.delete();
    const increment = FieldValue.increment(1);
    const result = cleanWrite({ snapshot: undefined, oldPassword: deletion, nested: { counter: increment }, unrelated: 'same' }, true);
    expect(result.snapshot).toBeInstanceOf(FieldValue);
    expect(result.snapshot.isEqual(deletion)).toBe(true);
    expect(result.oldPassword).toBe(deletion);
    expect(result.nested.counter).toBe(increment);
    expect(result.unrelated).toBe('same');
    expect(result).not.toHaveProperty('omitted-field');
  });

  it('preserves native Dates and Timestamp values in objects and arrays', () => {
    const date = new Date('2026-10-04T03:00:00Z');
    const timestamp = Timestamp.fromDate(date);
    const result = cleanWrite({ date, timestamp, nested: { timestamp }, entries: [date, timestamp] });
    expect(result.date).toBe(date);
    expect(result.timestamp).toBe(timestamp);
    expect(result.nested.timestamp).toBe(timestamp);
    expect(result.entries[0]).toBe(date);
    expect(result.entries[1]).toBe(timestamp);
  });
});
