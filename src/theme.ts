import type { ThemePref } from './types';

export type ThemePalette = Exclude<ThemePref, 'system'>;
export type ThemeScheme = 'light' | 'dark';

export interface ThemeMeta {
  value: ThemePref;
  label: string;
  scheme: ThemeScheme | 'auto';
}

export const THEMES: ThemeMeta[] = [
  { value: 'system', label: '跟随系统', scheme: 'auto' },
  { value: 'paper', label: '暖纸', scheme: 'light' },
  { value: 'snow', label: '雪白', scheme: 'light' },
  { value: 'jade', label: '青瓷', scheme: 'light' },
  { value: 'ink', label: '墨夜', scheme: 'dark' },
  { value: 'midnight', label: '深空', scheme: 'dark' },
];

export const THEME_LABEL = Object.fromEntries(
  THEMES.map((theme) => [theme.value, theme.label]),
) as Record<ThemePref, string>;

const DARK_PALETTES: ThemePalette[] = ['ink', 'midnight'];

export function isDarkPalette(palette: ThemePalette): boolean {
  return DARK_PALETTES.includes(palette);
}

export function resolvePalette(pref: ThemePref, systemDark: boolean): ThemePalette {
  if (pref === 'system') return systemDark ? 'ink' : 'paper';
  return pref;
}

export function nextTheme(pref: ThemePref): ThemePref {
  const index = THEMES.findIndex((theme) => theme.value === pref);
  return THEMES[(index + 1) % THEMES.length].value;
}

export function normalizeThemePref(value: unknown): ThemePref {
  if (value === 'light') return 'paper';
  if (value === 'dark') return 'ink';
  if (THEMES.some((theme) => theme.value === value)) return value as ThemePref;
  return 'system';
}
