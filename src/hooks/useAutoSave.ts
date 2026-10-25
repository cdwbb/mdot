import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { saveTab } from '../app/actions';
import { isDesktop } from '../services/backend';

/** Autosave every dirty tab that already has a path. */
export function useAutoSave(): void {
  const tabs = useAppStore((s) => s.tabs);
  const autoSave = useAppStore((s) => s.settings.autoSave);
  const autoSaveDelay = useAppStore((s) => s.settings.autoSaveDelay);
  const lastSavedAt = useAppStore((s) => s.lastSavedAt);

  useEffect(() => {
    if (!autoSave) return;
    const dirty = tabs.filter((tab) => tab.path && tab.content !== tab.savedContent);
    if (!dirty.length) return;
    const timer = setTimeout(() => {
      for (const tab of dirty) void saveTab(tab.id);
    }, autoSaveDelay);
    return () => clearTimeout(timer);
  }, [tabs, autoSave, autoSaveDelay]);

  useEffect(() => {
    const flush = () => {
      const state = useAppStore.getState();
      if (!state.settings.autoSave) return;
      for (const tab of state.tabs) {
        if (tab.path && tab.content !== tab.savedContent) void saveTab(tab.id);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('blur', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!lastSavedAt) return;
    const timer = setTimeout(() => {
      const state = useAppStore.getState();
      const active = state.tabs.find((tab) => tab.id === state.activeTabId);
      if (state.saveState === 'saved' && active && active.content === active.savedContent) {
        state.setSaveState('idle');
      }
    }, 2200);
    return () => clearTimeout(timer);
  }, [lastSavedAt]);

  useEffect(() => {
    // Desktop close protection handles unsaved files; a WebView beforeunload
    // prompt here would double-dialog and can trap the window open.
    if (isDesktop) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const state = useAppStore.getState();
      const risky = state.tabs.some(
        (tab) =>
          tab.content !== tab.savedContent &&
          (!state.settings.autoSave || !tab.path),
      );
      if (!risky) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
}
