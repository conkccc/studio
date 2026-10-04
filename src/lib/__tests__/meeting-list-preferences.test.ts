import { describe, expect, it } from 'vitest';
import { defaultMeetingListSelection, meetingListSelectionFromQuery, meetingListStorageKey, readMeetingListSelection, restoreMeetingListQuery, saveMeetingListSelection } from '../meeting-list-preferences';

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe('remembered meeting list selection', () => {
  it('restores year, group, type, settlement status and search after leaving the list', () => {
    const memory = storage();
    const selected = meetingListSelectionFromQuery('year=2025&groupId=group-one&type=regular&status=pending&search=%EC%8B%9D%EC%82%AC');
    saveMeetingListSelection(memory, 'user-one', selected);
    const restored = new URLSearchParams(restoreMeetingListQuery('', readMeetingListSelection(memory, 'user-one')));
    expect(Object.fromEntries(restored)).toEqual({ year: '2025', type: 'regular', groupId: 'group-one', status: 'pending', search: '식사' });
  });

  it('does not carry another account preferences into the next login', () => {
    const memory = storage();
    saveMeetingListSelection(memory, 'first', meetingListSelectionFromQuery('year=2025'));
    expect(readMeetingListSelection(memory, 'second')).toBeNull();
    expect(meetingListStorageKey('first')).not.toBe(meetingListStorageKey('second'));
  });

  it.each(['year=2024', 'status=pending', 'year=all', 'search=', 'cursor=continuation&history=%5B%22%22%5D'])('preserves explicit links and browser navigation: %s', query => {
    expect(restoreMeetingListQuery(query, { ...defaultMeetingListSelection, year: '2025', groupId: 'another' })).toBe(query);
  });

  it('remembers reset and returns to all choices rather than restoring an old selection', () => {
    const memory = storage();
    saveMeetingListSelection(memory, 'user', meetingListSelectionFromQuery('year=2025'));
    saveMeetingListSelection(memory, 'user', { ...defaultMeetingListSelection });
    expect(restoreMeetingListQuery('', readMeetingListSelection(memory, 'user'))).toBe('');
  });

  it('does not persist stale page cursors/history or unrelated URL fields', () => {
    const memory = storage();
    saveMeetingListSelection(memory, 'user', meetingListSelectionFromQuery('year=2025&cursor=old&history=old&page=50&debug=true'));
    expect(memory.values.get(meetingListStorageKey('user'))).not.toMatch(/cursor|history|page|debug/);
    expect(restoreMeetingListQuery('view=list', readMeetingListSelection(memory, 'user'))).toBe('view=list&year=2025');
  });

  it('ignores corrupted JSON and normalizes invalid stored values', () => {
    const memory = storage();
    memory.setItem(meetingListStorageKey('user'), 'invalid JSON');
    expect(readMeetingListSelection(memory, 'user')).toBeNull();
    memory.setItem(meetingListStorageKey('user'), JSON.stringify({ year: 'NaN', type: 'invalid', status: 'admin', groupId: 'unsafe/path', search: 'x'.repeat(101) }));
    expect(readMeetingListSelection(memory, 'user')).toEqual({ ...defaultMeetingListSelection, search: 'x'.repeat(100) });
  });

  it('does not fail when browser storage is disabled', () => {
    const unavailable = { getItem: () => { throw new Error('disabled'); }, setItem: () => { throw new Error('disabled'); } };
    expect(readMeetingListSelection(unavailable, 'user')).toBeNull();
    expect(() => saveMeetingListSelection(unavailable, 'user', { ...defaultMeetingListSelection })).not.toThrow();
  });
});
