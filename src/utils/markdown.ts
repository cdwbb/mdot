import type { DocStats, OutlineItem } from '../types';

export interface FrontMatterSplit {
  frontMatter: string | null;
  body: string;
}

/** Split a leading YAML front-matter block from the markdown body. */
export function splitFrontMatter(markdown: string): FrontMatterSplit {
  const normalized = markdown.replace(/^\uFEFF/, '');
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(normalized);
  if (!match) return { frontMatter: null, body: normalized };
  return {
    frontMatter: match[0].replace(/\r?\n$/, ''),
    body: normalized.slice(match[0].length),
  };
}

export function joinFrontMatter(frontMatter: string | null, body: string): string {
  if (!frontMatter) return body;
  if (!body) return frontMatter + '\n';
  return `${frontMatter}\n\n${body.replace(/^\r?\n+/, '')}`;
}

/** Remove inline markdown syntax for outline labels. */
export function plainHeading(raw: string): string {
  return raw
    .replace(/\s+#+\s*$/, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Heading extraction that ignores fenced code blocks and front matter.
 * Line numbers are 1-based and match the ids emitted by the preview pipeline
 * (`h-<line>`), which makes outline jumps and scroll sync line up exactly.
 */
export function extractOutline(markdown: string): OutlineItem[] {
  const { frontMatter } = splitFrontMatter(markdown);
  const offset = frontMatter ? frontMatter.split(/\r?\n/).length : 0;
  const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/);
  const items: OutlineItem[] = [];
  let fence: string | null = null;

  lines.forEach((line, index) => {
    if (index < offset) return;
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) {
        fence = marker;
      } else if (fence === marker) {
        fence = null;
      }
      return;
    }
    if (fence) return;

    const atx = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line);
    if (atx) {
      const text = plainHeading(atx[2]);
      if (!text) return;
      items.push({ level: atx[1].length, text, line: index + 1, id: `h-${index + 1}` });
      return;
    }

    // Setext headings (=== / ---) — the `---` case is only a heading when text precedes it.
    if (index > 0 && /^\s{0,3}(=+|-{2,})\s*$/.test(line)) {
      const prev = lines[index - 1];
      if (!prev.trim() || /^\s{0,3}([-*+]|\d+\.)\s/.test(prev)) return;
      const level = line.trim().startsWith('=') ? 1 : 2;
      const text = plainHeading(prev);
      if (!text) return;
      items.push({ level, text, line: index, id: `h-${index}` });
    }
  });

  return items;
}

export function countStats(markdown: string): DocStats {
  const { body } = splitFrontMatter(markdown);
  const withoutCode = body.replace(/```[\s\S]*?```/g, ' ');
  const chars = withoutCode.replace(/\s/g, '').length;
  const cjkMatches = withoutCode.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g);
  const cjk = cjkMatches ? cjkMatches.length : 0;
  const latin = withoutCode
    .replace(/[\u3400-\u9FFF\uF900-\uFAFF]/g, ' ')
    .replace(/[#>*_`~\-[\]()!]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const words = cjk + latin;
  const readingMinutes = Math.max(1, Math.round(words / 350));
  return { words, chars, cjk, readingMinutes };
}

export function firstHeading(markdown: string): string | null {
  const outline = extractOutline(markdown);
  return outline.length ? outline[0].text : null;
}

/** Derive a sensible "untitled" name from the first heading. */
export function deriveTitle(markdown: string): string {
  const heading = firstHeading(markdown);
  if (heading) return heading.slice(0, 80);
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~[\]()!]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.slice(0, 40) || '未命名';
}
