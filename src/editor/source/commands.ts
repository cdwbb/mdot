import type { EditorView } from '@codemirror/view';
import { EditorView as EditorViewValue } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { openSearchPanel } from '@codemirror/search';

const SELECTION_PLACEHOLDER = '文本';

export function selectedText(view: EditorView): string {
  const { from, to } = view.state.selection.main;
  return view.state.sliceDoc(from, to);
}

export function wrapInline(
  view: EditorView,
  before: string,
  after = before,
  placeholder = SELECTION_PLACEHOLDER,
): void {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to) || placeholder;
  const already =
    from >= before.length &&
    view.state.sliceDoc(from - before.length, from) === before &&
    view.state.sliceDoc(to, to + after.length) === after;

  if (already) {
    view.dispatch({
      changes: [
        { from: from - before.length, to: from, insert: '' },
        { from: to, to: to + after.length, insert: '' },
      ],
      selection: { anchor: from - before.length, head: to - before.length },
    });
    return;
  }

  view.dispatch({
    changes: { from, to, insert: `${before}${selected}${after}` },
    selection: {
      anchor: from + before.length,
      head: from + before.length + selected.length,
    },
  });
}

function transformLines(
  view: EditorView,
  transform: (text: string, index: number) => string,
): void {
  const { from, to } = view.state.selection.main;
  const first = view.state.doc.lineAt(from).number;
  const last = view.state.doc.lineAt(to).number;
  const changes = [];
  for (let n = first; n <= last; n++) {
    const line = view.state.doc.line(n);
    changes.push({
      from: line.from,
      to: line.to,
      insert: transform(line.text, n - first),
    });
  }
  view.dispatch({ changes });
}

const BLOCK_PREFIX = /^(\s*)(?:#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+)/;
const HEADING_PREFIX = /^#{1,6}\s+/;
const LIST_PREFIX = /^(\s*)(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+)/;

function stripBlockPrefix(text: string): string {
  return text.replace(BLOCK_PREFIX, '$1');
}

export function setHeading(view: EditorView, level: number): void {
  transformLines(view, (text) => {
    const bare = text.replace(HEADING_PREFIX, '');
    return level > 0 ? `${'#'.repeat(level)} ${bare}` : bare;
  });
}

export function adjustHeading(view: EditorView, delta: number): void {
  transformLines(view, (text) => {
    const match = /^(#{1,6})\s+/.exec(text);
    const current = match ? match[1].length : 0;
    const next = Math.max(0, Math.min(6, current === 0 ? (delta > 0 ? 1 : 0) : current + delta));
    const bare = text.replace(HEADING_PREFIX, '');
    return next > 0 ? `${'#'.repeat(next)} ${bare}` : bare;
  });
}

export function setParagraph(view: EditorView): void {
  transformLines(view, (text) => stripBlockPrefix(text));
}

export function toggleQuote(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  const first = view.state.doc.lineAt(from).number;
  const last = view.state.doc.lineAt(to).number;
  const lines = [];
  for (let n = first; n <= last; n++) lines.push(view.state.doc.line(n).text);
  const allQuoted = lines.every((line) => line.startsWith('> '));
  transformLines(view, (text) =>
    allQuoted ? text.replace(/^>\s?/, '') : `> ${text.replace(/^>\s?/, '')}`,
  );
}

function toggleList(
  view: EditorView,
  kind: 'bullet' | 'ordered' | 'task',
): void {
  const { from, to } = view.state.selection.main;
  const first = view.state.doc.lineAt(from).number;
  const last = view.state.doc.lineAt(to).number;
  const marker =
    kind === 'bullet' ? (index: number) => `- ` : kind === 'ordered'
      ? (index: number) => `${index + 1}. `
      : () => `- [ ] `;
  const test =
    kind === 'bullet' ? /^(\s*)[-*+]\s+/ : kind === 'ordered' ? /^(\s*)\d+\.\s+/ : /^(\s*)- \[[ xX]\]\s+/;
  const lines = [];
  for (let n = first; n <= last; n++) lines.push(view.state.doc.line(n).text);
  const allMarked = lines.every((line) => test.test(line));

  transformLines(view, (text, index) => {
    const bare = stripBlockPrefix(text);
    if (allMarked) return bare;
    const indent = /^(\s*)/.exec(text)?.[1] ?? '';
    return `${indent}${marker(index)}${bare.trimStart()}`;
  });
}

export function toggleBulletList(view: EditorView): void {
  toggleList(view, 'bullet');
}

export function toggleOrderedList(view: EditorView): void {
  toggleList(view, 'ordered');
}

export function toggleTaskList(view: EditorView): void {
  toggleList(view, 'task');
}

export function makeLooseList(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  const first = view.state.doc.lineAt(from).number;
  const last = view.state.doc.lineAt(to).number;
  const lines = [];
  for (let n = first; n <= last; n++) lines.push(view.state.doc.line(n).text);
  const insert = lines.filter((line) => line.trim()).join('\n\n');
  view.dispatch({
    changes: {
      from: view.state.doc.line(first).from,
      to: view.state.doc.line(last).to,
      insert,
    },
  });
}

export function insertBlock(
  view: EditorView,
  text: string,
  cursor: number | 'end' | 'middle' = 'end',
): void {
  const { from, to } = view.state.selection.main;
  const prefix = from > 0 ? '\n\n' : '';
  const suffix = to < view.state.doc.length ? '\n\n' : '\n';
  const insert = `${prefix}${text}${suffix}`;
  const relative =
    typeof cursor === 'number'
      ? cursor
      : cursor === 'end'
        ? text.length
        : Math.floor(text.length / 2);
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + prefix.length + relative },
  });
}

export function insertTable(view: EditorView): void {
  insertBlock(view, '| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |');
}

export function insertCodeFence(view: EditorView): void {
  const selected = selectedText(view);
  const body = selected || 'code';
  insertBlock(view, `\`\`\`\n${body}\n\`\`\``, 4);
}

export function insertMathBlock(view: EditorView): void {
  const selected = selectedText(view);
  const body = selected || 'E = mc^2';
  insertBlock(view, `$$\n${body}\n$$`, 3);
}

export function insertHtmlBlock(view: EditorView): void {
  insertBlock(view, '<div>\n\n</div>', 6);
}

export function insertRule(view: EditorView): void {
  insertBlock(view, '---');
}

export function insertFrontMatter(view: EditorView): void {
  const docStart = view.state.doc.length ? view.state.doc.line(1).from : 0;
  if (view.state.sliceDoc(0, Math.min(3, view.state.doc.length)) === '---') return;
  const snippet = '---\ntitle: \n---\n\n';
  view.dispatch({
    changes: { from: docStart, insert: snippet },
    selection: { anchor: 11 },
  });
}

export function insertLink(view: EditorView): void {
  const selected = selectedText(view) || '链接文字';
  const { from, to } = view.state.selection.main;
  const insert = `[${selected}](https://)`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + selected.length + 3, head: from + selected.length + 11 },
  });
}

export function insertImage(view: EditorView): void {
  const selected = selectedText(view) || '图片描述';
  const { from, to } = view.state.selection.main;
  const insert = `![${selected}](https://)`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + selected.length + 4, head: from + selected.length + 12 },
  });
}

export function clearFormatting(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  const targetFrom = view.state.doc.lineAt(from).from;
  const targetTo = view.state.doc.lineAt(to).to;
  const cleaned = view.state.sliceDoc(targetFrom, targetTo).replace(
    /(<\/?[a-zA-Z][^>]*>|(\*\*|__|~~|\*|_|`|\$))/g,
    '',
  );
  view.dispatch({
    changes: { from: targetFrom, to: targetTo, insert: cleaned },
  });
  transformLines(view, (text) => stripBlockPrefix(text));
}

export function openFind(view: EditorView): void {
  openSearchPanel(view);
}

/**
 * CodeMirror treats Ctrl+Shift+letter as Ctrl+letter for character keys, so
 * shifted shortcuts need to be intercepted before the normal keymap.
 */
export function sourceShortcuts() {
  return Prec.highest(
    EditorViewValue.domEventHandlers({
      keydown(event, view) {
        const mod = event.ctrlKey || event.metaKey;
        const alt = event.altKey;
        const shift = event.shiftKey;
        const key = event.key.toLowerCase();
        let handled = false;

        if (mod && alt && !shift) {
          if (key === 'n') {
            insertMathBlock(view);
            handled = true;
          } else if (key === 'h') {
            insertHtmlBlock(view);
            handled = true;
          } else if (key === 'x') {
            toggleTaskList(view);
            handled = true;
          } else if (key === 'l') {
            makeLooseList(view);
            handled = true;
          } else if (key === 'y') {
            insertFrontMatter(view);
            handled = true;
          }
        } else if (mod && !alt) {
          if (shift) {
            if (event.code === 'Digit0') {
              setParagraph(view);
              handled = true;
            } else if (key === '+' || key === '=' || event.code === 'Equal') {
              adjustHeading(view, 1);
              handled = true;
            } else if (key === 'h') {
              wrapInline(view, '<mark>', '</mark>');
              handled = true;
            } else if (key === 'm') {
              wrapInline(view, '$');
              handled = true;
            } else if (key === 'i') {
              insertImage(view);
              handled = true;
            } else if (key === 'r') {
              clearFormatting(view);
              handled = true;
            } else if (key === 't') {
              insertTable(view);
              handled = true;
            } else if (key === 'k') {
              insertCodeFence(view);
              handled = true;
            } else if (key === 'q') {
              toggleQuote(view);
              handled = true;
            } else if (key === 'u') {
              insertRule(view);
              handled = true;
            }
          } else if (/^[1-6]$/.test(key)) {
            setHeading(view, Number(key));
            handled = true;
          } else if (key === '=' || key === '+') {
            adjustHeading(view, 1);
            handled = true;
          } else if (key === '-') {
            adjustHeading(view, -1);
            handled = true;
          } else if (key === 'b') {
            wrapInline(view, '**');
            handled = true;
          } else if (key === 'i') {
            wrapInline(view, '*');
            handled = true;
          } else if (key === 'u') {
            wrapInline(view, '<u>', '</u>');
            handled = true;
          } else if (key === 'd') {
            wrapInline(view, '~~');
            handled = true;
          } else if (key === '`') {
            wrapInline(view, '`', '`', 'code');
            handled = true;
          } else if (key === 'l') {
            insertLink(view);
            handled = true;
          } else if (key === 'g') {
            toggleOrderedList(view);
            handled = true;
          } else if (key === 'h') {
            toggleBulletList(view);
            handled = true;
          }
        }

        if (handled) {
          event.preventDefault();
          return true;
        }
        return false;
      },
    }),
  );
}
