import { Suspense, lazy, useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import { useAppStore } from './store/useAppStore';
import { onActiveHeading } from './editor/bus';
import { useResolvedTheme } from './hooks/useResolvedTheme';
import { useLifecycle } from './hooks/useLifecycle';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useAutoSave } from './hooks/useAutoSave';
import { useFileDrop } from './hooks/useFileDrop';
import { useSessionPersistence } from './hooks/useSession';
import { useDerivedState } from './hooks/useDerivedState';
import TitleBar from './components/TitleBar';
import TabBar from './components/TabBar';
import Sidebar from './components/Sidebar';
import StatusBar from './components/StatusBar';
import WelcomeScreen from './components/WelcomeScreen';
import CommandPalette from './components/CommandPalette';
import SettingsDialog from './components/SettingsDialog';
import ConflictBanner from './components/ConflictBanner';
import Toasts from './components/Toasts';

/** Editors are loaded on first use so the window can paint immediately. */
const CrepeEditor = lazy(() => import('./editor/seamless/CrepeEditor'));
const SplitEditor = lazy(() => import('./editor/split/SplitEditor'));
const DualWorkspace = lazy(() => import('./editor/dual/DualWorkspace'));

function EditorSkeleton() {
  return (
    <div className="doc-skeleton" aria-hidden="true">
      <div className="doc-skeleton__inner">
        <div className="sk-line sk-line--title" />
        <div className="sk-line" />
        <div className="sk-line" />
        <div className="sk-line sk-line--short" />
        <div className="sk-line sk-line--tiny" />
      </div>
    </div>
  );
}

export default function App() {
  const theme = useResolvedTheme();
  const booted = useAppStore((s) => s.booted);
  const showWelcome = useAppStore((s) => s.showWelcome);
  const loadingDoc = useAppStore((s) => s.loadingDoc);
  const mode = useAppStore((s) => s.mode);
  const docSeq = useAppStore((s) => s.docSeq);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const focusMode = useAppStore((s) => s.focusMode);
  const paletteOpen = useAppStore((s) => s.paletteOpen);
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const { dragging } = useFileDrop();

  useLifecycle(theme);
  useGlobalShortcuts();
  useAutoSave();
  useSessionPersistence();
  useDerivedState();

  useEffect(
    () =>
      onActiveHeading((id) => {
        const state = useAppStore.getState();
        if (state.activeHeading !== id) state.setActiveHeading(id);
      }),
    [],
  );

  const showEditor = booted && !showWelcome;

  return (
    <div
      className={`app ${focusMode ? 'is-focus-mode' : ''} ${booted ? 'is-booted' : 'is-booting'}`}
    >
      <TitleBar />

      <div className="workspace">
        {!focusMode && sidebarOpen && !showWelcome && <Sidebar />}

        <main className="main">
          <TabBar />
          <ConflictBanner />

          <div className="editor-stage">
            {!booted || loadingDoc ? (
              <EditorSkeleton />
            ) : showWelcome ? (
              <WelcomeScreen />
            ) : (
              <Suspense fallback={<EditorSkeleton />}>
                {mode === 'seamless' ? (
                  <CrepeEditor />
                ) : mode === 'split' ? (
                  <SplitEditor key={docSeq} dark={theme === 'dark'} />
                ) : (
                  <DualWorkspace />
                )}
              </Suspense>
            )}
          </div>

          {showEditor && mode === 'seamless' && (
            <div className="editor-hint" aria-hidden="true">
              输入 <kbd className="kbd">/</kbd> 插入内容 ·{' '}
              <kbd className="kbd">Ctrl/Cmd</kbd> + <kbd className="kbd">/</kbd> 切换视图
            </div>
          )}
        </main>
      </div>

      <StatusBar />

      {focusMode && (
        <button
          className="focus-exit"
          onClick={() => useAppStore.getState().setFocusMode(false)}
          title="退出专注模式 (Esc)"
        >
          <X size={13} />
          退出专注
        </button>
      )}

      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay__card">
            <div className="drop-overlay__icon">
              <Loader2 size={20} className="spin" />
            </div>
            <strong>松开以打开 Markdown 文件</strong>
            <span>支持 .md / .markdown / .txt</span>
          </div>
        </div>
      )}

      {paletteOpen && <CommandPalette />}
      {settingsOpen && <SettingsDialog />}
      <Toasts />
    </div>
  );
}
