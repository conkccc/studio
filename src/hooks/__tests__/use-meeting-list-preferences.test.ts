import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMeetingListPreferences } from '../use-meeting-list-preferences';
import { defaultMeetingListSelection, meetingListSelectionFromQuery, readMeetingListSelection, saveMeetingListSelection } from '@/lib/meeting-list-preferences';

const values = new Map<string, string>();
const memory = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
const replace = vi.fn();
let renderer: ReactTestRenderer | undefined;

function Harness({ userId, query }: { userId?: string; query: string }) {
  const preferences = useMeetingListPreferences(userId, query, '/meetings', replace);
  return React.createElement('button', { disabled: !preferences.ready, onClick: preferences.resetRememberedSelection }, preferences.ready ? 'ready' : 'restoring');
}
const render = (userId: string | undefined, query: string) => {
  act(() => {
    const element = React.createElement(Harness, { userId, query });
    if (renderer) renderer.update(element); else renderer = create(element);
  });
};
beforeEach(() => { values.clear(); replace.mockClear(); vi.stubGlobal('window', { localStorage: memory }); });
afterEach(() => { act(() => renderer?.unmount()); renderer = undefined; vi.unstubAllGlobals(); });

describe('meeting list restoration lifecycle', () => {
  it('is ready on the first render when returning to an explicit filter URL', () => {
    const initial: boolean[] = [];
    function ReturningPage() {
      const preferences = useMeetingListPreferences('user', 'year=2026', '/meetings', replace);
      initial.push(preferences.ready);
      return null;
    }
    act(() => { renderer = create(React.createElement(ReturningPage)); });
    expect(initial[0]).toBe(true);
    expect(replace).not.toHaveBeenCalled();
  });
  it('waits for the restored URL and does not overwrite saved filters with defaults', () => {
    saveMeetingListSelection(memory, 'user', meetingListSelectionFromQuery('year=2025&status=pending'));
    render('user', '');
    expect(replace).toHaveBeenCalledWith('/meetings?year=2025&status=pending', { scroll: false });
    expect(renderer!.root.findByType('button').props.disabled).toBe(true);
    expect(readMeetingListSelection(memory, 'user')?.year).toBe('2025');
    render('user', 'year=2025&status=pending');
    expect(renderer!.root.findByType('button').props.disabled).toBe(false);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('remembers subsequent changes and restores them after unmount/remount', () => {
    render('user', '');
    render('user', 'year=2024&groupId=group-one');
    act(() => renderer?.unmount()); renderer = undefined;
    render('user', '');
    expect(replace).toHaveBeenCalledWith('/meetings?year=2024&groupId=group-one', { scroll: false });
  });

  it('uses explicit deep links even when another selection is cached', () => {
    saveMeetingListSelection(memory, 'user', meetingListSelectionFromQuery('year=2025'));
    render('user', 'status=pending');
    expect(replace).not.toHaveBeenCalled();
    expect(renderer!.root.findByType('button').props.disabled).toBe(false);
    expect(readMeetingListSelection(memory, 'user')).toMatchObject({ year: 'all', status: 'pending' });
  });

  it('keeps reset after leaving immediately and coming back', () => {
    render('user', 'year=2025');
    act(() => renderer!.root.findByType('button').props.onClick());
    act(() => renderer?.unmount()); renderer = undefined;
    render('user', '');
    expect(replace).not.toHaveBeenCalled();
    expect(readMeetingListSelection(memory, 'user')).toEqual(defaultMeetingListSelection);
  });

  it('does not write preferences for a user before authentication is ready', () => {
    render(undefined, 'year=2025');
    expect(values.size).toBe(0);
    expect(renderer!.root.findByType('button').props.disabled).toBe(true);
    render('user', 'year=2025');
    expect(readMeetingListSelection(memory, 'user')?.year).toBe('2025');
  });

  it('loads the new account preferences without leaking the prior selection', () => {
    saveMeetingListSelection(memory, 'second', meetingListSelectionFromQuery('year=2023'));
    render('first', 'year=2025');
    render(undefined, '');
    render('second', '');
    expect(replace).toHaveBeenCalledWith('/meetings?year=2023', { scroll: false });
    expect(readMeetingListSelection(memory, 'first')?.year).toBe('2025');
  });

  it('allows a newer navigation to supersede pending restoration', () => {
    saveMeetingListSelection(memory, 'user', meetingListSelectionFromQuery('year=2025'));
    render('user', '');
    render('user', 'status=finalized');
    expect(renderer!.root.findByType('button').props.disabled).toBe(false);
    expect(readMeetingListSelection(memory, 'user')).toMatchObject({ year: 'all', status: 'finalized' });
  });
});
