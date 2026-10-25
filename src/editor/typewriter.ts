import type { EditorView } from '@codemirror/view';

/** Keep the caret around the vertical center of a scroll container. */
export function centerCaretInScroller(
  scroller: HTMLElement,
  caret: { top: number; bottom: number },
): void {
  const rect = scroller.getBoundingClientRect();
  const caretCenter = caret.top + (caret.bottom - caret.top) / 2;
  const targetCenter = rect.top + rect.height / 2;
  scroller.scrollTop += caretCenter - targetCenter;
}

export function centerSourceCaret(view: EditorView): void {
  const coords = view.coordsAtPos(view.state.selection.main.head);
  if (!coords) return;
  centerCaretInScroller(view.scrollDOM, coords);
}
