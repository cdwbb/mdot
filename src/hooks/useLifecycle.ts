import { useEffect, useRef } from 'react';
import { confirm as nativeConfirm } from '@tauri-apps/plugin-dialog';
import { useAppStore, DEFAULT_SETTINGS, SETTINGS_VERSION } from '../store/useAppStore';
import { backend, isDesktop } from '../services/backend';
import { detectPlatform } from '../services/platform';
import {
  openPath,
  refreshTree,
  restoreWorkspace,
  saveAllDirty,
  wasWrittenRecently,
} from '../app/actions';
import { debounce } from '../utils/debounce';
import type { ResolvedTheme } from './useResolvedTheme';
import { normalizeThemePref, resolvePalette } from '../theme';

const refreshTreeDebounced = debounce(() => {
  if (useAppStore.getState().workspace) void refreshTree(true);
}, 700);

const normalize = (path: string): string => path.replace(/\\/g, '/').toLowerCase();

let windowPromise: Promise<import('@tauri-apps/api/window').Window> | null = null;
function currentWindow() {
  windowPromise ??= import('@tauri-apps/api/window').then((mod) => mod.getCurrentWindow());
  return windowPromise;
}

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

export function useLifecycle(theme: ResolvedTheme): void {
  const settings = useAppStore((s) => s.settings);
  const booted = useAppStore((s) => s.booted);
  const doc = useAppStore((s) => s.doc);
  const recent = useAppStore((s) => s.recent);
  const workspaceRoot = useAppStore((s) => s.workspace?.root ?? null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------------------------------------------------------------- boot */
  useEffect(() => {
    useAppStore.getState().setPlatform(detectPlatform());
    let cancelled = false;

    void (async () => {
      let stored: Partial<typeof DEFAULT_SETTINGS> | null = null;
      let storedRecent: typeof recent = [];
      let session: Awaited<ReturnType<typeof backend.loadSession>> = null;
      try {
        [stored, storedRecent, session] = await Promise.all([
          backend.loadSettings(),
          backend.loadRecent(),
          backend.loadSession(),
        ]);
      } catch {
        /* first run / unreadable store */
      }
      if (cancelled) return;

      let merged = DEFAULT_SETTINGS;
      if (stored) {
        merged = { ...DEFAULT_SETTINGS, ...stored };
        if ((stored.settingsVersion ?? 1) < SETTINGS_VERSION) {
          merged.autoSave = false;
          merged.rememberSession = false;
          merged.showRecent = false;
        }
        merged.settingsVersion = SETTINGS_VERSION;
        merged.fontSize = clamp(merged.fontSize, 13, 22);
        merged.contentWidth = clamp(merged.contentWidth, 560, 980);
        merged.zoom = Math.round(clamp(merged.zoom ?? 100, 50, 200) / 10) * 10;
        if (![800, 10000, 30000, 60000, 120000, 300000].includes(merged.autoSaveDelay)) {
          merged.autoSaveDelay = 800;
        }
        merged.theme = normalizeThemePref(merged.theme);
        if (!['sans', 'serif', 'mono'].includes(merged.fontFamily)) merged.fontFamily = 'sans';
        if (!['seamless', 'split', 'dual'].includes(merged.defaultMode)) {
          merged.defaultMode = 'seamless';
        }
        useAppStore.setState({
          settings: merged,
          mode: merged.defaultMode,
          sidebarOpen: false,
          sidebarView: merged.sidebarView,
        });
      }
      if (storedRecent?.length) useAppStore.setState({ recent: storedRecent });
      if (session?.tabs?.length && merged.rememberSession !== false) {
        useAppStore.getState().restoreSession(session);
      }
      useAppStore.setState({ sidebarOpen: false });
      useAppStore.getState().setBooted(true);

      const last =
        session?.workspace || useAppStore.getState().settings.lastWorkspace;
      if (isDesktop) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const initial = await invoke<string | null>('initial_file');
          if (initial) await openPath(initial);
        } catch {
          /* no launch argument */
        }
      }
      if (last && isDesktop) void restoreWorkspace(last);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------------------------- theme + settings */
  useEffect(() => {
    const root = document.documentElement;
    const palette = resolvePalette(settings.theme, theme === 'dark');
    root.dataset.theme = theme;
    root.dataset.palette = palette;
    root.dataset.font = settings.fontFamily;
    root.dataset.platform = detectPlatform();
    root.style.setProperty('--editor-font-size', `${settings.fontSize}px`);
    root.style.setProperty('--content-width', `${settings.contentWidth}px`);
    const scale = settings.zoom / 100;
    if (isDesktop) {
      void import('@tauri-apps/api/webview')
        .then(({ getCurrentWebview }) => getCurrentWebview().setZoom(scale))
        .catch(() => {
          /* older webview without zoom support */
        });
    } else {
      // Web preview fallback; `#root` still fills the viewport at any scale.
      root.classList.toggle('ui-zoomed', scale !== 1);
      if (scale === 1) root.style.removeProperty('--ui-zoom');
      else root.style.setProperty('--ui-zoom', String(scale));
    }
    if (!useAppStore.getState().booted) return;
    const timer = setTimeout(() => {
      void backend.saveSettings(settings);
    }, 320);
    return () => clearTimeout(timer);
  }, [theme, settings]);

  /* ------------------------------------------------------ recent files */
  useEffect(() => {
    if (!booted) return;
    const timer = setTimeout(() => {
      void backend.saveRecent(recent);
    }, 400);
    return () => clearTimeout(timer);
  }, [recent, booted]);

  /* -------------------------------------------------------- window title */
  useEffect(() => {
    const clean = doc.name.replace(/\.(md|markdown|txt)$/i, '') || '未命名';
    const isDirty = doc.content !== doc.savedContent;
    const title = `${clean}${isDirty ? ' •' : ''} — mdot`;
    document.title = title;
    if (!isDesktop) return;
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      void currentWindow()
        .then((win) => win.setTitle(title))
        .catch(() => undefined);
    }, 120);
    return () => {
      if (titleTimer.current) clearTimeout(titleTimer.current);
    };
  }, [doc.name, doc.content, doc.savedContent]);

  /* -------------------------------------------------------- file watcher */
  useEffect(() => {
    if (!isDesktop) return;
    const paths = [doc.path, workspaceRoot].filter(Boolean) as string[];
    if (!paths.length) {
      void backend.unwatch().catch(() => undefined);
      return;
    }
    void backend.watch(paths).catch(() => undefined);
  }, [doc.path, workspaceRoot]);

  useEffect(() => {
    if (!isDesktop) return;

    const syncFromDisk = (path: string, onMissing?: () => void) => {
      void backend
        .openPath(path)
        .then((file) => {
          const latest = useAppStore.getState();
          if (latest.doc.path !== path) return;
          if (file.content === latest.doc.content) return;
          if (latest.doc.content !== latest.doc.savedContent) {
            latest.setConflict({ path, at: Date.now() });
            return;
          }
          latest.setDoc({
            path: file.path,
            name: file.name,
            content: file.content,
            savedContent: file.content,
            mtime: file.mtime,
          });
          latest.toast('文件已在外部更新，已重新加载', 'info');
        })
        .catch(() => onMissing?.());
    };

    const off = backend.onFsChange((event) => {
      const state = useAppStore.getState();
      const current = state.doc.path;
      const eventPath = normalize(event.path);

      if (current && eventPath === normalize(current)) {
        if (wasWrittenRecently(eventPath)) return;
        if (state.lastSavedAt && Date.now() - state.lastSavedAt < 1800) return;
        if (event.kind === 'remove') {
          // Atomic saves briefly remove the target path; only report a real loss.
          syncFromDisk(current, () => {
            const latest = useAppStore.getState();
            if (latest.doc.path !== current) return;
            latest.toast('文件已从磁盘移除，编辑器中的内容仍保留', 'error');
          });
          return;
        }
        if (state.doc.content !== state.doc.savedContent) {
          state.setConflict({ path: current, at: Date.now() });
          return;
        }
        syncFromDisk(current);
        return;
      }

      if (state.workspace) {
        const root = normalize(state.workspace.root);
        if (eventPath.startsWith(root)) refreshTreeDebounced();
      }
    });
    return off;
  }, []);

  /* ------------------------------------------------ early splash window */
  useEffect(() => {
    if (!isDesktop) return;
    // The HTML splash is already painted when React mounts; show it before the
    // settings/file bootstrap finishes so the window does not stay invisible.
    void currentWindow()
      .then((win) => win.show())
      .catch(() => undefined);
  }, []);

  /* ------------------------------------------------ second instance file */
  useEffect(() => {
    if (!isDesktop) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<string>('mdot:open-file', (event) => {
          if (event.payload) void openPath(event.payload);
        }),
      )
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  /* ---------------------------------------------------- splash + window */
  useEffect(() => {
    if (!booted) return;
    const splash = document.getElementById('splash');
    if (splash) {
      splash.classList.add('is-hidden');
      setTimeout(() => splash.remove(), 260);
    }
    if (isDesktop) {
      void currentWindow()
        .then((win) => win.show())
        .catch(() => undefined);
    }
  }, [booted]);

  /* --------------------------------------------------- close protection */
  useEffect(() => {
    if (!isDesktop) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    let closing = false;
    void (async () => {
      try {
        const win = await currentWindow();
        unlisten = await win.onCloseRequested(async (event) => {
          const state = useAppStore.getState();
          if (!state.tabs.length) return;
          event.preventDefault();
          if (closing) return;
          closing = true;

          try {
            await saveAllDirty();
            const latest = useAppStore.getState();
            const unsaved = latest.tabs.filter(
              (tab) => tab.content !== tab.savedContent,
            );

            if (latest.settings.rememberSession) {
              try {
                await backend.saveSession(latest.sessionSnapshot());
              } catch {
                const quit = await nativeConfirm(
                  '会话保存失败，未保存的文档可能丢失。仍要退出吗？',
                  { title: 'Mdot', kind: 'warning' },
                );
                if (!quit) return;
              }
            } else if (unsaved.length) {
              const names = unsaved.map((tab) => tab.name).join('、');
              const quit = await nativeConfirm(
                `“${names}”尚未保存，关闭后将丢失。仍要退出吗？`,
                { title: 'Mdot', kind: 'warning' },
              );
              if (!quit) return;
            }

            await win.destroy();
          } catch {
            useAppStore
              .getState()
              .toast('退出时发生错误，请保存后重试', 'error');
          } finally {
            if (!cancelled) closing = false;
          }
        });
        if (cancelled) unlisten?.();
      } catch {
        /* window API unavailable */
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
