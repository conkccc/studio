import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { THEME_BOOTSTRAP_SCRIPT, THEME_STORAGE_KEY } from '../theme';

describe('first-paint theme selection', () => {
  it.each([
    { saved: null, systemDark: true, dark: true },
    { saved: null, systemDark: false, dark: false },
    { saved: 'light', systemDark: true, dark: false },
    { saved: 'dark', systemDark: false, dark: true },
    { saved: 'invalid', systemDark: true, dark: true },
  ])('applies the stored or system setting before hydration: %j', ({ saved, systemDark, dark }) => {
    const classes = new Set<string>();
    const root = { classList: { toggle: (name: string, enabled: boolean) => enabled ? classes.add(name) : classes.delete(name) }, style: { colorScheme: '' } };
    runInNewContext(THEME_BOOTSTRAP_SCRIPT, { document: { documentElement: root }, localStorage: { getItem: (key: string) => { expect(key).toBe(THEME_STORAGE_KEY); return saved; } }, matchMedia: () => ({ matches: systemDark }) });
    expect(classes.has('dark')).toBe(dark);
    expect(root.style.colorScheme).toBe(dark ? 'dark' : 'light');
  });
  it('uses the system setting when browser storage is unavailable', () => {
    const root = { classList: { toggle: (_name: string, enabled: boolean) => { root.dark = enabled; } }, style: { colorScheme: '' }, dark: false };
    runInNewContext(THEME_BOOTSTRAP_SCRIPT, { document: { documentElement: root }, localStorage: { getItem: () => { throw new Error('blocked'); } }, matchMedia: () => ({ matches: true }) });
    expect(root.dark).toBe(true);
  });
});
