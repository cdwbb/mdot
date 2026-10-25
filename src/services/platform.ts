export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function detectPlatform(): 'windows' | 'mac' | 'web' {
  if (!isTauri()) return 'web';
  const ua = navigator.userAgent || '';
  return /Mac|iPhone|iPad|iPod/i.test(ua) ? 'mac' : 'windows';
}

export const isMac = (): boolean => detectPlatform() === 'mac';

/** `Cmd` on macOS, `Ctrl` elsewhere. */
export const modKey = (): string => (isMac() ? '⌘' : 'Ctrl');

export function formatShortcut(combo: string): string {
  const mac = isMac();
  return combo
    .replace(/Mod/g, mac ? '⌘' : 'Ctrl')
    .replace(/Shift/g, mac ? '⇧' : 'Shift')
    .replace(/Alt/g, mac ? '⌥' : 'Alt');
}
