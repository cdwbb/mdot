import { create } from 'zustand';
import type {
  ConflictInfo,
  DocState,
  EditorMode,
  FileNode,
  OutlineItem,
  PaneKey,
  PaneState,
  PaneView,
  RecentFile,
  SaveState,
  ScrollSlot,
  SessionState,
  Settings,
  SidebarView,
  TabState,
  Toast,
  WorkspaceInfo,
} from '../types';

export const SETTINGS_VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  settingsVersion: SETTINGS_VERSION,
  theme: 'system',
  fontFamily: 'serif',
  fontSize: 17,
  contentWidth: 720,
  autoSave: false,
  autoSaveDelay: 800,
  defaultMode: 'seamless',
  rememberSession: false,
  previewLeft: false,
  syncScroll: true,
  typewriter: false,
  sidebarView: 'files',
  showRecent: false,
  spellcheck: false,
  lastWorkspace: null,
};

const emptyDoc = (): DocState => ({
  path: null,
  name: '未命名',
  content: '',
  savedContent: '',
  mtime: null,
});

const emptyPane = (view: PaneView = 'seamless'): PaneState => ({
  tabId: null,
  view,
});

const asDoc = (tab: DocState): DocState => ({
  path: tab.path,
  name: tab.name,
  content: tab.content,
  savedContent: tab.savedContent,
  mtime: tab.mtime,
});

let tabSeq = 0;
const newTabId = (): string => `tab-${Date.now().toString(36)}-${++tabSeq}`;

const asTab = (doc: DocState, view: PaneView, id = newTabId()): TabState => ({
  id,
  path: doc.path,
  name: doc.name,
  content: doc.content,
  savedContent: doc.savedContent,
  mtime: doc.mtime,
  view,
  scroll: {},
});

interface OpenTabOptions {
  activate?: boolean;
  pane?: PaneKey;
  view?: PaneView;
  id?: string;
}

interface AppState {
  booted: boolean;
  doc: DocState;
  tabs: TabState[];
  activeTabId: string | null;
  /** Bumped whenever the document must be replaced inside an editor. */
  docSeq: number;
  mode: EditorMode;
  paneA: PaneState;
  paneB: PaneState;
  activePane: PaneKey;
  splitLayout: 'columns' | 'rows';
  splitRatio: number;
  settings: Settings;
  sidebarOpen: boolean;
  sidebarView: SidebarView;
  workspace: WorkspaceInfo | null;
  tree: FileNode[];
  treeLoading: boolean;
  recent: RecentFile[];
  outline: OutlineItem[];
  activeHeading: string | null;
  showWelcome: boolean;
  loadingDoc: boolean;
  saveState: SaveState;
  lastSavedAt: number | null;
  pendingSavePath: string | null;
  paletteOpen: boolean;
  settingsOpen: boolean;
  conflict: ConflictInfo | null;
  focusMode: boolean;
  toasts: Toast[];
  platform: 'windows' | 'mac' | 'web';
  cursorLine: number;
  cursorColumn: number;

  setBooted(booted: boolean): void;
  openTab(doc: DocState, options?: OpenTabOptions): string;
  activateTab(id: string, pane?: PaneKey): void;
  closeTab(id: string): void;
  renameTab(id: string, name: string, path?: string | null): void;
  setDoc(doc: DocState): void;
  setContent(content: string): void;
  updateTabContent(tabId: string, content: string): void;
  setSavedState(path: string | null, name: string, content: string, mtime: number | null): void;
  updateTabSaved(
    tabId: string,
    saved: { path: string | null; name: string; mtime: number | null },
    content: string,
  ): void;
  setShowWelcome(show: boolean): void;
  setMode(mode: EditorMode): void;
  setPaneTab(pane: PaneKey, tabId: string): void;
  setPaneView(pane: PaneKey, view: PaneView): void;
  setActivePane(pane: PaneKey): void;
  swapPanes(): void;
  setSplitLayout(layout: 'columns' | 'rows'): void;
  setSplitRatio(ratio: number): void;
  setTabScroll(tabId: string, slot: ScrollSlot, ratio: number): void;
  sessionSnapshot(): SessionState;
  restoreSession(session: SessionState): void;
  patchSettings(patch: Partial<Settings>): void;
  setSidebarOpen(open: boolean): void;
  setSidebarView(view: SidebarView): void;
  setWorkspace(workspace: WorkspaceInfo | null): void;
  setTree(tree: FileNode[]): void;
  setTreeLoading(loading: boolean): void;
  setRecent(recent: RecentFile[]): void;
  pushRecent(entry: RecentFile): void;
  setOutline(outline: OutlineItem[]): void;
  setActiveHeading(id: string | null): void;
  setLoadingDoc(loading: boolean): void;
  setSaveState(state: SaveState): void;
  markSaved(at: number): void;
  setPaletteOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  setConflict(conflict: ConflictInfo | null): void;
  setFocusMode(on: boolean): void;
  setPlatform(platform: 'windows' | 'mac' | 'web'): void;
  setCursorPosition(line: number, column: number): void;
  toast(message: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
}

let toastId = 0;
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();

function choosePaneTab(
  tabs: TabState[],
  paneA: PaneState,
  paneB: PaneState,
  activePane: PaneKey,
): { activeTabId: string | null; doc: DocState } {
  const pane = activePane === 'a' ? paneA : paneB;
  const tab = tabs.find((item) => item.id === pane.tabId) || tabs[0] || null;
  return {
    activeTabId: tab ? tab.id : null,
    doc: tab ? asDoc(tab) : emptyDoc(),
  };
}

export const useAppStore = create<AppState>()((set, get) => ({
  booted: false,
  doc: emptyDoc(),
  tabs: [],
  activeTabId: null,
  docSeq: 0,
  mode: DEFAULT_SETTINGS.defaultMode,
  paneA: emptyPane('seamless'),
  paneB: emptyPane('source'),
  activePane: 'a',
  splitLayout: 'columns',
  splitRatio: 50,
  settings: DEFAULT_SETTINGS,
  sidebarOpen: false,
  sidebarView: 'files',
  workspace: null,
  tree: [],
  treeLoading: false,
  recent: [],
  outline: [],
  activeHeading: null,
  showWelcome: true,
  loadingDoc: false,
  saveState: 'idle',
  lastSavedAt: null,
  pendingSavePath: null,
  paletteOpen: false,
  settingsOpen: false,
  conflict: null,
  focusMode: false,
  toasts: [],
  platform: 'web',
  cursorLine: 1,
  cursorColumn: 1,

  setBooted: (booted) => set({ booted }),

  openTab: (doc, options = {}) => {
    const initialView =
      options.view || (get().mode === 'split' ? 'source' : 'seamless');
    const candidateId = options.id || newTabId();
    let resultId = candidateId;

    set((s) => {
      const normalizedPath = doc.path ? doc.path.toLowerCase() : null;
      const existing = normalizedPath
        ? s.tabs.find((tab) => tab.path && tab.path.toLowerCase() === normalizedPath)
        : null;
      let tabs = s.tabs;
      let tab: TabState;

      if (existing) {
        tab = existing;
        resultId = existing.id;
        if (existing.content === existing.savedContent) {
          tabs = s.tabs.map((item) =>
            item.id === existing.id
              ? { ...item, ...doc, id: item.id, view: item.view, scroll: item.scroll }
              : item,
          );
          tab = tabs.find((item) => item.id === existing.id) as TabState;
        }
      } else {
        tab = asTab(doc, initialView, candidateId);
        tabs = [...s.tabs, tab];
      }

      let paneA = s.paneA;
      let paneB = s.paneB;
      const targetPane = options.pane || (s.mode === 'dual' ? s.activePane : undefined);
      if (targetPane === 'a') {
        paneA = { ...paneA, tabId: tab.id, view: paneA.tabId ? paneA.view : tab.view };
      }
      if (targetPane === 'b') {
        paneB = { ...paneB, tabId: tab.id, view: paneB.tabId ? paneB.view : tab.view };
      }
      if (s.mode !== 'dual') {
        paneA = { ...paneA, tabId: tab.id, view: paneA.tabId ? paneA.view : tab.view };
      }
      if (!paneB.tabId && tabs.length > 1) {
        const second = tabs.find((item) => item.id !== tab.id);
        if (second) paneB = { ...paneB, tabId: second.id, view: second.view };
      }

      const activate = options.activate !== false;
      const activeTabId = activate ? tab.id : s.activeTabId;
      const activeTab = tabs.find((item) => item.id === activeTabId) || tab;
      const activeDoc = activeTab ? asDoc(activeTab) : emptyDoc();
      const activePane = targetPane || s.activePane;

      return {
        tabs,
        activeTabId: activeTabId || tab.id,
        doc: activeDoc,
        docSeq: s.docSeq + 1,
        showWelcome: false,
        paneA,
        paneB,
        activePane,
        saveState: 'idle',
        conflict: null,
      };
    });

    return resultId;
  },

  activateTab: (id, pane) => {
    set((s) => {
      const tab = s.tabs.find((item) => item.id === id);
      if (!tab) return {};
      const tabs = s.tabs.map((item) =>
        item.id === s.activeTabId
          ? {
              ...item,
              content: s.doc.content,
              savedContent: s.doc.savedContent,
              path: s.doc.path,
              name: s.doc.name,
              mtime: s.doc.mtime,
            }
          : item,
      );
      const target = pane || (s.mode === 'dual' ? s.activePane : 'a');
      let paneA = s.paneA;
      let paneB = s.paneB;
      if (target === 'a') {
        paneA = { ...paneA, tabId: id, view: paneA.tabId ? paneA.view : tab.view };
      } else {
        paneB = { ...paneB, tabId: id, view: paneB.tabId ? paneB.view : tab.view };
      }
      const fresh = tabs.find((item) => item.id === id) as TabState;
      return {
        tabs,
        activeTabId: id,
        doc: asDoc(fresh),
        docSeq: s.docSeq + 1,
        showWelcome: false,
        paneA,
        paneB,
        activePane: target,
        saveState: 'idle',
        conflict: null,
      };
    });
  },

  closeTab: (id) => {
    set((s) => {
      const index = s.tabs.findIndex((item) => item.id === id);
      if (index < 0) return {};
      const tabs = s.tabs.filter((item) => item.id !== id);
      let paneA = s.paneA;
      let paneB = s.paneB;
      if (paneA.tabId === id) {
        const next = tabs[Math.min(index, tabs.length - 1)] || tabs[0];
        paneA = { ...paneA, tabId: next ? next.id : null };
      }
      if (paneB.tabId === id) {
        const next =
          tabs.find((item) => item.id !== paneA.tabId) || tabs[0] || null;
        paneB = { ...paneB, tabId: next ? next.id : null };
      }
      if (!tabs.length) {
        return {
          tabs,
          activeTabId: null,
          doc: emptyDoc(),
          docSeq: s.docSeq + 1,
          showWelcome: true,
          paneA: emptyPane('seamless'),
          paneB: emptyPane('source'),
        };
      }
      let nextActiveId = s.activeTabId;
      if (nextActiveId === id) {
        const next = tabs[Math.min(index, tabs.length - 1)] || tabs[0];
        nextActiveId = next ? next.id : null;
      }
      if (s.mode === 'dual') {
        const pane = s.activePane === 'a' ? paneA : paneB;
        nextActiveId = pane.tabId || nextActiveId;
      }
      const activeTab = tabs.find((item) => item.id === nextActiveId) || tabs[0];
      return {
        tabs,
        activeTabId: activeTab ? activeTab.id : null,
        doc: activeTab ? asDoc(activeTab) : emptyDoc(),
        docSeq: s.docSeq + 1,
        showWelcome: false,
        paneA,
        paneB,
        saveState: 'idle',
      };
    });
  },

  renameTab: (id, name, path) => {
    set((s) => {
      const tabs = s.tabs.map((item) =>
        item.id === id
          ? {
              ...item,
              name,
              ...(path !== undefined ? { path } : {}),
            }
          : item,
      );
      const active = s.activeTabId === id;
      return {
        tabs,
        ...(active
          ? {
              doc: {
                ...s.doc,
                name,
                ...(path !== undefined ? { path } : {}),
              },
            }
          : {}),
      };
    });
  },

  setDoc: (doc) => {
    set((s) => {
      if (!s.activeTabId) {
        return {
          doc,
          showWelcome: false,
        };
      }
      const tabs = s.tabs.map((item) =>
        item.id === s.activeTabId
          ? {
              ...item,
              path: doc.path,
              name: doc.name,
              content: doc.content,
              savedContent: doc.savedContent,
              mtime: doc.mtime,
            }
          : item,
      );
      return {
        tabs,
        doc,
        docSeq: s.docSeq + 1,
        showWelcome: false,
        saveState: 'idle',
        conflict: null,
      };
    });
  },

  setContent: (content) =>
    set((s) => ({
      doc: { ...s.doc, content },
      tabs: s.tabs.map((item) =>
        item.id === s.activeTabId ? { ...item, content } : item,
      ),
      saveState: s.saveState === 'saved' ? 'idle' : s.saveState,
    })),

  updateTabContent: (tabId, content) =>
    set((s) => {
      const tabs = s.tabs.map((item) =>
        item.id === tabId ? { ...item, content } : item,
      );
      if (s.activeTabId !== tabId) return { tabs };
      return {
        tabs,
        doc: { ...s.doc, content },
        saveState: s.saveState === 'saved' ? 'idle' : s.saveState,
      };
    }),

  setSavedState: (path, name, content, mtime) =>
    set((s) => ({
      doc: { ...s.doc, path, name, content, savedContent: content, mtime },
      tabs: s.tabs.map((item) =>
        item.id === s.activeTabId
          ? { ...item, path, name, content, savedContent: content, mtime }
          : item,
      ),
      saveState: 'idle',
      conflict: null,
    })),

  updateTabSaved: (tabId, saved, content) =>
    set((s) => {
      const apply = (item: TabState): TabState =>
        item.id === tabId
          ? {
              ...item,
              path: saved.path,
              name: saved.name,
              content,
              savedContent: content,
              mtime: saved.mtime,
            }
          : item;
      const tabs = s.tabs.map(apply);
      if (s.activeTabId !== tabId) return { tabs };
      return {
        tabs,
        doc: {
          ...s.doc,
          path: saved.path,
          name: saved.name,
          content,
          savedContent: content,
          mtime: saved.mtime,
        },
        saveState: 'idle',
        conflict: null,
      };
    }),

  setShowWelcome: (showWelcome) =>
    set((s) =>
      showWelcome
        ? { showWelcome: true, activeTabId: null, doc: emptyDoc() }
        : { showWelcome: false, ...(s.tabs.length ? {} : {}) },
    ),

  setMode: (mode) => {
    set((s) => {
      if (mode === s.mode) return {};
      if (mode === 'dual') {
        let paneA = s.paneA;
        let paneB = s.paneB;
        const activeTab =
          s.tabs.find((item) => item.id === s.activeTabId) || s.tabs[0] || null;
        if (!paneA.tabId) {
          paneA = {
            ...paneA,
            tabId: activeTab ? activeTab.id : null,
            view: activeTab ? activeTab.view : paneA.view,
          };
        }
        if (!paneB.tabId) {
          const other =
            s.tabs.find((item) => item.id !== paneA.tabId) || activeTab;
          if (other) {
            paneB = {
              ...paneB,
              tabId: other.id,
              view: other.view,
            };
          }
        }
        const active = choosePaneTab(s.tabs, paneA, paneB, s.activePane);
        return {
          mode,
          paneA,
          paneB,
          activeTabId: active.activeTabId,
          doc: active.doc,
          docSeq: s.docSeq + 1,
          showWelcome: !s.tabs.length,
        };
      }
      const pane = s.activePane === 'a' ? s.paneA : s.paneB;
      const tab =
        s.tabs.find((item) => item.id === pane.tabId) ||
        s.tabs.find((item) => item.id === s.activeTabId) ||
        s.tabs[0] ||
        null;
      return {
        mode,
        activeTabId: tab ? tab.id : null,
        doc: tab ? asDoc(tab) : emptyDoc(),
        docSeq: s.docSeq + 1,
        showWelcome: !s.tabs.length,
      };
    });
  },

  setPaneTab: (pane, tabId) => {
    set((s) => {
      const tab = s.tabs.find((item) => item.id === tabId);
      if (!tab) return {};
      const paneA = pane === 'a' ? { ...s.paneA, tabId, view: tab.view } : s.paneA;
      const paneB = pane === 'b' ? { ...s.paneB, tabId, view: tab.view } : s.paneB;
      const active = s.activePane === pane;
      return {
        paneA,
        paneB,
        ...(active
          ? {
              activeTabId: tabId,
              doc: asDoc(tab),
              docSeq: s.docSeq + 1,
              saveState: 'idle',
              conflict: null,
            }
          : {}),
      };
    });
  },

  setPaneView: (pane, view) => {
    set((s) => {
      const paneA = pane === 'a' ? { ...s.paneA, view } : s.paneA;
      const paneB = pane === 'b' ? { ...s.paneB, view } : s.paneB;
      const tabId = pane === 'a' ? s.paneA.tabId : s.paneB.tabId;
      const tabs = s.tabs.map((item) =>
        item.id === tabId ? { ...item, view } : item,
      );
      return { paneA, paneB, tabs };
    });
  },

  setActivePane: (activePane) => {
    set((s) => {
      if (s.mode !== 'dual') return { activePane };
      const active = choosePaneTab(s.tabs, s.paneA, s.paneB, activePane);
      return {
        activePane,
        activeTabId: active.activeTabId,
        doc: active.doc,
        saveState: 'idle',
        conflict: null,
      };
    });
  },

  swapPanes: () => {
    set((s) => {
      const paneA = s.paneB;
      const paneB = s.paneA;
      const active = choosePaneTab(s.tabs, paneA, paneB, s.activePane);
      return {
        paneA,
        paneB,
        activeTabId: active.activeTabId,
        doc: active.doc,
        docSeq: s.docSeq + 1,
      };
    });
  },

  setSplitLayout: (splitLayout) => set({ splitLayout }),

  setSplitRatio: (ratio) =>
    set({ splitRatio: Math.min(76, Math.max(24, ratio)) }),

  setTabScroll: (tabId, slot, ratio) =>
    set((s) => ({
      tabs: s.tabs.map((item) =>
        item.id === tabId
          ? {
              ...item,
              scroll: { ...item.scroll, [slot]: Math.min(1, Math.max(0, ratio)) },
            }
          : item,
      ),
    })),

  sessionSnapshot: () => {
    const s = get();
    const tabs = s.tabs.map((item) =>
      item.id === s.activeTabId
        ? {
            ...item,
            path: s.doc.path,
            name: s.doc.name,
            content: s.doc.content,
            savedContent: s.doc.savedContent,
            mtime: s.doc.mtime,
          }
        : item,
    );
    return {
      version: 2,
      tabs,
      activeTabId: s.activeTabId,
      mode: s.mode,
      paneA: s.paneA,
      paneB: s.paneB,
      activePane: s.activePane,
      splitLayout: s.splitLayout,
      splitRatio: s.splitRatio,
      sidebarOpen: s.sidebarOpen,
      sidebarView: s.sidebarView,
      workspace: s.workspace ? s.workspace.root : null,
    };
  },

  restoreSession: (session) => {
    set((s) => {
      const tabs = (session.tabs || [])
        .filter((item) => item && typeof item.content === 'string')
        .map((item) => ({
          ...item,
          id: item.id || newTabId(),
          view: item.view === 'source' ? ('source' as const) : ('seamless' as const),
          scroll: item.scroll || {},
        }));
      if (!tabs.length) {
        return {
          tabs: [],
          activeTabId: null,
          doc: emptyDoc(),
          showWelcome: true,
          mode: session.mode || s.mode,
          paneA: session.paneA || emptyPane('seamless'),
          paneB: session.paneB || emptyPane('source'),
          activePane: session.activePane || 'a',
          splitLayout: session.splitLayout || 'columns',
          splitRatio: Number.isFinite(session.splitRatio) ? session.splitRatio : 50,
          sidebarOpen: session.sidebarOpen !== false,
          sidebarView: session.sidebarView || 'files',
        };
      }
      const paneA = {
        ...(session.paneA || emptyPane('seamless')),
        tabId:
          tabs.find((item) => item.id === session.paneA?.tabId)?.id ||
          tabs[0].id,
      };
      const paneB = {
        ...(session.paneB || emptyPane('source')),
        tabId:
          tabs.find((item) => item.id === session.paneB?.tabId)?.id ||
          tabs.find((item) => item.id !== paneA.tabId)?.id ||
          paneA.tabId,
      };
      const activePane = session.activePane === 'b' ? 'b' : 'a';
      const activePaneState = activePane === 'a' ? paneA : paneB;
      const activeTab =
        tabs.find((item) => item.id === session.activeTabId) ||
        tabs.find((item) => item.id === activePaneState.tabId) ||
        tabs[0];
      return {
        tabs,
        activeTabId: activeTab.id,
        doc: asDoc(activeTab),
        docSeq: s.docSeq + 1,
        showWelcome: false,
        mode: session.mode || s.mode,
        paneA,
        paneB,
        activePane,
        splitLayout: session.splitLayout || 'columns',
        splitRatio: Number.isFinite(session.splitRatio) ? session.splitRatio : 50,
        sidebarOpen: session.sidebarOpen !== false,
        sidebarView: session.sidebarView || 'files',
        saveState: 'idle',
      };
    });
  },

  patchSettings: (patch) =>
    set((s) => ({ settings: { ...s.settings, ...patch } })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarView: (view) => set({ sidebarView: view }),
  setWorkspace: (workspace) => set({ workspace }),
  setTree: (tree) => set({ tree }),
  setTreeLoading: (loading) => set({ treeLoading: loading }),

  setRecent: (recent) => set({ recent }),
  pushRecent: (entry) =>
    set((s) => {
      const rest = s.recent.filter((r) => r.path !== entry.path);
      return { recent: [entry, ...rest].slice(0, 12) };
    }),

  setOutline: (outline) => set({ outline }),
  setActiveHeading: (id) => set({ activeHeading: id }),
  setLoadingDoc: (loading) => set({ loadingDoc: loading }),
  setSaveState: (saveState) => set({ saveState }),
  markSaved: (at) => set({ lastSavedAt: at, saveState: 'saved' }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setConflict: (conflict) => set({ conflict }),
  setFocusMode: (on) => set({ focusMode: on }),
  setPlatform: (platform) => set({ platform }),
  setCursorPosition: (line, column) =>
    set({ cursorLine: line, cursorColumn: Math.max(1, column) }),

  toast: (message, kind = 'info') => {
    const id = ++toastId;
    const state = get();
    if (state.toasts.length >= 4) {
      const [first, ...rest] = state.toasts;
      const timer = toastTimers.get(first.id);
      if (timer) clearTimeout(timer);
      toastTimers.delete(first.id);
      set({ toasts: rest });
    }
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    const timer = setTimeout(() => {
      toastTimers.delete(id);
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, kind === 'error' ? 5200 : 2800);
    toastTimers.set(id, timer);
  },

  dismissToast: (id) => {
    const timer = toastTimers.get(id);
    if (timer) clearTimeout(timer);
    toastTimers.delete(id);
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export const selectDirty = (s: AppState) => s.doc.content !== s.doc.savedContent;
