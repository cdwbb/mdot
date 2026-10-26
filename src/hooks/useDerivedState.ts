import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { countStats, extractOutline } from '../utils/markdown';

/** Outline drives scroll sync, so it stays responsive; the word count can lag. */
const OUTLINE_DELAY = 120;
const STATS_DELAY = 500;

/**
 * Outline and statistics are whole-document scans. Doing them in a render would
 * put that cost on every keystroke, so they are derived here and published back
 * into the store for the few components that display them.
 */
export function useDerivedState(): void {
  useEffect(() => {
    let outlineTimer: ReturnType<typeof setTimeout> | null = null;
    let statsTimer: ReturnType<typeof setTimeout> | null = null;

    const off = useAppStore.subscribe((state, prev) => {
      if (state.doc.content === prev.doc.content) return;
      if (outlineTimer) clearTimeout(outlineTimer);
      if (statsTimer) clearTimeout(statsTimer);
      outlineTimer = setTimeout(() => {
        outlineTimer = null;
        const s = useAppStore.getState();
        s.setOutline(extractOutline(s.doc.content));
      }, OUTLINE_DELAY);
      statsTimer = setTimeout(() => {
        statsTimer = null;
        const s = useAppStore.getState();
        s.setStats(countStats(s.doc.content));
      }, STATS_DELAY);
    });

    return () => {
      off();
      if (outlineTimer) clearTimeout(outlineTimer);
      if (statsTimer) clearTimeout(statsTimer);
    };
  }, []);
}
