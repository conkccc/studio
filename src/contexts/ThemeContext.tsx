'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { applyTheme, parseTheme, readTheme, THEME_STORAGE_KEY, type ThemePreference } from '@/lib/theme';

const ThemeContext = createContext<{ preference: ThemePreference; ready: boolean; setPreference: (value: ThemePreference) => void } | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, updatePreference] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);
  const current = useRef<ThemePreference>('system');

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const restore = (value: ThemePreference) => {
      current.current = value;
      updatePreference(value);
      applyTheme(value, media.matches);
    };
    restore(readTheme());
    setReady(true);
    const onSystemChange = (event: MediaQueryListEvent) => applyTheme(current.current, event.matches);
    const onStorageChange = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) restore(parseTheme(event.newValue));
    };
    media.addEventListener('change', onSystemChange);
    window.addEventListener('storage', onStorageChange);
    return () => {
      media.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onStorageChange);
    };
  }, []);

  const setPreference = useCallback((value: ThemePreference) => {
    current.current = value;
    updatePreference(value);
    applyTheme(value, window.matchMedia('(prefers-color-scheme: dark)').matches);
    try { localStorage.setItem(THEME_STORAGE_KEY, value); } catch { /* Keep the selection for this session if storage is unavailable. */ }
  }, []);

  return <ThemeContext.Provider value={{ preference, ready, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('ThemeProvider가 필요합니다.');
  return value;
}
