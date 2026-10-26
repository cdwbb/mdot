/**
 * Editors register a callback that pushes their live buffer into the store.
 * Anything that reads `doc.content` / `tab.content` after a document switch,
 * a save, or a session snapshot must sync first, otherwise the last edits are
 * still sitting in the editor when the store is read.
 */
type SyncFn = () => void;

const syncs = new Map<string, SyncFn>();

export function registerContentSync(key: string, fn: SyncFn): () => void {
  syncs.set(key, fn);
  return () => {
    if (syncs.get(key) === fn) syncs.delete(key);
  };
}

export function syncEditorContent(): void {
  for (const fn of syncs.values()) fn();
}
