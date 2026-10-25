import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/common';
import katex from 'katex';
import DOMPurify from 'dompurify';
import type { OutlineItem } from '../../types';
import { plainHeading } from '../../utils/markdown';

export interface RenderEnv {
  docPath: string | null;
  resolveImage: (src: string) => string;
  /** Used for ids so outline + scroll sync address the same target. */
  outline?: OutlineItem[];
  [key: string]: unknown;
}

export interface RenderResult {
  html: string;
  outline: OutlineItem[];
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeAttr = escapeHtml;

function createRenderer(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: false,
    typographer: false,
    highlight: undefined,
  });

  /* ---------- YAML front matter ---------- */
  md.block.ruler.before('table', 'mdot_front_matter', (state, startLine, endLine, silent) => {
    if (startLine !== 0) return false;
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const end = state.eMarks[startLine];
    if (state.src.slice(start, end).trim() !== '---') return false;

    let nextLine = startLine + 1;
    let closed = false;
    for (; nextLine < endLine; nextLine++) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineEnd = state.eMarks[nextLine];
      const text = state.src.slice(lineStart, lineEnd).trim();
      if (text === '---' || text === '...') {
        closed = true;
        break;
      }
    }
    if (!closed) return false;
    if (silent) return true;

    const contentStart = state.bMarks[startLine + 1];
    const contentEnd = state.bMarks[nextLine];
    const token = state.push('mdot_front_matter', '', 0);
    token.content = state.src.slice(contentStart, contentEnd).replace(/\n$/, '');
    token.map = [startLine, nextLine + 1];
    token.block = true;
    state.line = nextLine + 1;
    return true;
  });

  md.renderer.rules.mdot_front_matter = (tokens, idx) => {
    const content = tokens[idx].content;
    return `<div class="frontmatter"><div class="frontmatter__head"><span>Front Matter</span></div><pre><code>${escapeHtml(
      content,
    )}</code></pre></div>\n`;
  };

  /* ---------- Math (KaTeX) ---------- */
  md.inline.ruler.before('escape', 'mdot_math_inline', (state, silent) => {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x24 /* $ */) return false;
    if (state.src.charCodeAt(start + 1) === 0x24) return false;

    let pos = start + 1;
    if (pos >= state.posMax) return false;
    if (/\s/.test(state.src[pos])) return false;

    let found = -1;
    while (pos < state.posMax) {
      const ch = state.src[pos];
      if (ch === '\\') {
        pos += 2;
        continue;
      }
      if (ch === '\n') break;
      if (ch === '$') {
        found = pos;
        break;
      }
      pos++;
    }
    if (found < 0) return false;
    if (found === start + 1) return false;
    if (/\s/.test(state.src[found - 1])) return false;

    if (!silent) {
      const token = state.push('mdot_math_inline', 'math', 0);
      token.content = state.src.slice(start + 1, found);
      token.markup = '$';
    }
    state.pos = found + 1;
    return true;
  });

  md.renderer.rules.mdot_math_inline = (tokens, idx) => {
    const source = tokens[idx].content;
    try {
      return katex.renderToString(source, {
        throwOnError: true,
        displayMode: false,
        output: 'htmlAndMathml',
        strict: 'ignore',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `<span class="math-error" title="${escapeAttr(message)}">$${escapeHtml(source)}$</span>`;
    }
  };

  md.block.ruler.before('fence', 'mdot_math_block', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (start + 2 > max) return false;
    if (state.src.slice(start, start + 2) !== '$$') return false;

    const firstLine = state.src.slice(start + 2, max);
    const singleLine = /^\s*([\s\S]+?)\s*\$\$\s*$/.exec(firstLine);

    if (singleLine) {
      if (silent) return true;
      const token = state.push('mdot_math_block', 'math', 0);
      token.content = singleLine[1];
      token.map = [startLine, startLine + 1];
      token.block = true;
      state.line = startLine + 1;
      return true;
    }

    let nextLine = startLine + 1;
    let content = firstLine;
    let closed = false;
    for (; nextLine < endLine; nextLine++) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineEnd = state.eMarks[nextLine];
      const text = state.src.slice(lineStart, lineEnd);
      const closeMatch = /^\s*\$\$\s*$/.exec(text);
      if (closeMatch) {
        closed = true;
        break;
      }
      content += '\n' + text;
    }
    if (!closed) return false;
    if (silent) return true;

    const token = state.push('mdot_math_block', 'math', 0);
    token.content = content.replace(/^\n+/, '');
    token.map = [startLine, nextLine + 1];
    token.block = true;
    state.line = nextLine + 1;
    return true;
  });

  md.renderer.rules.mdot_math_block = (tokens, idx) => {
    const source = tokens[idx].content;
    try {
      return `${katex.renderToString(source, {
        throwOnError: true,
        displayMode: true,
        output: 'htmlAndMathml',
        strict: 'ignore',
      })}\n`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `<div class="math-error" title="${escapeAttr(message)}">${escapeHtml(source)}</div>\n`;
    }
  };

  /* ---------- Fences: mermaid + highlight ---------- */
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = (token.info || '').trim();
    const lang = (info.split(/\s+/)[0] || '').toLowerCase();
    const code = token.content;

    if (lang === 'mermaid') {
      return `<div class="mermaid-block is-pending"><pre class="mermaid-src" hidden>${escapeHtml(
        code,
      )}</pre></div>\n`;
    }

    let highlighted: string;
    try {
      if (lang && hljs.getLanguage(lang)) {
        highlighted = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      } else {
        highlighted = escapeHtml(code);
      }
    } catch {
      highlighted = escapeHtml(code);
    }

    const label = lang || 'text';
    return `<div class="code-block"><div class="code-block__head"><span>${escapeHtml(
      label,
    )}</span><button type="button" class="code-block__copy" data-copy>复制</button></div><pre><code class="hljs${
      lang ? ` language-${escapeAttr(lang)}` : ''
    }">${highlighted}</code></pre></div>\n`;
  };

  /* ---------- Headings: stable ids + anchors ---------- */
  md.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
    const token = tokens[idx];
    const line = token.map ? token.map[0] + 1 : idx;
    const id = `h-${line}`;
    token.attrSet('id', id);
    const tag = token.tag;
    return `<${tag} id="${id}"><a class="heading-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>`;
  };

  /* ---------- Tables ---------- */
  md.renderer.rules.table_open = () => '<div class="md-table-wrap"><table>\n';
  md.renderer.rules.table_close = () => '</table></div>\n';

  /* ---------- Images ---------- */
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const raw = token.attrGet('src') || '';
    const resolved = (env as RenderEnv).resolveImage(raw);
    const alt = self.renderInlineAsText(token.children ?? [], options, env);
    const title = token.attrGet('title');
    const width = token.attrGet('width');
    const attrs = [
      `src="${escapeAttr(resolved)}"`,
      `alt="${escapeAttr(alt)}"`,
      'loading="lazy"',
      'decoding="async"',
    ];
    if (title) attrs.push(`title="${escapeAttr(title)}"`);
    if (width) attrs.push(`width="${escapeAttr(width)}"`);
    return `<img ${attrs.join(' ')}>`;
  };

  /* ---------- External links ---------- */
  md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
    const href = tokens[idx].attrGet('href') || '';
    if (/^https?:/i.test(href)) {
      tokens[idx].attrSet('target', '_blank');
      tokens[idx].attrSet('rel', 'noopener noreferrer');
      tokens[idx].attrSet('data-external', 'true');
    }
    return self.renderToken(tokens, idx, options);
  };

  /* ---------- Task list items ---------- */
  md.core.ruler.after('inline', 'mdot_task_lists', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const inline = tokens[i];
      if (inline.type !== 'inline' || !inline.children?.length) continue;
      const paragraph = tokens[i - 1];
      const item = tokens[i - 2];
      if (!paragraph || paragraph.type !== 'paragraph_open' || !item || item.type !== 'list_item_open') {
        continue;
      }
      const match = /^\[([ xX])\]\s+/.exec(inline.content);
      if (!match) continue;

      inline.content = inline.content.slice(match[0].length);
      const first = inline.children[0];
      if (first && first.type === 'text') {
        first.content = first.content.replace(/^\[([ xX])\]\s+/, '');
      }

      const checked = match[1].toLowerCase() === 'x';
      const checkbox = new state.Token('html_inline', '', 0);
      checkbox.content = `<input type="checkbox" ${checked ? 'checked' : ''} disabled aria-label="${
        checked ? '已完成' : '未完成'
      }"> `;
      inline.children.unshift(checkbox);
      item.attrJoin('class', 'task-list-item');
      paragraph.attrJoin('class', 'task-item-p');

      for (let j = i - 3; j >= 0; j--) {
        if (tokens[j].type === 'bullet_list_open' || tokens[j].type === 'ordered_list_open') {
          tokens[j].attrJoin('class', 'contains-task-list');
          break;
        }
        if (tokens[j].type === 'bullet_list_close' || tokens[j].type === 'ordered_list_close') break;
      }
    }
  });

  return md;
}

const renderer = createRenderer();

export function renderMarkdown(markdown: string, env: RenderEnv): RenderResult {
  const raw = renderer.render(markdown, env);
  const html = DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target', 'data-copy', 'data-external', 'loading', 'decoding', 'disabled', 'checked'],
    ADD_TAGS: ['math', 'mi', 'mo', 'mn', 'ms', 'mtext', 'mspace', 'msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot', 'mtable', 'mtr', 'mtd', 'munder', 'mover', 'munderover', 'mstyle', 'mpadded', 'mphantom', 'merror', 'semantics', 'annotation'],
    ALLOW_DATA_ATTR: true,
    USE_PROFILES: { html: true, mathMl: true, svg: true },
  });
  return { html, outline: [] };
}

/** Lightweight plaintext renderer used for card previews / excerpts. */
export function renderInlineText(markdown: string, docPath: string | null, resolveImage: (src: string) => string): string {
  const env: RenderEnv = { docPath, resolveImage };
  return renderer.renderInline(markdown, env);
}
