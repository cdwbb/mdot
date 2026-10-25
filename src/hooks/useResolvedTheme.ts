import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { isDarkPalette } from '../theme';

export type ResolvedTheme = 'light' | 'dark';

export function useResolvedTheme(): ResolvedTheme {
  const pref = useAppStore((s) => s.settings.theme);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setSystemDark(query.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return isDarkPalette(pref) ? 'dark' : 'light';
}
