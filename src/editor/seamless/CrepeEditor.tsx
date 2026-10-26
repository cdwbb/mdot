import { useEffect, useRef, useState } from 'react';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { Crepe } from '@milkdown/crepe';
import { editorViewCtx, remarkStringifyOptionsCtx } from '@milkdown/kit/core';
import { replaceAll } from '@milkdown/kit/utils';
import { ChevronRight, FileCode2, Loader2, TriangleAlert } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { backend } from '../../services/backend';
import { joinFrontMatter, splitFrontMatter } from '../../utils/markdown';
import {
  cleanSerializedMarkdown,
  imageAltMap,
} from '../markdown/fidelity';
import { emitActiveHeading, onGoto } from '../bus';
import { registerContentSync } from '../contentSync';
import { registerScrollController, takePendingScroll } from '../modeSwitch';
import { centerCaretInScroller } from '../typewriter';
import { usePaneZoom } from '../zoom';

const scrollable = (el: HTMLElement): number =>
  Math.max(1, el.scrollHeight - el.clientHeight);

/** Serializing a whole document is the expensive part of typing, so it happens
 *  once per short pause and in an idle window instead of on every change. The
 *  pause is a trailing debounce; MAX_WAIT is only a safety valve so a store read
 *  can never wait on a writer that never stops. */
const SYNC_DELAY = 400;
const SYNC_MAX_WAIT = 8000;

export default function CrepeEditor() {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const readyRef = useRef(false);
  const applyingRef = useRef(false);
  const userInteractedRef = useRef(false);
  const imageAltsRef = useRef(new Map<string, string>());
  const frontMatterRef = useRef<string | null>(null);
  const lastValueRef = useRef('');
  const pendingRef = useRef<string | null>(null);
  const frameRef = useRef(0);
  const scrollSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const idleRef = useRef<number | null>(null);
  const pendingEditRef = useRef(false);
  const armedAtRef = useRef(0);
  /** The ProseMirror doc last serialized; identity changes on every edit. */
  const lastDocRef = useRef<unknown>(null);
  const restoreTimersRef = useRef<number[]>([]);
  const userScrolledRef = useRef(false);
  const [frontMatter, setFrontMatter] = useState<string | null>(null);
  const [fmOpen, setFmOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zoom = usePaneZoom('seamless');

  useEffect(() => {
    const host = hostRef.current;
    const surface = surfaceRef.current;
    if (!host || !surface) return;

    let disposed = false;
    let instance: Crepe | null = null;

    /** Arm the deferred flush. Milkdown's `updated` listener only fires 200ms
     *  after a change, so real input calls this directly and the dirty dot
     *  stays instant. */
    const scheduleSync = (): void => {
      if (disposed || !readyRef.current || applyingRef.current) return;
      if (!userInteractedRef.current) return;
      const now = performance.now();
      if (!pendingEditRef.current) {
        pendingEditRef.current = true;
        armedAtRef.current = now;
        const state = useAppStore.getState();
        if (!state.hasPendingEdits) state.setHasPendingEdits(true);
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

    const markInteraction = (event: Event): void => {
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

    const markUserScroll = () => {
      userScrolledRef.current = true;
    };
    const scrollIntentEvents = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const;
    for (const eventName of scrollIntentEvents) {
      surface.addEventListener(eventName, markUserScroll, { passive: true });
    }

    const headingQuery = (): HTMLElement[] =>
      Array.from(host.querySelectorAll<HTMLElement>('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6'));

    /**
     * Heading offsets are document-relative, so they only move when the content
     * or the measure width moves. Measuring every heading on every frame instead
     * of once per change is what makes scrolling a long document stutter.
     */
    const headingCache = { els: [] as HTMLElement[], tops: [] as number[], height: 0, width: 0 };
    let headingsValid = false;

    const measureHeadings = (): void => {
      const els = headingQuery();
      const base = surface.getBoundingClientRect().top - surface.scrollTop;
      const tops = new Array<number>(els.length);
      for (let i = 0; i < els.length; i++) tops[i] = els[i].getBoundingClientRect().top - base;
      headingCache.els = els;
      headingCache.tops = tops;
      headingCache.height = surface.scrollHeight;
      headingCache.width = surface.clientWidth;
      headingsValid = true;
    };

    const ensureHeadings = (): void => {
      if (
        headingsValid &&
        headingCache.height === surface.scrollHeight &&
        headingCache.width === surface.clientWidth
      )
        return;
      measureHeadings();
    };

    /** Index of the last heading at or above `offset`, or -1 before the first. */
    const headingIndexAt = (offset: number): number => {
      ensureHeadings();
      const { tops } = headingCache;
      let low = 0;
      let high = tops.length - 1;
      let found = -1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (tops[mid] <= offset) {
          found = mid;
          low = mid + 1;
        } else high = mid - 1;
      }
      return found;
    };

    const scrollToAnchor = (anchor: string): boolean => {
      const outline = useAppStore.getState().outline;
      const index = outline.findIndex((item) => item.id === anchor);
      if (index < 0) return false;
      ensureHeadings();
      if (!headingCache.els[index]) return false;
      userScrolledRef.current = true;
      surface.scrollTo({ top: Math.max(0, headingCache.tops[index] - 16), behavior: 'smooth' });
      return true;
    };

    const upload = async (file: File): Promise<string> => {
      const docPath = useAppStore.getState().doc.path;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await backend.saveImage(docPath, file.name, bytes);
      if (!result) throw new Error('图片保存失败');
      return result;
    };

    /** Point the component at a markdown buffer without touching ProseMirror. */
    const prepare = (markdown: string): string => {
      const split = splitFrontMatter(markdown);
      frontMatterRef.current = split.frontMatter;
      imageAltsRef.current = imageAltMap(split.body);
      lastValueRef.current = markdown;
      userInteractedRef.current = false;
      setFrontMatter(split.frontMatter);
      return split.body;
    };

    /** Push whatever is in the editor into the store right now. */
    const serializeNow = (): void => {
      const crepe = crepeRef.current;
      if (!crepe || !readyRef.current || applyingRef.current) return;
      pendingEditRef.current = false;
      const state = useAppStore.getState();
      if (state.hasPendingEdits) state.setHasPendingEdits(false);
      // ProseMirror mints a new doc per transaction, so identity is a free
      // "did anything change since the last flush" test. Without it the listener
      // plugin's late `updated` re-arms the pause and serializes unchanged text.
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
        cleanSerializedMarkdown(crepe.getMarkdown(), imageAltsRef.current),
      );
      lastValueRef.current = merged;
      if (merged !== state.doc.content) state.setContent(merged);
    };

    const cancelScheduledSync = (): void => {
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      if (idleRef.current !== null && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(idleRef.current);
      }
      idleRef.current = null;
      pendingEditRef.current = false;
      const state = useAppStore.getState();
      if (state.hasPendingEdits) state.setHasPendingEdits(false);
    };

    const focusView = () => {
      const crepe = crepeRef.current;
      if (!crepe) {
        host.querySelector<HTMLElement>('.ProseMirror')?.focus();
        return;
      }
      try {
        crepe.editor.action((ctx) => ctx.get(editorViewCtx).focus());
      } catch {
        host.querySelector<HTMLElement>('.ProseMirror')?.focus();
      }
    };

    const restoreScroll = (ratio: number | undefined): void => {
      for (const timer of restoreTimersRef.current) window.clearTimeout(timer);
      restoreTimersRef.current = [];
      userScrolledRef.current = false;
      const apply = () => {
        if (disposed || userScrolledRef.current) return;
        surface.scrollTop = typeof ratio === 'number' ? ratio * scrollable(surface) : 0;
      };
      requestAnimationFrame(apply);
      if (typeof ratio === 'number') {
        // Async blocks (Mermaid, KaTeX, images) grow the document after swap.
        for (const delay of [450, 1300]) {
          restoreTimersRef.current.push(window.setTimeout(apply, delay));
        }
      }
    };

    /** Swap the document inside the live editor instead of rebuilding it. */
    const loadBody = (markdown: string): void => {
      cancelScheduledSync();
      const body = prepare(markdown);
      const crepe = crepeRef.current;
      if (!crepe || !readyRef.current) {
        pendingRef.current = markdown;
        return;
      }
      pendingRef.current = null;
      const hadFocus = host.contains(document.activeElement);
      applyingRef.current = true;
      try {
        crepe.editor.action(replaceAll(body, true));
      } catch {
        /* keep the previous buffer if the new one fails to parse */
      }
      queueMicrotask(() => {
        applyingRef.current = false;
      });
      if (hadFocus) focusView();
    };

    const boot = async () => {
      const initial = useAppStore.getState().doc.content;
      const initialTabId = useAppStore.getState().activeTabId;
      const sessionRatio = initialTabId
        ? useAppStore.getState().tabs.find((tab) => tab.id === initialTabId)?.scroll.seamless
        : undefined;
      const body = prepare(initial);

      const crepe = new Crepe({
        root: host,
        defaultValue: body,
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
          // The virtual caret renders as a top-level sibling before the first
          // block, which breaks `:first-child` margins and shifts the document
          // vertically when a table cell is selected.
          [Crepe.Feature.Cursor]: { virtual: false },
          [Crepe.Feature.Placeholder]: {
            text: '输入 / 唤起命令，或直接开始写作…',
            mode: 'block',
          },
          [Crepe.Feature.BlockEdit]: {
            textGroup: {
              label: '文本',
              h1: { label: '一级标题' },
              h2: { label: '二级标题' },
              h3: { label: '三级标题' },
              h4: { label: '四级标题' },
              h5: { label: '五级标题' },
              h6: { label: '六级标题' },
              quote: { label: '引用' },
              divider: { label: '分割线' },
            },
            listGroup: {
              label: '列表',
              bulletList: { label: '无序列表' },
              orderedList: { label: '有序列表' },
              taskList: { label: '任务列表' },
            },
            advancedGroup: {
              label: '插入',
              image: { label: '图片' },
              codeBlock: { label: '代码块' },
              table: { label: '表格' },
              math: { label: '公式' },
            },
          },
          [Crepe.Feature.ImageBlock]: {
            onUpload: upload,
            inlineOnUpload: upload,
            blockOnUpload: upload,
            proxyDomURL: (url) =>
              backend.resolveImageSrc(useAppStore.getState().doc.path, url),
            onImageLoadError: () => {
              useAppStore
                .getState()
                .toast('图片无法加载：请确认相对路径或 assets 目录是否存在', 'error');
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
        // Programmatic edits (block menu, toolbar, table ops) never dispatch
        // beforeinput, so the doc diff is their only trigger.
        listener.updated(() => scheduleSync());
        listener.selectionUpdated(() => {
          if (!useAppStore.getState().settings.typewriter) return;
          requestAnimationFrame(() => {
            if (disposed) return;
            try {
              const view = crepe.editor.ctx.get(editorViewCtx);
              if (!view.hasFocus) return;
              const coords = view.coordsAtPos(view.state.selection.head);
              if (coords) centerCaretInScroller(surface, coords);
            } catch {
              /* editor not ready */
            }
          });
        });
      });

      try {
        await crepe.create();
      } catch (cause) {
        if (disposed) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
        useAppStore.getState().toast('编辑器加载失败，请切换双栏模式重试', 'error');
        return;
      }

      if (disposed) {
        void crepe.destroy();
        return;
      }

      instance = crepe;
      crepeRef.current = crepe;
      readyRef.current = true;
      setReady(true);

      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending !== null && pending !== initial) {
        loadBody(pending);
      }

      // Give the browser one frame to lay out ProseMirror before restoring scroll.
      requestAnimationFrame(() => {
        const swap = takePendingScroll('seamless');
        if (swap) {
          const restored = swap.anchor ? scrollToAnchor(swap.anchor) : false;
          if (!restored) surface.scrollTop = swap.ratio * scrollable(surface);
          return;
        }
        if (typeof sessionRatio !== 'number') return;
        const applySessionScroll = () => {
          if (!userScrolledRef.current) surface.scrollTop = sessionRatio * scrollable(surface);
        };
        applySessionScroll();
        // Async blocks (Mermaid, KaTeX, images) grow the document after mount.
        for (const delay of [450, 1300]) {
          restoreTimersRef.current.push(window.setTimeout(applySessionScroll, delay));
        }
      });

      window.setTimeout(focusView, 80);
    };

    void boot();

    /* ------------------------------------------------------ document switch */
    const offStore = useAppStore.subscribe((state, prev) => {
      if (disposed) return;
      if (state.activeTabId === prev.activeTabId && state.docSeq === prev.docSeq) return;
      loadBody(state.doc.content);
      const ratio = state.activeTabId
        ? state.tabs.find((tab) => tab.id === state.activeTabId)?.scroll.seamless
        : undefined;
      restoreScroll(ratio);
    });

    const offSync = registerContentSync('seamless', serializeNow);

    /* ------------------------------------------------------------- scrolling */
    const onScroll = () => {
      if (scrollSaveRef.current) clearTimeout(scrollSaveRef.current);
      scrollSaveRef.current = setTimeout(() => {
        const state = useAppStore.getState();
        if (state.activeTabId) {
          state.setTabScroll(
            state.activeTabId,
            'seamless',
            surface.scrollTop / scrollable(surface),
          );
        }
      }, 180);
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        const index = headingIndexAt(surface.scrollTop + 24);
        if (index < 0 && !headingCache.els.length) return;
        const outline = useAppStore.getState().outline;
        emitActiveHeading(outline[Math.max(0, index)]?.id ?? null);
      });
    };
    surface.addEventListener('scroll', onScroll, { passive: true });

    const invalidateHeadings = () => {
      headingsValid = false;
    };
    const headingMutations = new MutationObserver(invalidateHeadings);
    headingMutations.observe(host, { childList: true, subtree: true, characterData: true });
    const headingResize = new ResizeObserver(invalidateHeadings);
    headingResize.observe(surface);

    const offGoto = onGoto(({ anchor }) => {
      scrollToAnchor(anchor);
    });

    const unregister = registerScrollController('seamless', {
      capture() {
        const index = headingIndexAt(surface.scrollTop + 30);
        const outline = useAppStore.getState().outline;
        return {
          anchor: index >= 0 ? outline[index]?.id ?? null : null,
          line: index >= 0 ? outline[index]?.line : undefined,
          ratio: surface.scrollTop / scrollable(surface),
          from: 'seamless',
        };
      },
      restore(target) {
        const restored = target.anchor ? scrollToAnchor(target.anchor) : false;
        if (!restored) surface.scrollTop = target.ratio * scrollable(surface);
      },
    });

    return () => {
      disposed = true;
      readyRef.current = false;
      offStore();
      offSync();
      unregister();
      offGoto();
      for (const eventName of interactionEvents) {
        host.removeEventListener(eventName, markInteraction, true);
      }
      for (const eventName of scrollIntentEvents) {
        surface.removeEventListener(eventName, markUserScroll);
      }
      for (const timer of restoreTimersRef.current) window.clearTimeout(timer);
      restoreTimersRef.current = [];
      surface.removeEventListener('scroll', onScroll);
      cancelScheduledSync();
      headingMutations.disconnect();
      headingResize.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (scrollSaveRef.current) clearTimeout(scrollSaveRef.current);
      void instance?.destroy();
      crepeRef.current = null;
      host.innerHTML = '';
    };
  }, []);

  const focusEditor = () => {
    const crepe = crepeRef.current;
    if (!crepe) return;
    try {
      crepe.editor.action((ctx) => ctx.get(editorViewCtx).focus());
    } catch {
      hostRef.current?.querySelector<HTMLElement>('.ProseMirror')?.focus();
    }
  };

  return (
    <div className={`seamless-wrap ${ready ? 'is-ready' : 'is-booting'}`} {...zoom.props}>
      {frontMatter && (
        <div className={`fm-card ${fmOpen ? 'is-open' : ''}`}>
          <button className="fm-card__head" onClick={() => setFmOpen((open) => !open)}>
            <ChevronRight size={12} className="fm-card__chevron" />
            <FileCode2 size={12} />
            <span>Front Matter</span>
            <span className="fm-card__hint">{frontMatter.split('\n').length - 2} 个字段 · 保存时原样保留</span>
          </button>
          {fmOpen && <pre className="fm-card__body">{frontMatter}</pre>}
        </div>
      )}

      <div className="seamless-surface" ref={surfaceRef} onClick={(event) => {
        if (event.target === event.currentTarget) focusEditor();
      }}>
        {!ready && !error && (
          <div className="doc-skeleton" aria-hidden="true">
            <div className="doc-skeleton__inner">
              <div className="sk-line sk-line--title" />
              <div className="sk-line" />
              <div className="sk-line sk-line--short" />
              <div className="sk-line sk-line--tiny" />
            </div>
          </div>
        )}
        {error && (
          <div className="editor-error" role="alert">
            <TriangleAlert size={22} />
            <strong>无缝编辑器加载失败</strong>
            <p>{error}</p>
            <p className="editor-error__hint">
              内容未丢失。可以切换到双栏模式继续编辑，或重新打开文件。
            </p>
          </div>
        )}
        <div ref={hostRef} className="seamless-host" />
      </div>

      {!ready && !error && (
        <div className="seamless-booting">
          <Loader2 size={13} className="spin" />
          <span>正在加载编辑器内核</span>
        </div>
      )}
    </div>
  );
}
