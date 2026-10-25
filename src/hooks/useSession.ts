import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { backend } from '../services/backend';

/** Persist the tab workspace so the next launch returns to the same place. */
export function useSessionPersistence(): void {
  const booted = useAppStore((s) => s.booted);
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const mode = useAppStore((s) => s.mode);
  const paneA = useAppStore((s) => s.paneA);
  const paneB = useAppStore((s) => s.paneB);
  const activePane = useAppStore((s) => s.activePane);
  const splitLayout = useAppStore((s) => s.splitLayout);
  const splitRatio = useAppStore((s) => s.splitRatio);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const sidebarView = useAppStore((s) => s.sidebarView);
  const workspace = useAppStore((s) => s.workspace);
  const rememberSession = useAppStore((s) => s.settings.rememberSession);

  useEffect(() => {
    if (!booted) return;
    if (!rememberSession) void backend.clearSession();
  }, [booted, rememberSession]);

  useEffect(() => {
    if (!booted || !rememberSession) return;
    const timer = window.setTimeout(() => {
      void backend.saveSession(useAppStore.getState().sessionSnapshot());
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    booted,
    rememberSession,
    tabs,
    activeTabId,
    mode,
    paneA,
    paneB,
    activePane,
    splitLayout,
    splitRatio,
    sidebarOpen,
    sidebarView,
    workspace,
  ]);

  useEffect(() => {
    if (!booted) return;
    const save = () => {
      const state = useAppStore.getState();
      if (!state.settings.rememberSession) return;
      void backend.saveSession(state.sessionSnapshot());
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', save);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [booted]);
}
