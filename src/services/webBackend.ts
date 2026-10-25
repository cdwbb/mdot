import type {
  Backend,
  FileNode,
  OpenedFile,
  RecentFile,
  SavedFile,
  SessionState,
  Settings,
  WorkspaceInfo,
} from '../types';

const MD_EXT = /\.(md|markdown|mdown|mkd|mdx|txt)$/i;

const fileHandles = new Map<string, FileSystemFileHandle>();
const dirHandles = new Map<string, FileSystemDirectoryHandle>();

type FsPicker = {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
    excludeAcceptAllOption?: boolean;
  }) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite';
  }) => Promise<FileSystemDirectoryHandle>;
};

const picker = typeof window !== 'undefined' ? (window as unknown as FsPicker) : {};

function pickWithInput(accept: string, directory = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = false;
    if (directory) {
      input.setAttribute('webkitdirectory', '');
    }
    let settled = false;
    input.addEventListener('change', () => {
      settled = true;
      resolve(input.files ? Array.from(input.files) : []);
    });
    // Non-blocking fallback when the user cancels the native dialog.
    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (!settled) resolve([]);
        }, 600);
      },
      { once: true },
    );
    input.click();
  });
}

async function fileToOpened(file: File, path: string | null): Promise<OpenedFile> {
  const content = await file.text();
  return {
    path,
    name: file.name,
    content,
    mtime: file.lastModified || null,
  };
}

async function writeHandle(handle: FileSystemFileHandle, content: string): Promise<void> {
  const anyHandle = handle as unknown as {
    createWritable(options?: { keepExistingData?: boolean }): Promise<{
      write(data: string): Promise<void>;
      close(): Promise<void>;
    }>;
    queryPermission?: (o: { mode: string }) => Promise<string>;
    requestPermission?: (o: { mode: string }) => Promise<string>;
  };
  if (anyHandle.queryPermission) {
    let permission = await anyHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && anyHandle.requestPermission) {
      permission = await anyHandle.requestPermission({ mode: 'readwrite' });
    }
    if (permission !== 'granted') throw new Error('没有写入权限');
  }
  const writable = await anyHandle.createWritable();
  await writable.write(content);
  await writable.close();
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
    /* ignore */
  }
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

async function readDir(
  dir: FileSystemDirectoryHandle,
  path: string,
  depth: number,
): Promise<FileNode[]> {
  const nodes: FileNode[] = [];
  const entries: FileSystemHandle[] = [];
  const dirWithIterator = dir as unknown as {
    values(): AsyncIterableIterator<FileSystemHandle>;
  };
  for await (const entry of dirWithIterator.values()) {
    entries.push(entry);
  }
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
  for (const entry of entries) {
    const childPath = `${path}/${entry.name}`;
    if (entry.kind === 'directory') {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      dirHandles.set(childPath, entry as FileSystemDirectoryHandle);
      const children = depth > 0 ? await readDir(entry as FileSystemDirectoryHandle, childPath, depth - 1) : [];
      nodes.push({ name: entry.name, path: childPath, isDir: true, children });
    } else if (MD_EXT.test(entry.name)) {
      fileHandles.set(childPath, entry as FileSystemFileHandle);
      nodes.push({ name: entry.name, path: childPath, isDir: false });
    }
  }
  return nodes;
}

export function createWebBackend(): Backend {
  return {
    kind: 'web',

    async pickOpenFile() {
      if (picker.showOpenFilePicker) {
        try {
          const [handle] = await picker.showOpenFilePicker({
            multiple: false,
            types: [
              {
                description: 'Markdown',
                accept: { 'text/markdown': ['.md', '.markdown', '.mdx', '.txt'] },
              },
            ],
          });
          if (!handle) return null;
          const file = await handle.getFile();
          const path = `web:${handle.name}`;
          fileHandles.set(path, handle);
          return fileToOpened(file, path);
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return null;
          // fall through to the <input> picker
        }
      }
      const [file] = await pickWithInput('.md,.markdown,.mdx,.txt,text/markdown');
      if (!file) return null;
      return fileToOpened(file, null);
    },

    async openPath(path) {
      const handle = fileHandles.get(path);
      if (!handle) throw new Error('浏览器模式无法访问该路径');
      const file = await handle.getFile();
      return fileToOpened(file, path);
    },

    async saveText(path, content, suggestedName) {
      if (path) {
        const handle = fileHandles.get(path);
        if (handle) {
          await writeHandle(handle, content);
          return {
            path,
            name: handle.name,
            mtime: Date.now(),
          } satisfies SavedFile;
        }
      }
      if (picker.showSaveFilePicker) {
        try {
          const handle = await picker.showSaveFilePicker({
            suggestedName,
            types: [
              {
                description: 'Markdown',
                accept: { 'text/markdown': ['.md', '.markdown'] },
              },
            ],
          });
          await writeHandle(handle, content);
          const newPath = `web:${handle.name}`;
          fileHandles.set(newPath, handle);
          return { path: newPath, name: handle.name, mtime: Date.now() } satisfies SavedFile;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return null;
          throw error;
        }
      }
      // Last resort: download the file.
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = suggestedName;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { path: null, name: suggestedName, mtime: Date.now() } satisfies SavedFile;
    },

    async pickWorkspace() {
      if (!picker.showDirectoryPicker) return null;
      try {
        const handle = await picker.showDirectoryPicker({ mode: 'readwrite' });
        const root = `web:${handle.name}`;
        dirHandles.set(root, handle);
        return { root, name: handle.name } satisfies WorkspaceInfo;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return null;
        return null;
      }
    },

    async listTree(root) {
      const handle = dirHandles.get(root);
      if (!handle) return [];
      return readDir(handle, root, 2);
    },

    async watch() {
      /* no filesystem watcher in the browser */
    },

    async unwatch() {
      /* noop */
    },

    onFsChange() {
      return () => undefined;
    },

    async exportHtml(html, suggestedName) {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = suggestedName.replace(/\.md$/i, '') + '.html';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return anchor.download;
    },

    async saveImage(_docPath, fileName, bytes) {
      // Browser demo has no asset folder: inline a data URL instead.
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy]);
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    },

    resolveImageSrc(_docPath, src) {
      return src;
    },

    async loadSettings() {
      return localGet<Partial<Settings>>('settings') ?? null;
    },

    async saveSettings(settings) {
      localSet('settings', settings);
    },

    async loadRecent() {
      return localGet<RecentFile[]>('recent') ?? [];
    },

    async saveRecent(recent) {
      localSet('recent', recent);
    },

    async loadSession() {
      return localGet<SessionState>('session') ?? null;
    },

    async saveSession(session) {
      localSet('session', session);
    },

    async clearSession() {
      try {
        localStorage.removeItem('mdot.session');
      } catch {
        /* ignore */
      }
    },

    async renamePath() {
      throw new Error('浏览器模式无法重命名磁盘文件');
    },

    async openExternal(url) {
      if (/^https?:/i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
    },
  };
}

export { baseName };
