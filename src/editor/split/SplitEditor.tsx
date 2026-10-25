import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  scrollPastEnd,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import {
  syntaxHighlighting,
  HighlightStyle,
  indentOnInput,
  bracketMatching,
} from '@codemirror/language';
import { search, searchKeymap } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import {
  WrapText,
  Copy,
  Printer,
  ScrollText,
  LayoutGrid,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { backend } from '../../services/backend';
import { renderMarkdown } from '../markdown/pipeline';
import { copyText, renderMermaidBlocks } from '../markdown/mermaid';
import { emitActiveHeading, onGoto } from '../bus';
import {
  registerScrollController,
  takePendingScroll,
  switchMode,
} from '../modeSwitch';
import { sourceShortcuts } from '../source/commands';
import SourceToolbar from '../source/SourceToolbar';
import { centerSourceCaret } from '../typewriter';
import { debounce } from '../../utils/debounce';

interface Props {
  dark: boolean;
}

const cmTheme = (dark: boolean) =>
  EditorView.theme(
    {
      '&': {
        height: '100%',
        backgroundColor: 'transparent',
        color: 'var(--text)',
      },
      '.cm-scroller': {
        fontFamily: 'var(--font-mono)',
        lineHeight: '1.7',
      },
      '.cm-content': {
        caretColor: 'var(--accent)',
        fontFamily: 'var(--font-mono)',
      },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
        { backgroundColor: 'var(--selection)' },
      '.cm-panels': { backgroundColor: 'var(--bg-elevated)', color: 'var(--text)' },
      '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
      '.cm-searchMatch': { backgroundColor: 'var(--highlight-soft)', outline: '1px solid var(--highlight)' },
      '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--accent-soft)' },
      '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--text) 3.2%, transparent)' },
      '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)' },
      '.cm-matchingBracket, .cm-nonmatchingBracket': {
        backgroundColor: 'var(--accent-soft)',
        outline: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
      },
      '.cm-tooltip': {
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        boxShadow: 'var(--shadow-2)',
        color: 'var(--text)',
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'var(--accent-soft)',
        color: 'var(--text)',
      },
    },
    { dark },
  );

const mdHighlight = HighlightStyle.define([
  { tag: tags.heading1, color: 'var(--md-heading)', fontWeight: '700', fontSize: '1.28em' },
  { tag: tags.heading2, color: 'var(--md-heading)', fontWeight: '650', fontSize: '1.16em' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], color: 'var(--md-heading)', fontWeight: '650' },
  { tag: tags.strong, color: 'var(--md-heading)', fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--text-muted)' },
  { tag: tags.link, color: 'var(--md-link)' },
  { tag: tags.url, color: 'var(--text-muted)', textDecoration: 'underline' },
  { tag: tags.monospace, color: 'var(--md-inline-code-text)' },
  { tag: tags.quote, color: 'var(--text-secondary)', fontStyle: 'italic' },
  { tag: tags.comment, color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: tags.keyword, color: '#a626a4' },
  { tag: tags.string, color: '#2b8f47' },
  { tag: tags.number, color: '#b76b01' },
  { tag: tags.bool, color: '#b76b01' },
  { tag: tags.atom, color: '#b76b01' },
  { tag: tags.variableName, color: 'var(--text)' },
  { tag: tags.typeName, color: '#2f6fdb' },
  { tag: tags.className, color: '#2f6fdb' },
  { tag: tags.function(tags.variableName), color: '#2f6fdb' },
  { tag: tags.propertyName, color: '#7a5af8' },
  { tag: tags.operator, color: 'var(--text-secondary)' },
  { tag: tags.punctuation, color: 'var(--text-muted)' },
  { tag: tags.meta, color: 'var(--text-muted)' },
]);

const scrollTopOf = (el: HTMLElement): number => el.scrollTop;
const maxScroll = (el: HTMLElement): number => Math.max(1, el.scrollHeight - el.clientHeight);

function relativeTop(el: HTMLElement, scroller: HTMLElement): number {
  return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
}

export default function SplitEditor({ dark }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sourceWrapRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const markdownRef = useRef('');
  const genRef = useRef(0);
  const darkRef = useRef(dark);
  const docPathRef = useRef<string | null>(null);
  const lockUntilRef = useRef(0);
  const frameRef = useRef(0);
  const scrollerRef = useRef<HTMLElement | null>(null);

  const themeCompartment = useRef(new Compartment());
  const wrapCompartment = useRef(new Compartment());
  const spellCompartment = useRef(new Compartment());

  const syncScroll = useAppStore((s) => s.settings.syncScroll);
  const spellcheck = useAppStore((s) => s.settings.spellcheck);
  const typewriter = useAppStore((s) => s.settings.typewriter);
  const previewLeft = useAppStore((s) => s.settings.previewLeft);
  const [wrap, setWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  const [syncTick, setSyncTick] = useState(0);

  darkRef.current = dark;

  /* ---------------------------------------------------------------- preview */
  const paint = useCallback((source: string) => {
    const container = previewRef.current;
    const scroller = previewScrollRef.current;
    if (!container || !scroller) return;

    const generation = ++genRef.current;
    const headings = Array.from(
      container.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'),
    );
    const top = scroller.scrollTop;
    let anchor: HTMLElement | null = null;
    for (const heading of headings) {
      if (relativeTop(heading, scroller) <= top + 24) anchor = heading;
      else break;
    }
    const anchorOffset = anchor ? top - relativeTop(anchor, scroller) : 0;

    const { html } = renderMarkdown(source, {
      docPath: docPathRef.current,
      resolveImage: (src) => backend.resolveImageSrc(docPathRef.current, src),
    });

    container.innerHTML = html;

    if (anchor) {
      const next = container.querySelector<HTMLElement>(`#${anchor.id}`);
      if (next) scroller.scrollTop = relativeTop(next, scroller) + anchorOffset;
      else scroller.scrollTop = Math.min(top, maxScroll(scroller));
    }

    void renderMermaidBlocks(container, darkRef.current, generation, () => genRef.current);
  }, []);

  const paintDebounced = useRef(debounce((source: string) => paint(source), 150)).current;

  /* -------------------------------------------------------------- editor init */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const state = useAppStore.getState();
    docPathRef.current = state.doc.path;
    markdownRef.current = state.doc.content;
    const initialTabId = state.activeTabId;
    const sessionRatio = initialTabId
      ? state.tabs.find((tab) => tab.id === initialTabId)?.scroll.split
      : undefined;

    const view = new EditorView({
      state: EditorState.create({
        doc: state.doc.content,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          bracketMatching(),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          scrollPastEnd(),
          search({ top: true }),
          markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
          syntaxHighlighting(mdHighlight),
          themeCompartment.current.of(cmTheme(darkRef.current)),
          wrapCompartment.current.of(wrap ? EditorView.lineWrapping : []),
          spellCompartment.current.of(
            EditorView.contentAttributes.of({ spellcheck: String(state.settings.spellcheck) }),
          ),
          sourceShortcuts(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const md = update.state.doc.toString();
              markdownRef.current = md;
              useAppStore.getState().setContent(md);
              paintDebounced(md);
            }
            if (update.selectionSet || update.docChanged) {
              const head = update.state.selection.main.head;
              const line = update.state.doc.lineAt(head);
              useAppStore.getState().setCursorPosition(line.number, head - line.from + 1);
              if (
                (update.selectionSet || update.docChanged) &&
                useAppStore.getState().settings.typewriter &&
                update.view.hasFocus
              ) {
                requestAnimationFrame(() => {
                  if (viewRef.current) centerSourceCaret(viewRef.current);
                });
              }
            }
          }),
        ],
      }),
      parent: host,
    });
    viewRef.current = view;

    const scroller = view.scrollDOM;
    scrollerRef.current = scroller;

    let userScrolled = false;
    const markUserScroll = () => {
      userScrolled = true;
    };
    const scrollIntentEvents = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const;
    const restoreTimers: number[] = [];
    const previewEl = previewScrollRef.current;
    for (const eventName of scrollIntentEvents) {
      scroller.addEventListener(eventName, markUserScroll, { passive: true });
      previewEl?.addEventListener(eventName, markUserScroll, { passive: true });
    }

    // The format bar renders before the editor exists; sync its initial state.
    paint(markdownRef.current);

    /* ------------------------------------------------------------ scroll sync */
    const headingTops = (side: 'source' | 'preview'): { id: string; top: number }[] => {
      const outline = useAppStore.getState().outline;
      if (side === 'source') {
        return outline.map((item) => {
          const line = view.state.doc.line(Math.min(item.line, view.state.doc.lines));
          return { id: item.id, top: view.lineBlockAt(line.from).top };
        });
      }
      const container = previewRef.current;
      const pane = previewScrollRef.current;
      if (!container || !pane) return [];
      return outline.flatMap((item) => {
        const el = container.querySelector<HTMLElement>(`#${item.id}`);
        return el ? [{ id: item.id, top: relativeTop(el, pane) }] : [];
      });
    };

    const activeFromTops = (tops: { id: string; top: number }[], pos: number): string | null => {
      let active: string | null = tops.length ? tops[0].id : null;
      for (const item of tops) {
        if (item.top <= pos + 20) active = item.id;
        else break;
      }
      return active;
    };

    const sync = (from: 'source' | 'preview') => {
      if (!useAppStore.getState().settings.syncScroll) return;
      if (Date.now() < lockUntilRef.current) return;
      const source = view.scrollDOM;
      const preview = previewScrollRef.current;
      if (!preview) return;

      const sourceTops = headingTops('source');
      const previewTops = headingTops('preview');
      const current = from === 'source' ? source : preview;
      const target = from === 'source' ? preview : source;
      const fromTops = from === 'source' ? sourceTops : previewTops;
      const toTops = from === 'source' ? previewTops : sourceTops;

      if (fromTops.length && toTops.length) {
        const pos = scrollTopOf(current);
        let index = 0;
        for (let i = 0; i < fromTops.length; i++) {
          if (fromTops[i].top <= pos + 24) index = i;
          else break;
        }
        const startA = fromTops[index]?.top ?? 0;
        const endA = fromTops[index + 1]?.top ?? startA + Math.max(1, maxScroll(current) - startA);
        const startB = toTops[index]?.top ?? 0;
        const endB = toTops[index + 1]?.top ?? startB + Math.max(1, maxScroll(target) - startB);
        const fraction = Math.min(1, Math.max(0, (pos - startA) / Math.max(1, endA - startA)));
        const next = startB + fraction * (endB - startB);
        lockUntilRef.current = Date.now() + 90;
        target.scrollTop = Math.max(0, Math.min(maxScroll(target), next));
      } else {
        const ratio = scrollTopOf(current) / maxScroll(current);
        lockUntilRef.current = Date.now() + 90;
        target.scrollTop = ratio * maxScroll(target);
      }

      emitActiveHeading(activeFromTops(fromTops, scrollTopOf(current)));
    };

    const onSourceScroll = () => {
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        sync('source');
      });
    };

    const onPreviewScroll = () => {
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        sync('preview');
        const preview = previewScrollRef.current;
        const activeTabId = useAppStore.getState().activeTabId;
        if (preview && activeTabId) {
          useAppStore
            .getState()
            .setTabScroll(activeTabId, 'split', preview.scrollTop / maxScroll(preview));
        }
      });
    };

    scroller.addEventListener('scroll', onSourceScroll, { passive: true });
    previewScrollRef.current?.addEventListener('scroll', onPreviewScroll, { passive: true });

    /* ---------------------------------------------------------------- goto */
    const offGoto = onGoto(({ anchor, line }) => {
      lockUntilRef.current = Date.now() + 200;
      const targetLine =
        line ??
        Number.parseInt(anchor.replace(/^h-/, ''), 10) ??
        1;
      const docLine = Math.min(Math.max(1, targetLine), view.state.doc.lines);
      view.dispatch({
        effects: EditorView.scrollIntoView(view.state.doc.line(docLine).from, {
          y: 'start',
          yMargin: 24,
        }),
      });
      const preview = previewScrollRef.current;
      const el = previewRef.current?.querySelector<HTMLElement>(`#${anchor}`);
      if (el && preview) preview.scrollTop = Math.max(0, relativeTop(el, preview) - 24);
      view.focus();
    });

    /* ------------------------------------------------------- initial scroll */
    const pending = takePendingScroll('split');
    if (pending) {
      requestAnimationFrame(() => {
        const targetLine = pending.line ?? (pending.anchor ? Number.parseInt(pending.anchor.replace(/^h-/, ''), 10) : 0);
        if (targetLine) {
          const docLine = Math.min(Math.max(1, targetLine), view.state.doc.lines);
          view.dispatch({
            effects: EditorView.scrollIntoView(view.state.doc.line(docLine).from, {
              y: 'start',
              yMargin: 24,
            }),
          });
        } else {
          const preview = previewScrollRef.current;
          if (preview) preview.scrollTop = pending.ratio * maxScroll(preview);
        }
      });
    } else if (typeof sessionRatio === 'number') {
      const applySessionScroll = () => {
        if (userScrolled) return;
        const preview = previewScrollRef.current;
        if (preview) preview.scrollTop = sessionRatio * maxScroll(preview);
      };
      requestAnimationFrame(applySessionScroll);
      for (const delay of [450, 1300]) {
        restoreTimers.push(window.setTimeout(applySessionScroll, delay));
      }
    }

    const unregister = registerScrollController('split', {
      capture() {
        const pane = previewScrollRef.current;
        const container = previewRef.current;
        if (!pane || !container) return { anchor: null, ratio: 0, from: 'split' };
        const headings = Array.from(
          container.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'),
        );
        let anchor: HTMLElement | null = null;
        for (const heading of headings) {
          if (relativeTop(heading, pane) <= pane.scrollTop + 30) anchor = heading;
          else break;
        }
        return {
          anchor: anchor?.id ?? null,
          line: anchor ? Number.parseInt(anchor.id.replace(/^h-/, ''), 10) : undefined,
          ratio: pane.scrollTop / maxScroll(pane),
          from: 'split',
        };
      },
      restore(target) {
        const preview = previewScrollRef.current;
        if (target.anchor && preview) {
          const el = previewRef.current?.querySelector<HTMLElement>(`#${target.anchor}`);
          if (el) preview.scrollTop = Math.max(0, relativeTop(el, preview) - 24);
          else preview.scrollTop = target.ratio * maxScroll(preview);
        } else if (preview) {
          preview.scrollTop = target.ratio * maxScroll(preview);
        }
      },
    });

    return () => {
      unregister();
      offGoto();
      scroller.removeEventListener('scroll', onSourceScroll);
      previewScrollRef.current?.removeEventListener('scroll', onPreviewScroll);
      for (const eventName of scrollIntentEvents) {
        scroller.removeEventListener(eventName, markUserScroll);
        previewEl?.removeEventListener(eventName, markUserScroll);
      }
      for (const timer of restoreTimers) window.clearTimeout(timer);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      paintDebounced.cancel();
      view.destroy();
      viewRef.current = null;
      scrollerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------------------------------------------------- settings */
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: themeCompartment.current.reconfigure(cmTheme(dark)) });
    paint(markdownRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: wrapCompartment.current.reconfigure(wrap ? EditorView.lineWrapping : []),
    });
  }, [wrap]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: spellCompartment.current.reconfigure(
        EditorView.contentAttributes.of({ spellcheck: String(spellcheck) }),
      ),
    });
  }, [spellcheck]);

  useEffect(() => {
    if (!typewriter) return;
    const view = viewRef.current;
    if (!view || !view.hasFocus) return;
    view.dispatch({
      effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' }),
    });
  }, [typewriter]);

  // Re-bind preview scroll listener when sync setting flips (the handler reads it live,
  // this tick simply refreshes the badge in the pane head).
  useEffect(() => setSyncTick((n) => n + 1), [syncScroll]);

  /* --------------------------------------------------------------- preview events */
  useEffect(() => {
    const container = previewRef.current;
    if (!container) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const copyButton = target.closest<HTMLButtonElement>('[data-copy]');
      if (copyButton) {
        const block = copyButton.closest('.code-block');
        const code = block?.querySelector('code')?.textContent ?? '';
        void copyText(code).then((ok) => {
          if (ok) {
            copyButton.textContent = '已复制';
            setTimeout(() => {
              copyButton.textContent = '复制';
            }, 1400);
          }
        });
        event.preventDefault();
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (href.startsWith('#')) {
        event.preventDefault();
        const id = href.slice(1);
        const el = container.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
        const pane = previewScrollRef.current;
        if (el && pane) {
          lockUntilRef.current = Date.now() + 200;
          pane.scrollTo({ top: relativeTop(el, pane) - 24, behavior: 'smooth' });
          const line = Number.parseInt(id.replace(/^h-/, ''), 10);
          if (Number.isFinite(line) && viewRef.current) {
            viewRef.current.dispatch({
              effects: EditorView.scrollIntoView(viewRef.current.state.doc.line(Math.min(line, viewRef.current.state.doc.lines)).from, { y: 'start', yMargin: 24 }),
            });
          }
        }
        return;
      }
      if (/^https?:/i.test(href)) {
        event.preventDefault();
        void backend.openExternal(href);
      }
    };

    container.addEventListener('click', onClick);
    return () => container.removeEventListener('click', onClick);
  }, []);

  const copyMarkdown = async () => {
    const ok = await copyText(markdownRef.current);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      useAppStore.getState().toast('Markdown 源码已复制', 'success');
    }
  };

  return (
    <div className={`split ${previewLeft ? 'split--preview-left' : ''}`}>
      <div className="split__pane split__pane--source">
        <SourceToolbar
          viewRef={viewRef}
          label="源码"
          trailing={
            <button
              className={`icon-btn ${wrap ? 'is-active' : ''}`}
              title="自动换行"
              onClick={() => setWrap((value) => !value)}
            >
              <WrapText size={14} />
            </button>
          }
        />
        <div className="split__scroll split__scroll--source" ref={sourceWrapRef}>
          <div ref={hostRef} className="cm-host" />
        </div>
      </div>

      <div className="split__pane split__pane--preview">
        <div className="split__head">
          <span className="split__head-title">
            <ScrollText size={12} /> 预览（只读）
          </span>
          <button
            className={`split__sync-badge ${syncScroll ? '' : 'is-off'}`}
            title={syncScroll ? '已开启同步滚动，点击关闭' : '同步滚动已关闭'}
            onClick={() => useAppStore.getState().patchSettings({ syncScroll: !syncScroll })}
            data-tick={syncTick}
          >
            {syncScroll ? '同步滚动' : '自由滚动'}
          </button>
          <div className="split__head-actions">
            <button
              className="icon-btn"
              title="用双文档并排编辑（两侧都可写）"
              onClick={() => switchMode('dual')}
            >
              <LayoutGrid size={12} />
            </button>
            <button className="icon-btn" title="复制 Markdown" onClick={copyMarkdown}>
              {copied ? <Copy size={12} /> : <Copy size={12} />}
            </button>
            <button
              className="icon-btn"
              title="打印 / 导出 PDF"
              onClick={() => {
                useAppStore.getState().setSettingsOpen(false);
                window.print();
              }}
            >
              <Printer size={12} />
            </button>
          </div>
        </div>
        <div className="split__scroll" ref={previewScrollRef}>
          <div className="split__preview-inner md-body" ref={previewRef} />
        </div>
      </div>
    </div>
  );
}
