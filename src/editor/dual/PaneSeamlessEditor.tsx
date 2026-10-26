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
import { centerCaretInScroller } from '../typewriter';
import type { ScrollSlot } from '../../types';

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
    const onChangeRef = useRef(onChange);
    const onFocusRef = useRef(onFocus);
    const scrollFrameRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const typewriter = useAppStore((s) => s.settings.typewriter);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    onChangeRef.current = onChange;
    onFocusRef.current = onFocus;

    const applyBody = (crepe: Crepe, markdown: string) => {
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

      const markInteraction = () => {
        userInteractedRef.current = true;
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
        listener.markdownUpdated((_ctx, markdown) => {
          if (cancelled || !readyRef.current || !userInteractedRef.current) return;
          if (applyingRef.current) return;
          const merged = joinFrontMatter(
            frontMatterRef.current,
            cleanSerializedMarkdown(markdown, imageAltMap(lastValueRef.current)),
          );
          if (merged === lastValueRef.current) return;
          lastValueRef.current = merged;
          onChangeRef.current(merged);
        });
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
