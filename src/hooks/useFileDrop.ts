import { useEffect, useRef, useState } from 'react';
import { isDesktop } from '../services/backend';
import { openPath } from '../app/actions';

const MARKDOWN_FILE = /\.(md|markdown|mdown|mkd|mdx|txt)$/i;

/** Tauri native drag-drop + browser HTML5 drag-drop, with an overlay state. */
export function useFileDrop(): { dragging: boolean } {
  const [dragging, setDragging] = useState(false);
  const counter = useRef(0);

  useEffect(() => {
    if (isDesktop) {
      let unlisten: (() => void) | undefined;
      let disposed = false;
      void import('@tauri-apps/api/webview').then(async ({ getCurrentWebview }) => {
        try {
          unlisten = await getCurrentWebview().onDragDropEvent((event) => {
            const payload = event.payload;
            if (payload.type === 'over') setDragging(true);
            else if (payload.type === 'leave') setDragging(false);
            else if (payload.type === 'drop') {
              setDragging(false);
              const hit = payload.paths.find((path) => MARKDOWN_FILE.test(path));
              if (hit) void openPath(hit);
            }
          });
          if (disposed) unlisten?.();
        } catch {
          /* ignore */
        }
      });
      return () => {
        disposed = true;
        unlisten?.();
      };
    }

    const onEnter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      counter.current += 1;
      setDragging(true);
    };
    const onOver = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    const onLeave = () => {
      counter.current = Math.max(0, counter.current - 1);
      if (counter.current === 0) setDragging(false);
    };
    const onDrop = async (event: DragEvent) => {
      counter.current = 0;
      setDragging(false);
      const file = Array.from(event.dataTransfer?.files ?? []).find((item) =>
        MARKDOWN_FILE.test(item.name),
      );
      if (!file) return;
      event.preventDefault();
      const { openDroppedFile } = await import('../app/actions');
      await openDroppedFile(file);
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return { dragging };
}
