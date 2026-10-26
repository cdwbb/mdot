import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  closeTab,
  exportHtml,
  newDocument,
  openFileDialog,
  openWorkspaceDialog,
  printDocument,
  renameTab,
  saveDocument,
} from '../app/actions';
import { toggleMode } from '../editor/modeSwitch';

/** Global input map: keyboard shortcuts and Ctrl/Cmd + wheel document zoom.
    Editor-local shortcuts (Ctrl+F/B/I) stay inside the editor. */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const state = useAppStore.getState();
      const key = event.key.toLowerCase();

      if (key === 'escape') {
        if (state.paletteOpen) {
          state.setPaletteOpen(false);
          event.preventDefault();
          return;
        }
        if (state.settingsOpen) {
          state.setSettingsOpen(false);
          event.preventDefault();
          return;
        }
        if (state.focusMode) {
          state.setFocusMode(false);
          event.preventDefault();
        }
        return;
      }

      if (event.key === 'F2') {
        if (state.activeTabId) {
          event.preventDefault();
          void renameTab(state.activeTabId);
        }
        return;
      }

      if (!mod) return;

      if (key === 'tab' && state.tabs.length > 1) {
        event.preventDefault();
        const index = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
        const next =
          state.tabs[
            (index + (event.shiftKey ? -1 : 1) + state.tabs.length) % state.tabs.length
          ];
        if (next) state.activateTab(next.id, state.mode === 'dual' ? state.activePane : undefined);
        return;
      }
      if (key === 'w' && !event.shiftKey && state.activeTabId) {
        event.preventDefault();
        closeTab(state.activeTabId);
        return;
      }
      if (key === 's') {
        event.preventDefault();
        void saveDocument(event.shiftKey);
        return;
      }
      if (key === 'o') {
        event.preventDefault();
        if (event.shiftKey) void openWorkspaceDialog();
        else void openFileDialog();
        return;
      }
      if (key === 'n' && !event.shiftKey) {
        event.preventDefault();
        newDocument();
        return;
      }
      if (key === 'k' && !event.shiftKey) {
        event.preventDefault();
        state.setPaletteOpen(!state.paletteOpen);
        return;
      }
      if (key === ',' ) {
        event.preventDefault();
        state.setSettingsOpen(!state.settingsOpen);
        return;
      }
      if (key === '/' || key === '\\') {
        event.preventDefault();
        toggleMode();
        return;
      }
      if (key === 'e' && event.shiftKey) {
        event.preventDefault();
        void exportHtml();
        return;
      }
      if (key === 'p' && event.shiftKey) {
        event.preventDefault();
        printDocument();
        return;
      }
      if (key === 'f' && event.shiftKey) {
        event.preventDefault();
        state.setFocusMode(!state.focusMode);
        return;
      }
      if (key === 'b' && event.shiftKey) {
        event.preventDefault();
        state.setSidebarOpen(!state.sidebarOpen);
        return;
      }
      if (key === 't' && event.shiftKey) {
        event.preventDefault();
        state.patchSettings({ typewriter: !state.settings.typewriter });
        state.toast(state.settings.typewriter ? '已关闭打字机模式' : '已开启打字机模式：光标保持居中');
      }
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, []);

  /** Ctrl/Cmd + wheel zooms the document. Trackpad pinch arrives as many tiny
      deltas, so the steps accumulate before the zoom actually moves. */
  useEffect(() => {
    let carry = 0;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      carry += event.deltaY * (event.deltaMode === 1 ? 33 : 1);
      if (Math.abs(carry) < 60) return;
      const step = carry > 0 ? -10 : 10;
      carry = 0;
      const state = useAppStore.getState();
      const current = state.settings.zoom;
      const next = Math.min(200, Math.max(50, Math.round((current + step) / 10) * 10));
      if (next !== current) state.patchSettings({ zoom: next });
    };

    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  }, []);
}
