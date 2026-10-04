import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { THEME_STORAGE_KEY, type ThemePreference } from '@/lib/theme';

const stored = new Map<string, string>();
const storage = { getItem: (key: string) => stored.get(key) || null, setItem: (key: string, value: string) => { stored.set(key, value); } };
const classes = new Set<string>();
const root = { classList: { toggle: (name: string, enabled: boolean) => enabled ? classes.add(name) : classes.delete(name) }, style: { colorScheme: '' } };
const mediaListeners = new Set<(event: { matches: boolean }) => void>();
const storageListeners = new Set<(event: { key: string | null; newValue: string | null }) => void>();
const media = { matches: true, addEventListener: (_event: string, callback: (event: { matches: boolean }) => void) => { mediaListeners.add(callback); }, removeEventListener: (_event: string, callback: (event: { matches: boolean }) => void) => { mediaListeners.delete(callback); } };
let renderer: ReactTestRenderer | undefined;
function Harness() {
  const theme = useTheme();
  return React.createElement('div', null, React.createElement('output', { 'data-preference': theme.preference, 'data-ready': theme.ready }),
    ...(['system', 'light', 'dark'] as ThemePreference[]).map(value => React.createElement('button', { key: value, id: value, onClick: () => theme.setPreference(value) })));
}
function render() { act(() => { renderer = create(React.createElement(ThemeProvider, null, React.createElement(Harness))); }); }
const select = (value: string) => act(() => renderer!.root.findByProps({ id: value }).props.onClick());
const system = (dark: boolean) => act(() => { media.matches = dark; mediaListeners.forEach(callback => callback({ matches: dark })); });
const storageEvent = (key: string | null, newValue: string | null) => act(() => storageListeners.forEach(callback => callback({ key, newValue })));
beforeEach(() => {
  stored.clear(); classes.clear(); mediaListeners.clear(); storageListeners.clear(); media.matches = true; root.style.colorScheme = '';
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('document', { documentElement: root });
  vi.stubGlobal('window', { matchMedia: () => media, addEventListener: (_event: string, callback: (event: { key: string | null; newValue: string | null }) => void) => { storageListeners.add(callback); }, removeEventListener: (_event: string, callback: (event: { key: string | null; newValue: string | null }) => void) => { storageListeners.delete(callback); } });
});
afterEach(() => { act(() => renderer?.unmount()); renderer = undefined; vi.unstubAllGlobals(); });
describe('theme preference lifecycle', () => {
  it('defaults to the system setting and follows live system changes', () => {
    render();
    expect(renderer!.root.findByType('output').props).toMatchObject({ 'data-preference': 'system', 'data-ready': true });
    expect(classes.has('dark')).toBe(true);
    system(false);
    expect(classes.has('dark')).toBe(false);
    expect(root.style.colorScheme).toBe('light');
  });
  it('persists a manual choice and ignores system changes until system mode is restored', () => {
    render(); select('light');
    expect(stored.get(THEME_STORAGE_KEY)).toBe('light');
    system(true); expect(classes.has('dark')).toBe(false);
    select('system'); expect(classes.has('dark')).toBe(true);
  });
  it('restores a saved dark selection even when the system is light', () => {
    media.matches = false; stored.set(THEME_STORAGE_KEY, 'dark'); render();
    expect(classes.has('dark')).toBe(true);
    expect(renderer!.root.findByType('output').props['data-preference']).toBe('dark');
  });
  it('synchronizes changes from another tab and returns to system mode on storage clear', () => {
    render(); storageEvent(THEME_STORAGE_KEY, 'light'); expect(classes.has('dark')).toBe(false);
    storageEvent('unrelated', 'dark'); expect(classes.has('dark')).toBe(false);
    storageEvent(null, null); expect(classes.has('dark')).toBe(true);
  });
  it('allows an in-session selection when storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    render(); select('light');
    expect(classes.has('dark')).toBe(false);
  });
  it('removes system and storage listeners on unmount', () => {
    render(); act(() => renderer!.unmount()); renderer = undefined;
    expect(mediaListeners.size).toBe(0);
    expect(storageListeners.size).toBe(0);
  });
});
