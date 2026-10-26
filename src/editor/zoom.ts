import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { ZoomKey } from '../types';

export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;
export const ZOOM_STEP = 10;
export const ZOOM_DEFAULT = 100;

const ZOOM_KEYS: readonly ZoomKey[] = [
  'seamless',
  'split-source',
  'split-preview',
  'dual-a',
  'dual-b',
];

export const ZOOM_LABEL: Record<ZoomKey, string> = {
  seamless: '当前文档',
  'split-source': '源码窗格',
  'split-preview': '预览窗格',
  'dual-a': '窗格 A',
  'dual-b': '窗格 B',
};

export const clampZoom = (percent: number): number =>
  Number.isFinite(percent)
    ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(percent / ZOOM_STEP) * ZOOM_STEP))
    : ZOOM_DEFAULT;

export function zoomOf(key: ZoomKey): number {
  return useAppStore.getState().paneZoom[key] ?? ZOOM_DEFAULT;
}

export function setZoom(key: ZoomKey, percent: number): void {
  useAppStore.getState().setPaneZoom(key, clampZoom(percent));
}

export function stepZoom(key: ZoomKey, delta: number): void {
  const next = clampZoom(zoomOf(key) + delta);
  if (next !== zoomOf(key)) useAppStore.getState().setPaneZoom(key, next);
}

/** Which pane a pointer or focus event belongs to. */
export function zoomKeyAt(target: EventTarget | null): ZoomKey | null {
  if (!(target instanceof Element)) return null;
  const raw = target.closest('[data-zoom-key]')?.getAttribute('data-zoom-key');
  return ZOOM_KEYS.includes(raw as ZoomKey) ? (raw as ZoomKey) : null;
}
/** Marks a pane as zoomable and carries its level down to the document surface. */
export function usePaneZoom(key: ZoomKey) {
  const zoom = useAppStore((s) => s.paneZoom[key] ?? ZOOM_DEFAULT);
  return useMemo(
    () => ({
      zoom,
      props: {
        'data-zoom-key': key,
        style: { '--ui-zoom': String(zoom / 100) } as CSSProperties,
      },
    }),
    [zoom, key],
  );
}
