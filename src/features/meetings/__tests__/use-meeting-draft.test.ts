import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseFormReturn } from 'react-hook-form';
import { useMeetingDraft } from '../use-meeting-draft';
import type { MeetingFormData } from '../meeting-form-schema';

const stored = new Map<string, string>();
const memory = { getItem: (key: string) => stored.get(key) || null, setItem: (key: string, value: string) => { stored.set(key, value); }, removeItem: (key: string) => { stored.delete(key); } };
type Listener = (values: Partial<MeetingFormData>, info: { name?: string }) => void;
const listeners = new Set<Listener>();
let values: Partial<MeetingFormData>;
let renderer: ReactTestRenderer | undefined;
const form = {
  getValues: () => values,
  watch: (listener: Listener) => { listeners.add(listener); return { unsubscribe: () => listeners.delete(listener) }; },
} as unknown as UseFormReturn<MeetingFormData>;

function Harness({ userId, enabled = true }: { userId: string; enabled?: boolean }) {
  const draft = useMeetingDraft(form, userId, enabled, 'g1');
  return React.createElement('div', null,
    React.createElement('output', { 'data-draft-name': draft.draft?.values.name || '', 'data-saved': draft.saved }),
    React.createElement('button', { id: 'edit', onClick: () => { values = { ...values, name: '작성 중인 모임' }; listeners.forEach(listener => listener(values, { name: 'name' })); } }),
    React.createElement('button', { id: 'discard', onClick: draft.discardDraft }),
    React.createElement('button', { id: 'complete', onClick: draft.completeDraft }),
  );
}
function render(userId = 'user', enabled = true) {
  act(() => {
    const element = React.createElement(Harness, { userId, enabled });
    if (renderer) renderer.update(element); else renderer = create(element);
  });
}
const click = (id: string) => act(() => renderer!.root.findByProps({ id }).props.onClick());
beforeEach(() => { vi.useFakeTimers(); stored.clear(); listeners.clear(); values = { name: '', dateTime: new Date('2026-10-04T00:00:00Z') }; vi.stubGlobal('sessionStorage', memory); });
afterEach(() => { act(() => renderer?.unmount()); renderer = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('meeting draft lifecycle', () => {
  it('saves edited values and group selection after the debounce', () => {
    render(); click('edit'); act(() => { vi.advanceTimersByTime(500); });
    expect(JSON.parse(stored.get('meeting:new:user')!)).toMatchObject({ groupId: 'g1', values: { name: '작성 중인 모임' } });
  });
  it('does not recreate discarded data when a debounce is still pending', () => {
    render(); click('edit'); click('discard'); act(() => { vi.advanceTimersByTime(500); });
    expect(stored.has('meeting:new:user')).toBe(false);
    act(() => renderer?.unmount()); renderer = undefined;
    expect(stored.has('meeting:new:user')).toBe(false);
  });
  it('flushes pending changes when leaving the form', () => {
    render(); click('edit'); act(() => renderer?.unmount()); renderer = undefined;
    expect(JSON.parse(stored.get('meeting:new:user')!).values.name).toBe('작성 중인 모임');
  });
  it('clears successful drafts permanently even when a save timer was pending', () => {
    render(); click('edit'); click('complete'); act(() => { vi.advanceTimersByTime(500); });
    expect(stored.has('meeting:new:user')).toBe(false);
  });
  it('does not display another user draft after the account changes', () => {
    stored.set('meeting:new:first', JSON.stringify({ values: { name: '첫 계정 모임', dateTime: '2026-10-04T00:00:00Z' }, groupId: 'g1', savedAt: '2026-10-04' }));
    render('first'); expect(renderer!.root.findByType('output').props['data-draft-name']).toBe('첫 계정 모임');
    render('second'); expect(renderer!.root.findByType('output').props['data-draft-name']).toBe('');
    expect(stored.has('meeting:new:second')).toBe(false);
  });
  it('ignores malformed stored data and disabled storage', () => {
    stored.set('meeting:new:user', 'not JSON'); render();
    expect(renderer!.root.findByType('output').props['data-draft-name']).toBe('');
    vi.stubGlobal('sessionStorage', { ...memory, setItem: () => { throw new Error('disabled'); } });
    click('edit'); expect(() => act(() => { vi.advanceTimersByTime(500); })).not.toThrow();
  });
});
