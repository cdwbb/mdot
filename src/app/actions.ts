import { useAppStore } from '../store/useAppStore';
import { backend, isDesktop } from '../services/backend';
import { getSample } from '../content/samples';
import { deriveTitle } from '../utils/markdown';
import { clearPendingScroll } from '../editor/modeSwitch';
import type { OpenedFile, PaneKey, TabState } from '../types';

const savingIds = new Set<string>();

const normalizePath = (path: string): string => path.replace(/\\/g, '/').toLowerCase();

/** Saves rewrite files atomically (temp + rename), so the watcher reports
 * remove/create for paths we just wrote. Ignore those echoes for a short while. */
const writeGuardMs = 4000;
const recentWrites = new Map<string, number>();

export function markWrite(path: string): void {
  const now = Date.now();
  recentWrites.set(normalizePath(path), now);
  if (recentWrites.size <= 32) return;
  for (const [key, at] of recentWrites) {
    if (now - at > writeGuardMs) recentWrites.delete(key);
  }
}

export function wasWrittenRecently(path: string): boolean {
  const at = recentWrites.get(normalizePath(path));
  return at !== undefined && Date.now() - at < writeGuardMs;
}

const tabDirty = (tab: TabState | null | undefined): boolean =>
  !!tab && tab.content !== tab.savedContent;

export function isDirty(): boolean {
  const state = useAppStore.getState();
  return tabDirty(state.tabs.find((tab) => tab.id === state.activeTabId));
}

function sanitizeFileName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || '未命名'
  );
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function dirName(path: string): string {
  return path.replace(/[\\/][^\\/]*$/, '');
}

function extension(path: string): string {
  const match = /\.[^./\\]+$/.exec(path);
  return match ? match[0] : '';
}

function suggestedName(tab?: TabState | null): string {
  const state = useAppStore.getState();
  const target = tab || state.tabs.find((item) => item.id === state.activeTabId);
  if (target?.name && target.name !== '未命名') {
    return /\.(md|markdown|txt)$/i.test(target.name) ? target.name : `${target.name}.md`;
  }
  const content = target?.content ?? state.doc.content;
  return `${sanitizeFileName(deriveTitle(content))}.md`;
}

function acceptOpened(file: OpenedFile, pane?: PaneKey): void {
  const state = useAppStore.getState();
  clearPendingScroll();
  state.openTab(
    {
      path: file.path,
      name: file.name,
      content: file.content,
      savedContent: file.content,
      mtime: file.mtime,
    },
    { pane },
  );
  if (file.path) {
    state.pushRecent({ path: file.path, name: file.name, ts: Date.now() });
  }
  useAppStore.setState({ saveState: 'idle' });
}

export function showWelcome(): void {
  useAppStore.getState().setShowWelcome(true);
}

export function closeDocument(): void {
  const state = useAppStore.getState();
  if (!state.activeTabId) return;
  closeTab(state.activeTabId);
}

export function closeTab(tabId: string): void {
  const state = useAppStore.getState();
  const tab = state.tabs.find((item) => item.id === tabId);
  if (!tab) return;
  if (tabDirty(tab) && !window.confirm(`“${tab.name}”还有未保存的修改，确定关闭吗？`)) {
    return;
  }
  state.closeTab(tabId);
}

export function newDocument(): void {
  clearPendingScroll();
  useAppStore.getState().openTab(
    {
      path: null,
      name: '未命名.md',
      content: '',
      savedContent: '',
      mtime: null,
    },
    { view: 'seamless' },
  );
}

export async function openFileDialog(pane?: PaneKey): Promise<void> {
  try {
    const file = await backend.pickOpenFile();
    if (!file) return;
    acceptOpened(file, pane);
    useAppStore.getState().toast(`已打开 ${file.name}`, 'success');
  } catch (error) {
    useAppStore.getState().toast(`打开失败：${describe(error)}`, 'error');
  }
}

export async function openPath(path: string, pane?: PaneKey): Promise<void> {
  const state = useAppStore.getState();
  const exists = state.tabs.find(
    (tab) => tab.path && tab.path.toLowerCase() === path.toLowerCase(),
  );
  if (exists) {
    state.activateTab(exists.id, pane);
    return;
  }
  state.setLoadingDoc(true);
  try {
    const file = await backend.openPath(path);
    acceptOpened(file, pane);
  } catch (error) {
    state.toast(`打开失败：${describe(error)}`, 'error');
  } finally {
    useAppStore.getState().setLoadingDoc(false);
  }
}

export async function openDroppedFile(file: File): Promise<void> {
  try {
    const content = await file.text();
    acceptOpened({ path: null, name: file.name, content, mtime: file.lastModified || null });
    useAppStore.getState().toast(
      `已载入 ${file.name}（浏览器模式，保存时需另选位置）`,
      'success',
    );
  } catch (error) {
    useAppStore.getState().toast(`读取失败：${describe(error)}`, 'error');
  }
}

export async function openSample(id: string): Promise<void> {
  const sample = getSample(id);
  if (!sample) return;
  clearPendingScroll();
  useAppStore.getState().openTab(
    {
      path: null,
      name: sample.fileName,
      content: sample.content,
      savedContent: sample.content,
      mtime: null,
    },
    { view: 'seamless' },
  );
  useAppStore.getState().toast('示例已载入，可直接编辑；保存时请另存为', 'info');
}

export async function saveTab(tabId: string, forceSaveAs = false): Promise<boolean> {
  const state = useAppStore.getState();
  const tab = state.tabs.find((item) => item.id === tabId);
  if (!tab || savingIds.has(tabId)) return false;
  savingIds.add(tabId);
  if (state.activeTabId === tabId) state.setSaveState('saving');
  try {
    const target = forceSaveAs ? null : tab.path;
    const content = state.activeTabId === tabId ? state.doc.content : tab.content;
    if (target) markWrite(target);
    const saved = await backend.saveText(target, content, suggestedName(tab));
    if (!saved) {
      if (state.activeTabId === tabId) {
        state.setSaveState(content === tab.savedContent ? 'saved' : 'idle');
      }
      return false;
    }
    if (saved.path) markWrite(saved.path);
    state.updateTabSaved(tabId, saved, content);
    if (state.activeTabId === tabId) state.markSaved(Date.now());
    if (saved.path) {
      state.pushRecent({ path: saved.path, name: saved.name, ts: Date.now() });
      const workspace = state.workspace;
      if (workspace && saved.path.startsWith(workspace.root)) {
        void refreshTree(true);
      }
    }
    return true;
  } catch (error) {
    if (state.activeTabId === tabId) state.setSaveState('error');
    state.toast(`保存失败：${describe(error)}`, 'error');
    return false;
  } finally {
    savingIds.delete(tabId);
  }
}

export async function saveDocument(forceSaveAs = false): Promise<boolean> {
  const state = useAppStore.getState();
  if (!state.activeTabId) return false;
  return saveTab(state.activeTabId, forceSaveAs);
}

export async function saveAllDirty(): Promise<boolean> {
  const state = useAppStore.getState();
  const dirtyTabs = state.tabs.filter(
    (tab) => tab.path && tab.content !== tab.savedContent,
  );
  let ok = true;
  for (const tab of dirtyTabs) {
    if (!(await saveTab(tab.id))) ok = false;
  }
  return ok;
}

export async function exportHtml(): Promise<void> {
  const state = useAppStore.getState();
  const tab = state.tabs.find((item) => item.id === state.activeTabId);
  const markdown = state.activeTabId === tab?.id ? state.doc.content : tab?.content;
  if (!tab || !markdown?.trim()) {
    state.toast('文档为空，没有可导出的内容', 'info');
    return;
  }
  try {
    const title =
      tab.name.replace(/\.(md|markdown|txt)$/i, '') ||
      deriveTitle(markdown) ||
      'mdot 文档';
    const { buildExportHtml } = await import('../services/exportHtml');
    const html = await buildExportHtml({
      markdown,
      title,
      docPath: tab.path,
      resolveImage: (src) => backend.resolveImageSrc(tab.path, src),
    });
    const target = await backend.exportHtml(html, tab.name);
    if (target) state.toast(`已导出 HTML：${target}`, 'success');
  } catch (error) {
    state.toast(`导出失败：${describe(error)}`, 'error');
  }
}

export function printDocument(): void {
  useAppStore.getState().setSettingsOpen(false);
  useAppStore.getState().setPaletteOpen(false);
  window.setTimeout(() => window.print(), 60);
}

export async function openWorkspaceDialog(): Promise<void> {
  const state = useAppStore.getState();
  try {
    const workspace = await backend.pickWorkspace();
    if (!workspace) {
      if (!isDesktop) {
        state.toast('浏览器演示版不支持文件夹工作区，请使用桌面版', 'info');
      }
      return;
    }
    state.setWorkspace(workspace);
    state.patchSettings({ lastWorkspace: workspace.root });
    state.setSidebarOpen(true);
    state.setSidebarView('files');
    await refreshTree();
    state.toast(`工作区：${workspace.name}`, 'success');
  } catch (error) {
    state.toast(`打开文件夹失败：${describe(error)}`, 'error');
  }
}

export async function restoreWorkspace(root: string): Promise<void> {
  const state = useAppStore.getState();
  try {
    state.setWorkspace({ root, name: root.split(/[\\/]/).pop() || root });
    await refreshTree();
  } catch {
    state.patchSettings({ lastWorkspace: null });
  }
}

export async function refreshTree(silent = false): Promise<void> {
  const state = useAppStore.getState();
  const workspace = state.workspace;
  if (!workspace) return;
  state.setTreeLoading(true);
  try {
    const tree = await backend.listTree(workspace.root);
    state.setTree(tree);
  } catch (error) {
    if (!silent) state.toast(`读取文件夹失败：${describe(error)}`, 'error');
  } finally {
    state.setTreeLoading(false);
  }
}

export async function renameTab(tabId?: string): Promise<void> {
  const state = useAppStore.getState();
  const tab = tabId
    ? state.tabs.find((item) => item.id === tabId)
    : state.tabs.find((item) => item.id === state.activeTabId);
  if (!tab) return;

  const input = window.prompt('重命名标签页', tab.name);
  if (input == null) return;
  const name = input.trim();
  if (!name || name === tab.name) return;
  if (/[\\/:*?"<>|]/.test(name)) {
    state.toast('名称不能包含 \\ / : * ? " < > |', 'error');
    return;
  }

  if (!tab.path) {
    const next = /\.[^./\\]+$/.test(name) ? name : `${name}.md`;
    state.renameTab(tab.id, next);
    return;
  }

  const ext = extension(tab.path) || '.md';
  const nextName = name.toLowerCase().endsWith(ext.toLowerCase()) ? name : `${name}${ext}`;
  const nextPath = `${dirName(tab.path)}/${nextName}`.replace(/\\/g, '/');
  const duplicate = state.tabs.find(
    (item) => item.id !== tab.id && item.path && item.path.toLowerCase() === nextPath.toLowerCase(),
  );
  if (duplicate) {
    state.toast('已有同名文件在编辑器中打开', 'error');
    return;
  }

  try {
    if (isDesktop) {
      await backend.renamePath(tab.path, nextPath);
      state.renameTab(tab.id, baseName(nextPath), nextPath);
      state.pushRecent({ path: nextPath, name: baseName(nextPath), ts: Date.now() });
      if (state.workspace) void refreshTree(true);
      state.toast(`已重命名为 ${baseName(nextPath)}`, 'success');
    } else {
      state.renameTab(tab.id, nextName);
      state.toast('浏览器模式仅修改标签名称，磁盘文件需在桌面版重命名', 'info');
    }
  } catch (error) {
    state.toast(`重命名失败：${describe(error)}`, 'error');
  }
}

export async function reloadFromDisk(): Promise<void> {
  const state = useAppStore.getState();
  if (!state.doc.path) return;
  try {
    const file = await backend.openPath(state.doc.path);
    state.setDoc({
      path: file.path,
      name: file.name,
      content: file.content,
      savedContent: file.content,
      mtime: file.mtime,
    });
    state.setConflict(null);
    state.toast('已重新加载磁盘上的最新内容', 'success');
  } catch (error) {
    state.toast(`重新加载失败：${describe(error)}`, 'error');
  }
}

export async function keepLocalVersion(): Promise<void> {
  const state = useAppStore.getState();
  state.setConflict(null);
  const ok = await saveDocument();
  if (ok) state.toast('已用本地内容覆盖磁盘文件', 'success');
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '未知错误';
}
