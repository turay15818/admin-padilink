/**
 * Theme plumbing: remembers the choice, respects the operating system on first visit,
 * and keeps following the OS until the admin makes a choice of their own.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { font, themes, type Theme, type ThemeName } from './theme';

const STORAGE_KEY = 'vacancy.admin.theme';

type ThemeContextValue = {
  t: Theme;
  name: ThemeName;
  setTheme: (name: ThemeName) => void;
  toggle: () => void;
  /** True while we are still mirroring the OS because nobody has chosen yet. */
  followingSystem: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStored(): ThemeName | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : null;
  } catch {
    return null; // private browsing — fall back to the OS rather than breaking
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<ThemeName | null>(() => readStored());
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark());

  // Keep mirroring the OS until an explicit choice is made.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const name: ThemeName = stored ?? (systemDark ? 'dark' : 'light');
  const t = themes[name];

  const setTheme = useCallback((next: ThemeName) => {
    setStored(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* nothing we can do */ }
  }, []);

  // Paint the page background before React renders, so switching never flashes white.
  useEffect(() => {
    document.documentElement.style.colorScheme = name;
    document.body.style.background = t.bg;
    document.body.style.color = t.text;
    document.body.style.fontFamily = font;
    document.body.style.margin = '0';
  }, [name, t]);

  const value = useMemo<ThemeContextValue>(() => ({
    t, name, setTheme, toggle: () => setTheme(name === 'dark' ? 'light' : 'dark'), followingSystem: stored === null,
  }), [t, name, setTheme, stored]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
