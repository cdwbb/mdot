import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { LazyStore } from '@tauri-apps/plugin-store';
import type {
  Backend,
  FsChangeEvent,
  OpenedFile,
  RecentFile,
  SavedFile,
  SessionState,
  Settings,
  WorkspaceInfo,
  FileNode,
} from '../types';
import { DEFAULT_SETTINGS } from '../store/useAppStore';

const MD_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx'] },
  { name: '文本文件', extensions: ['txt'] },
];

const store = new LazyStore('mdot.json', { autoSave: 400 });

let storeBroken = false;

async function storeGet<T>(key: string): Promise<T | undefined> {
  if (storeBroken) return localGet<T>(key);
  try {
    return await store.get<T>(key);
  } catch {
    storeBroken = true;
    return localGet<T>(key);
  }
}

async function storeSet(key: string, value: unknown): Promise<void> {
  if (!storeBroken) {
    try {
      await store.set(key, value);
      await store.save();
      return;
    } catch {
      storeBroken = true;
    }
  }
  localSet(key, value);
}

function localGet<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(`mdot.${key}`);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function localSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(`mdot.${key}`, JSON.stringify(value));
  } catch {
    /* ignore quota / privacy mode */
  }
}

function localRemove(key: string): void {
  try {
    localStorage.removeItem(`mdot.${key}`);
  } catch {
    /* ignore */
  }
}

async function storeDelete(key: string): Promise<void> {
  if (!storeBroken) {
    try {
      await store.delete(key);
      await store.save();
      return;
    } catch {
      storeBroken = true;
    }
  }
  localRemove(key);
}

interface RustFile {
  path: string | null;
  name: string;
  content: string;
  mtime: number | null;
}

function fromRust(file: RustFile): OpenedFile {
  return {
    path: file.path,
    name: file.name,
    content: file.content,
    mtime: file.mtime,
  };
}

const baseName = (path: string): string => path.split(/[\\/]/).pop() || path;

export function createTauriBackend(): Backend {
  return {
    kind: 'tauri',

    async pickOpenFile() {
      const selected = await open({
        title: '打开 Markdown 文件',
        multiple: false,
        directory: false,
        filters: MD_FILTERS,
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) return null;
      return this.openPath(path);
    },

    async openPath(path) {
      const file = await invoke<RustFile>('read_text_file', { path });
      return fromRust(file);
    },

    async saveText(path, content, suggestedName) {
      let target = path;
      if (!target) {
        target = await save({
          title: '保存 Markdown 文件',
          defaultPath: suggestedName,
          filters: MD_FILTERS,
        });
        if (!target) return null;
      }
      const file = await invoke<RustFile>('write_text_file', { path: target, content });
      return { path: file.path, name: file.name, mtime: file.mtime } satisfies SavedFile;
    },

    async pickWorkspace() {
      const selected = await open({
        title: '打开文件夹作为工作区',
        directory: true,
        multiple: false,
      });
      const root = Array.isArray(selected) ? selected[0] : selected;
      if (!root) return null;
      return { root, name: baseName(root) } satisfies WorkspaceInfo;
    },

    async listTree(root) {
      return invoke<FileNode[]>('list_dir_tree', { root });
    },

    async watch(paths) {
      await invoke('watch_paths', { paths });
    },

    async unwatch() {
      await invoke('unwatch_all');
    },

    onFsChange(handler) {
      let disposed = false;
      let unlisten: (() => void) | null = null;
      void listen<FsChangeEvent>('fs://changed', (event) => {
        if (!disposed) handler(event.payload);
      }).then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
      return () => {
        disposed = true;
        unlisten?.();
      };
    },

    async exportHtml(html, suggestedName) {
      const target = await save({
        title: '导出 HTML',
        defaultPath: suggestedName.replace(/\.md$/i, '') + '.html',
        filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
      });
      if (!target) return null;
      await invoke('write_text_file', { path: target, content: html });
      return target;
    },

    async saveImage(docPath, fileName, bytes) {
      // Array.from keeps the IPC payload JSON-friendly across WebViews.
      return invoke<string>('save_image_asset', {
        docPath,
        fileName,
        bytes: Array.from(bytes),
      });
    },

    resolveImageSrc(docPath, src) {
      if (!src) return src;
      if (/^(https?:|data:|blob:|asset:|file:)/i.test(src)) return src;
      if (!docPath) return src;
      const dir = docPath.replace(/[\\/][^\\/]*$/, '');
      const joined = `${dir}/${src}`.replace(/\\/g, '/');
      try {
        return convertFileSrc(joined);
      } catch {
        return src;
      }
    },

    async loadSettings() {
      return (await storeGet<Partial<Settings>>('settings')) ?? null;
    },

    async saveSettings(settings) {
      await storeSet('settings', settings);
    },

    async loadRecent() {
      return (await storeGet<RecentFile[]>('recent')) ?? [];
    },

    async saveRecent(recent) {
      await storeSet('recent', recent);
    },

    async loadSession() {
      return (await storeGet<SessionState>('session')) ?? null;
    },

    async saveSession(session) {
      await storeSet('session', session);
    },

    async clearSession() {
      await storeDelete('session');
    },

    async renamePath(oldPath, newPath) {
      await invoke('rename_path', { oldPath, newPath });
    },

    async openExternal(url) {
      await invoke('open_external', { url });
    },
  };
}

export { DEFAULT_SETTINGS };
