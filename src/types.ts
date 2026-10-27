export type EditorMode = 'seamless' | 'split' | 'dual';
export type PaneKey = 'a' | 'b';
/** Display used inside a pane of the third mode. */
export type PaneView = 'seamless' | 'source';
export type ScrollSlot = EditorMode | 'paneA' | 'paneB';
/** A zoomable document surface: each dual pane and each half of the split view. */
export type ZoomKey = 'seamless' | 'split-source' | 'split-preview' | 'dual-a' | 'dual-b';
export type ThemePref = 'system' | 'paper' | 'snow' | 'jade' | 'ink' | 'midnight';
export type SidebarView = 'files' | 'outline';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface Settings {
  /** Bumped when defaults change in a way that must be re-applied once. */
  settingsVersion?: number;
  theme: ThemePref;
  fontFamily: 'sans' | 'serif' | 'mono';
  fontSize: number;
  contentWidth: number;
  autoSave: boolean;
  /** Idle time before autosave, in milliseconds. */
  autoSaveDelay: number;
  defaultMode: EditorMode;
  /** Restore tabs, panes and scroll position on the next launch. */
  rememberSession: boolean;
  /** Put the preview pane on the left in split mode. */
  previewLeft: boolean;
  syncScroll: boolean;
  typewriter: boolean;
  sidebarView: SidebarView;
  /** Show the recent-file list in the sidebar and welcome screen. */
  showRecent: boolean;
  spellcheck: boolean;
  /** Ask GitHub for a newer release once per launch. Off by default. */
  autoUpdateCheck: boolean;
  lastWorkspace: string | null;
}

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

export interface RecentFile {
  path: string;
  name: string;
  ts: number;
}

export interface OpenedFile {
  path: string | null;
  name: string;
  content: string;
  mtime: number | null;
}

export interface SavedFile {
  path: string | null;
  name: string;
  mtime: number | null;
}

export interface WorkspaceInfo {
  root: string;
  name: string;
}

export interface FsChangeEvent {
  path: string;
  kind: 'modify' | 'create' | 'remove' | 'rename';
}

export interface ConflictInfo {
  path: string;
  at: number;
}

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
  /** Optional inline button; a toast with one stays up longer. */
  action?: { label: string; run: () => void };
}

export interface OutlineItem {
  level: number;
  text: string;
  line: number;
  id: string;
}

export interface DocStats {
  words: number;
  chars: number;
  cjk: number;
  readingMinutes: number;
}

export interface ScrollTarget {
  /** Heading id (preferred) or null */
  anchor: string | null;
  /** Source line of the anchor, when known. */
  line?: number;
  /** 0..1 fallback ratio */
  ratio: number;
  /** which editor produced it */
  from: EditorMode;
}

export interface DocState {
  path: string | null;
  name: string;
  content: string;
  savedContent: string;
  mtime: number | null;
}

export interface TabState extends DocState {
  id: string;
  /** Preferred display when this tab is first assigned to a dual pane. */
  view: PaneView;
  /** Scroll ratios per layout, used by session restore. */
  scroll: Partial<Record<ScrollSlot, number>>;
}

export interface PaneState {
  tabId: string | null;
  view: PaneView;
}

export interface SessionState {
  version: 2;
  tabs: TabState[];
  activeTabId: string | null;
  mode: EditorMode;
  paneA: PaneState;
  paneB: PaneState;
  activePane: PaneKey;
  splitLayout: 'columns' | 'rows';
  splitRatio: number;
  sidebarOpen: boolean;
  sidebarView: SidebarView;
  workspace: string | null;
}

export interface Backend {
  kind: 'tauri' | 'web';
  pickOpenFile(): Promise<OpenedFile | null>;
  openPath(path: string): Promise<OpenedFile>;
  saveText(path: string | null, content: string, suggestedName: string): Promise<SavedFile | null>;
  pickWorkspace(): Promise<WorkspaceInfo | null>;
  listTree(root: string): Promise<FileNode[]>;
  watch(paths: string[]): Promise<void>;
  unwatch(): Promise<void>;
  onFsChange(handler: (event: FsChangeEvent) => void): () => void;
  exportHtml(html: string, suggestedName: string): Promise<string | null>;
  saveImage(docPath: string | null, fileName: string, bytes: Uint8Array): Promise<string | null>;
  /** Map a markdown image reference to something the webview can display. */
  resolveImageSrc(docPath: string | null, src: string): string;
  loadSettings(): Promise<Partial<Settings> | null>;
  saveSettings(settings: Settings): Promise<void>;
  loadRecent(): Promise<RecentFile[]>;
  saveRecent(recent: RecentFile[]): Promise<void>;
  loadSession(): Promise<SessionState | null>;
  saveSession(session: SessionState): Promise<void>;
  clearSession(): Promise<void>;
  renamePath(oldPath: string, newPath: string): Promise<void>;
  openExternal(url: string): Promise<void>;
}
