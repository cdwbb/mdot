import { useEffect, useRef, useState } from 'react';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { Crepe } from '@milkdown/crepe';
import { editorViewCtx, remarkStringifyOptionsCtx } from '@milkdown/kit/core';
import { ChevronRight, FileCode2, Loader2, TriangleAlert } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { backend } from '../../services/backend';
import { joinFrontMatter, splitFrontMatter } from '../../utils/markdown';
import {
  cleanSerializedMarkdown,
  imageAltMap,
} from '../markdown/fidelity';
import { emitActiveHeading, onGoto } from '../bus';
import { registerScrollController, takePendingScroll } from '../modeSwitch';
import { centerCaretInScroller } from '../typewriter';

const scrollable = (el: HTMLElement): number =>
  Math.max(1, el.scrollHeight - el.clientHeight);

function relativeTop(el: HTMLElement, surface: HTMLElement): number {
  return el.getBoundingClientRect().top - surface.getBoundingClientRect().top + surface.scrollTop;
}

export default function CrepeEditor() {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const readyRef = useRef(false);
  const userInteractedRef = useRef(false);
  const imageAltsRef = useRef(new Map<string, string>());
  const frontMatterRef = useRef<string | null>(null);
  const frameRef = useRef(0);
  const scrollSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [frontMatter, setFrontMatter] = useState<string | null>(null);
  const [fmOpen, setFmOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const surface = surfaceRef.current;
    if (!host || !surface) return;

    let disposed = false;
    let instance: Crepe | null = null;

    const initial = useAppStore.getState().doc.content;
    const initialTabId = useAppStore.getState().activeTabId;
    const sessionRatio = initialTabId
      ? useAppStore.getState().tabs.find((tab) => tab.id === initialTabId)?.scroll.seamless
      : undefined;
    const split = splitFrontMatter(initial);
    frontMatterRef.current = split.frontMatter;
    imageAltsRef.current = imageAltMap(split.body);
    setFrontMatter(split.frontMatter);
    userInteractedRef.current = false;

    const markInteraction = () => {
      userInteractedRef.current = true;
    };
    const interactionEvents = ['beforeinput', 'paste', 'drop', 'keydown', 'pointerdown'] as const;
    for (const eventName of interactionEvents) {
      host.addEventListener(eventName, markInteraction, true);
    }

    let userScrolled = false;
    const markUserScroll = () => {
      userScrolled = true;
    };
    const scrollIntentEvents = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const;
    for (const eventName of scrollIntentEvents) {
      surface.addEventListener(eventName, markUserScroll, { passive: true });
    }
    const restoreTimers: number[] = [];

    const headings = (): HTMLElement[] =>
      Array.from(host.querySelectorAll<HTMLElement>('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6'));

    const scrollToAnchor = (anchor: string): boolean => {
      const outline = useAppStore.getState().outline;
      const index = outline.findIndex((item) => item.id === anchor);
      if (index < 0) return false;
      const el = headings()[index];
      if (!el) return false;
      surface.scrollTo({ top: Math.max(0, relativeTop(el, surface) - 16), behavior: 'smooth' });
      return true;
    };

    const upload = async (file: File): Promise<string> => {
      const docPath = useAppStore.getState().doc.path;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await backend.saveImage(docPath, file.name, bytes);
      if (!result) throw new Error('图片保存失败');
      return result;
    };

    const boot = async () => {
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
        listener.markdownUpdated((_ctx, markdown) => {
          if (disposed || !readyRef.current || !userInteractedRef.current) return;
          const cleaned = cleanSerializedMarkdown(markdown, imageAltsRef.current);
          const merged = joinFrontMatter(frontMatterRef.current, cleaned);
          const current = useAppStore.getState().doc;
          if (merged !== current.content) useAppStore.getState().setContent(merged);
        });
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

      // Give the browser one frame to lay out ProseMirror before restoring scroll.
      requestAnimationFrame(() => {
        const pending = takePendingScroll('seamless');
        if (pending) {
          const restored = pending.anchor ? scrollToAnchor(pending.anchor) : false;
          if (!restored) surface.scrollTop = pending.ratio * scrollable(surface);
          return;
        }
        if (typeof sessionRatio !== 'number') return;
        const applySessionScroll = () => {
          if (!userScrolled) surface.scrollTop = sessionRatio * scrollable(surface);
        };
        applySessionScroll();
        // Async blocks (Mermaid, KaTeX, images) grow the document after mount.
        for (const delay of [450, 1300]) {
          restoreTimers.push(window.setTimeout(applySessionScroll, delay));
        }
      });

      window.setTimeout(() => {
        try {
          crepe.editor.ctx.get(editorViewCtx).focus();
        } catch {
          host.querySelector<HTMLElement>('.ProseMirror')?.focus();
        }
      }, 80);
    };

    void boot();

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
        const list = headings();
        if (!list.length) return;
        let active = useAppStore.getState().outline[0]?.id ?? null;
        for (let i = 0; i < list.length; i++) {
          if (relativeTop(list[i], surface) <= surface.scrollTop + 24) {
            active = useAppStore.getState().outline[i]?.id ?? active;
          } else break;
        }
        emitActiveHeading(active);
      });
    };
    surface.addEventListener('scroll', onScroll, { passive: true });

    const offGoto = onGoto(({ anchor }) => {
      scrollToAnchor(anchor);
    });

    const unregister = registerScrollController('seamless', {
      capture() {
        const list = headings();
        let index = -1;
        for (let i = 0; i < list.length; i++) {
          if (relativeTop(list[i], surface) <= surface.scrollTop + 30) index = i;
          else break;
        }
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
      unregister();
      offGoto();
      for (const eventName of interactionEvents) {
        host.removeEventListener(eventName, markInteraction, true);
      }
      for (const eventName of scrollIntentEvents) {
        surface.removeEventListener(eventName, markUserScroll);
      }
      for (const timer of restoreTimers) window.clearTimeout(timer);
      surface.removeEventListener('scroll', onScroll);
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
      crepe.editor.ctx.get(editorViewCtx).focus();
    } catch {
      hostRef.current?.querySelector<HTMLElement>('.ProseMirror')?.focus();
    }
  };

  return (
    <div className={`seamless-wrap ${ready ? 'is-ready' : 'is-booting'}`}>
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
