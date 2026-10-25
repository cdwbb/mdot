import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, placeholder, scrollPastEnd } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';
import { useAppStore } from '../../store/useAppStore';
import type { ScrollSlot } from '../../types';
import { sourceShortcuts } from '../source/commands';
import SourceToolbar from '../source/SourceToolbar';
import { centerSourceCaret } from '../typewriter';

export interface PaneSourceHandle {
  focus: () => void;
  flush: () => string;
}

interface Props {
  tabId: string;
  slot: ScrollSlot;
  content: string;
  dark: boolean;
  active: boolean;
  onChange: (markdown: string) => void;
  onFocus: () => void;
}

export const PaneSourceEditor = forwardRef<PaneSourceHandle, Props>(
  function PaneSourceEditor(
    { tabId, slot, content, dark, active, onChange, onFocus },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const applyingRef = useRef(false);
    const lastValueRef = useRef(content);
    const onChangeRef = useRef(onChange);
    const onFocusRef = useRef(onFocus);
    const themeCompartment = useRef(new Compartment());
    const darkRef = useRef(dark);
    const activeRef = useRef(active);
    const scrollFrameRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    onChangeRef.current = onChange;
    onFocusRef.current = onFocus;
    darkRef.current = dark;
    activeRef.current = active;

    useImperativeHandle(
      ref,
      () => ({
        focus: () => viewRef.current?.focus(),
        flush: () => viewRef.current?.state.doc.toString() ?? lastValueRef.current,
      }),
      [],
    );

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      let cancelled = false;
      const initialRatio = useAppStore
        .getState()
        .tabs.find((tab) => tab.id === tabId)?.scroll[slot];
      const reportPosition = (state: EditorState) => {
        const head = state.selection.main.head;
        const line = state.doc.lineAt(head);
        useAppStore.getState().setCursorPosition(line.number, head - line.from + 1);
      };
      const view = new EditorView({
        state: EditorState.create({
          doc: content,
          extensions: [
            sourceShortcuts(),
            basicSetup,
            scrollPastEnd(),
            markdown({ base: markdownLanguage, codeLanguages: languages }),
            EditorView.lineWrapping,
            placeholder('开始书写…'),
            EditorView.theme({
              '&': { height: '100%', backgroundColor: 'transparent' },
              '.cm-scroller': { overflow: 'auto' },
            }),
            themeCompartment.current.of(dark ? oneDark : []),
            EditorView.updateListener.of((update) => {
              if (update.selectionSet && !applyingRef.current && activeRef.current) {
                reportPosition(update.state);
              }
              if (
                (update.selectionSet || update.docChanged) &&
                !applyingRef.current &&
                update.view.hasFocus &&
                useAppStore.getState().settings.typewriter
              ) {
                requestAnimationFrame(() => {
                  const current = viewRef.current;
                  if (current) centerSourceCaret(current);
                });
              }
              if (!update.docChanged || cancelled || applyingRef.current) return;
              const next = update.state.doc.toString();
              if (next === lastValueRef.current) return;
              lastValueRef.current = next;
              onChangeRef.current(next);
            }),
            EditorView.domEventHandlers({
              focus: () => {
                onFocusRef.current();
                reportPosition(view.state);
                return false;
              },
              pointerdown: () => {
                onFocusRef.current();
                reportPosition(view.state);
                return false;
              },
            }),
          ],
        }),
        parent: host,
      });
      viewRef.current = view;
      const scroller = view.scrollDOM;
      const onScroll = () => {
        if (scrollFrameRef.current) clearTimeout(scrollFrameRef.current);
        scrollFrameRef.current = setTimeout(() => {
          scrollFrameRef.current = null;
          const max = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
          useAppStore.getState().setTabScroll(tabId, slot, scroller.scrollTop / max);
        }, 180);
      };
      scroller.addEventListener('scroll', onScroll, { passive: true });
      if (typeof initialRatio === 'number') {
        requestAnimationFrame(() => {
          const max = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
          scroller.scrollTop = initialRatio * max;
        });
      }
      return () => {
        cancelled = true;
        scroller.removeEventListener('scroll', onScroll);
        if (scrollFrameRef.current) clearTimeout(scrollFrameRef.current);
        view.destroy();
        viewRef.current = null;
      };
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      if (view.state.doc.toString() === content) {
        lastValueRef.current = content;
        return;
      }
      applyingRef.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      });
      lastValueRef.current = content;
      queueMicrotask(() => {
        applyingRef.current = false;
      });
    }, [content]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: themeCompartment.current.reconfigure(dark ? oneDark : []),
      });
    }, [dark]);

    return (
      <div className={`pane-source ${active ? 'is-active' : ''}`}>
        <SourceToolbar viewRef={viewRef} />
        <div className="pane-source__host" ref={hostRef} />
      </div>
    );
  },
);
