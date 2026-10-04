export const THEME_STORAGE_KEY = 'friendsfund:theme:v1';
export type ThemePreference = 'system' | 'light' | 'dark';

export function parseTheme(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function readTheme(): ThemePreference {
  try { return parseTheme(localStorage.getItem(THEME_STORAGE_KEY)); }
  catch { return 'system'; }
}

export function applyTheme(preference: ThemePreference, systemDark: boolean, root: Pick<HTMLElement, 'classList' | 'style'> = document.documentElement) {
  const dark = preference === 'dark' || (preference === 'system' && systemDark);
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
}

// Run before first paint so the system or saved preference also applies before hydration.
export const THEME_BOOTSTRAP_SCRIPT = `(function(){var theme='system';try{var saved=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(saved==='light'||saved==='dark')theme=saved;}catch(e){}var dark=theme==='dark'||(theme==='system'&&typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.style.colorScheme=dark?'dark':'light';})();`;
