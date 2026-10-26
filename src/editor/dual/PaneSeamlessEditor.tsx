import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { Crepe } from '@milkdown/crepe';
import { editorViewCtx, remarkStringifyOptionsCtx } from '@milkdown/kit/core';
import { replaceAll } from '@milkdown/kit/utils';
import { Loader2, TriangleAlert } from 'lucide-react';
import { backend } from '../../services/backend';
import { useAppStore } from '../../store/useAppStore';
import { joinFrontMatter, splitFrontMatter } from '../../utils/markdown';
import { cleanSerializedMarkdown, imageAltMap } from '../markdown/fidelity';
import { registerContentSync } from '../contentSync';
import { centerCaretInScroller } from '../typewriter';
import type { ScrollSlot } from '../../types';

/** Serializing a whole document is the expensive part of typing, so it happens
 *  once per short pause and in an idle window instead of on every change. The
 *  pause is a trailing debounce; MAX_WAIT is only a safety valve so a store read
 *  can never wait on a writer that never stops. */
const SYNC_DELAY = 400;
const SYNC_MAX_WAIT = 8000;

/** Panes defer serialization, so the dirty indicator needs to know that some
 *  pane still holds text the store has never seen. */
let panesWithPendingEdits = 0;

export interface PaneSeamlessHandle {
  focus: () => void;
  flush: () => string;
}

interface Props {
  tabId: string;
  slot: ScrollSlot;
  content: string;
  docPath: string | null;
  active: boolean;
  onChange: (markdown: string) => void;
  onFocus: () => void;
}

export const PaneSeamlessEditor = forwardRef<PaneSeamlessHandle, Props>(
  function PaneSeamlessEditor(
    { tabId, slot, content, docPath, active, onChange, onFocus },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const crepeRef = useRef<Crepe | null>(null);
    const readyRef = useRef(false);
    const applyingRef = useRef(false);
    const userInteractedRef = useRef(false);
    const frontMatterRef = useRef<string | null>(null);
    const lastValueRef = useRef(content);
    const pendingRef = useRef<string | null>(null);
    const syncTimerRef = useRef<number | null>(null);
    const idleRef = useRef<number | null>(null);
    const pendingEditRef = useRef(false);
    const armedAtRef = useRef(0);
    /** The ProseMirror doc last serialized; identity changes on every edit. */
    const lastDocRef = useRef<unknown>(null);
    const scrollFrameRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onChangeRef = useRef(onChange);
    const onFocusRef = useRef(onFocus);
    const typewriter = useAppStore((s) => s.settings.typewriter);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    onChangeRef.current = onChange;
    onFocusRef.current = onFocus;

    const releasePendingEdits = () => {
      if (!pendingEditRef.current) return;
      pendingEditRef.current = false;
      panesWithPendingEdits = Math.max(0, panesWithPendingEdits - 1);
      const state = useAppStore.getState();
      if (state.hasPendingEdits && panesWithPendingEdits === 0) {
        state.setHasPendingEdits(false);
      }
    };

    const cancelScheduledSync = () => {
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      if (idleRef.current !== null && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(idleRef.current);
      }
      idleRef.current = null;
      releasePendingEdits();
    };

    const applyBody = (crepe: Crepe, markdown: string) => {
      cancelScheduledSync();
      const split = splitFrontMatter(markdown);
      frontMatterRef.current = split.frontMatter;
      if (crepe.getMarkdown() === split.body) {
        lastValueRef.current = markdown;
        return;
      }
      applyingRef.current = true;
      crepe.editor.action(replaceAll(split.body, true));
      lastValueRef.current = markdown;
      queueMicrotask(() => {
        applyingRef.current = false;
      });
    };

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          const crepe = crepeRef.current;
          if (!crepe || !readyRef.current) return;
          try {
            crepe.editor.action((ctx) => ctx.get(editorViewCtx).focus());
          } catch {
            hostRef.current?.querySelector<HTMLElement>('.ProseMirror')?.focus();
          }
        },
        flush: () => {
          const crepe = crepeRef.current;
          if (!crepe || !readyRef.current) return lastValueRef.current;
          cancelScheduledSync();
          const merged = joinFrontMatter(
            frontMatterRef.current,
            cleanSerializedMarkdown(crepe.getMarkdown(), imageAltMap(lastValueRef.current)),
          );
          lastValueRef.current = merged;
          return merged;
        },
      }),
      [],
    );

    useEffect(() => {
      const host = hostRef.current;
      const root = rootRef.current;
      if (!host || !root) return;
      let cancelled = false;
      const initialRatio = useAppStore
        .getState()
        .tabs.find((tab) => tab.id === tabId)?.scroll[slot];
      let userScrolled = false;
      const markUserScroll = () => {
        userScrolled = true;
      };
      const scrollIntentEvents = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const;
      const restoreTimers: number[] = [];
      for (const eventName of scrollIntentEvents) {
        root.addEventListener(eventName, markUserScroll, { passive: true });
      }
      const split = splitFrontMatter(content);
      frontMatterRef.current = split.frontMatter;
      lastValueRef.current = content;
      userInteractedRef.current = false;
      readyRef.current = false;
      pendingRef.current = null;

      /** Arm the deferred flush. Milkdown's `updated` listener only fires 200ms
       *  after a change, so real input calls this directly and the dirty dot
       *  stays instant. */
      const scheduleSync = () => {
        if (cancelled || !readyRef.current || applyingRef.current) return;
        if (!userInteractedRef.current) return;
        const now = performance.now();
        if (!pendingEditRef.current) {
          pendingEditRef.current = true;
          armedAtRef.current = now;
          panesWithPendingEdits += 1;
          const state = useAppStore.getState();
          if (state.activeTabId === tabId && !state.hasPendingEdits) {
            state.setHasPendingEdits(true);
          }
        }
        const waited = now - armedAtRef.current;
        if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
        const delay = Math.max(0, Math.min(SYNC_DELAY, SYNC_MAX_WAIT - waited));
        syncTimerRef.current = window.setTimeout(() => {
          syncTimerRef.current = null;
          if (typeof requestIdleCallback === 'function') {
            idleRef.current = requestIdleCallback(() => serializeNow(), { timeout: 600 });
          } else {
            serializeNow();
          }
        }, delay);
      };

      const markInteraction = (event: Event) => {
        userInteractedRef.current = true;
        const type = (event as InputEvent).inputType ?? '';
        if (event.type === 'beforeinput' && (type.startsWith('insert') || type.startsWith('delete'))) {
          scheduleSync();
        }
      };
      const interactionEvents = ['beforeinput', 'paste', 'drop', 'keydown', 'pointerdown'] as const;
      for (const eventName of interactionEvents) {
        host.addEventListener(eventName, markInteraction, true);
      }

      const onScroll = () => {
        if (scrollFrameRef.current) clearTimeout(scrollFrameRef.current);
        scrollFrameRef.current = setTimeout(() => {
          scrollFrameRef.current = null;
          const max = Math.max(1, root.scrollHeight - root.clientHeight);
          useAppStore.getState().setTabScroll(tabId, slot, root.scrollTop / max);
        }, 180);
      };
      root.addEventListener('scroll', onScroll, { passive: true });

      const upload = async (file: File): Promise<string> => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const result = await backend.saveImage(docPath, file.name, bytes);
        if (!result) throw new Error('图片保存失败');
        return result;
      };

      const crepe = new Crepe({
        root: host,
        defaultValue: split.body,
        features: {
          [Crepe.Feature.CodeMirror]: true,
          [Crepe.Feature.ListItem]: true,
          [Crepe.Feature.LinkTooltip]: true,
          [Crepe.Feature.Cursor]: true,
          [Crepe.Feature.ImageBlock]: true,
          [Crepe.Feature.BlockEdit]: true,
          [Crepe.Feature.Toolbar]: true,
          [Crepe.Feature.Placeholder]: true,
          [Crepe.Feature.Table]: true,
          [Crepe.Feature.Latex]: true,
          [Crepe.Feature.TopBar]: false,
          [Crepe.Feature.AI]: false,
        },
        featureConfigs: {
          // See CrepeEditor: the virtual caret injects a sibling before the
          // first block and makes selections shift the document vertically.
          [Crepe.Feature.Cursor]: { virtual: false },
          [Crepe.Feature.Placeholder]: {
            text: '开始书写…',
            mode: 'block',
          },
          [Crepe.Feature.ImageBlock]: {
            onUpload: upload,
            inlineOnUpload: upload,
            blockOnUpload: upload,
            proxyDomURL: (url) => backend.resolveImageSrc(docPath, url),
            onImageLoadError: () => {
              useAppStore.getState().toast('图片无法加载，请检查相对路径或 assets 目录', 'error');
            },
          },
        },
      });

      crepe.editor.config((ctx) => {
        ctx.update(remarkStringifyOptionsCtx, (options) => ({
          ...options,
          bullet: '-' as const,
          emphasis: '*' as const,
          strong: '*' as const,
          rule: '-' as const,
          closeAtx: false,
          listItemIndent: 'one' as const,
        }));
      });

      crepe.on((listener) => {
        // Programmatic edits never dispatch beforeinput, so the doc diff is
        // their only trigger.
        listener.updated(() => scheduleSync());
        listener.selectionUpdated(() => {
          if (cancelled || !readyRef.current) return;
          if (!useAppStore.getState().settings.typewriter) return;
          requestAnimationFrame(() => {
            const root = rootRef.current;
            const instance = crepeRef.current;
            if (!root || !instance || cancelled) return;
            if (!hostRef.current?.contains(document.activeElement)) return;
            try {
              const view = instance.editor.ctx.get(editorViewCtx);
              const coords = view.coordsAtPos(view.state.selection.head);
              if (coords) centerCaretInScroller(root, coords);
            } catch {
              /* editor not ready */
            }
          });
        });
      });

      let created = false;
      const serializeNow = () => {
        releasePendingEdits();
        if (!readyRef.current || applyingRef.current || cancelled) return;
        // ProseMirror mints a new doc per transaction, so identity is a free
        // "did anything change since the last flush" test.
        let doc: unknown = null;
        try {
          crepe.editor.action((ctx) => {
            doc = ctx.get(editorViewCtx).state.doc;
          });
        } catch {
          return;
        }
        if (doc === lastDocRef.current) return;
        lastDocRef.current = doc;
        const merged = joinFrontMatter(
          frontMatterRef.current,
          cleanSerializedMarkdown(crepe.getMarkdown(), imageAltMap(lastValueRef.current)),
        );
        if (merged === lastValueRef.current) return;
        lastValueRef.current = merged;
        onChangeRef.current(merged);
      };
      // Keyed by pane, not tab: both panes can show the same tab, and a shared
      // key would let one pane flush over the other's buffer.
      const offSync = registerContentSync(`pane-${slot}`, serializeNow);
      void crepe
        .create()
        .then(() => {
          created = true;
          if (cancelled) {
            void crepe.destroy();
            return;
          }
          crepeRef.current = crepe;
          readyRef.current = true;
          setReady(true);
          lastValueRef.current = content;
          if (pendingRef.current !== null) {
            const pending = pendingRef.current;
            pendingRef.current = null;
            applyBody(crepe, pending);
          }
          if (typeof initialRatio === 'number') {
            const applySessionScroll = () => {
              if (userScrolled) return;
              const max = Math.max(1, root.scrollHeight - root.clientHeight);
              root.scrollTop = initialRatio * max;
            };
            requestAnimationFrame(applySessionScroll);
            for (const delay of [450, 1300]) {
              restoreTimers.push(window.setTimeout(applySessionScroll, delay));
            }
          }
        })
        .catch((cause: unknown) => {
          const message = cause instanceof Error ? cause.message : String(cause);
          setError(message);
          useAppStore.getState().toast('双文档编辑器加载失败，可切换源码查看', 'error');
        });

      return () => {
        cancelled = true;
        readyRef.current = false;
        offSync();
        cancelScheduledSync();
        crepeRef.current = null;
        for (const eventName of interactionEvents) {
          host.removeEventListener(eventName, markInteraction, true);
        }
        root.removeEventListener('scroll', onScroll);
        for (const eventName of scrollIntentEvents) {
          root.removeEventListener(eventName, markUserScroll);
        }
        for (const timer of restoreTimers) window.clearTimeout(timer);
        if (scrollFrameRef.current) clearTimeout(scrollFrameRef.current);
        if (created) void crepe.destroy();
      };
    }, [docPath]);

    useEffect(() => {
      const crepe = crepeRef.current;
      if (!crepe || !readyRef.current) {
        if (!readyRef.current) pendingRef.current = content;
        return;
      }
      if (content === lastValueRef.current) return;
      applyBody(crepe, content);
    }, [content]);

    return (
      <div
        ref={rootRef}
        className={`pane-seamless ${active ? 'is-active' : ''} ${
          typewriter ? 'is-typewriter' : ''
        }`}
        onPointerDown={onFocusRef.current}
      >
        {!ready && !error && (
          <div className="pane-editor-loading">
            <Loader2 size={14} className="spin" />
            正在加载…
          </div>
        )}
        {error && (
          <div className="pane-editor-error">
            <TriangleAlert size={16} />
            {error}
          </div>
        )}
        <div ref={hostRef} className="pane-seamless__host" />
      </div>
    );
  },
);
