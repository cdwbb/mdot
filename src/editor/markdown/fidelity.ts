/** Helpers that keep Milkdown's serializer from rewriting author formatting. */

export function imageAltMap(markdown: string): Map<string, string> {
  const result = new Map<string, string>();
  const pattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown))) result.set(match[2], match[1]);
  return result;
}

export function restoreImageAlts(markdown: string, alts: Map<string, string>): string {
  return markdown.replace(/!\[([^\]]*)\]\(([^)\s]+)([^)]*)\)/g, (full, alt, src, rest) => {
    if (!/^\d+(?:\.\d+)?$/.test(alt)) return full;
    const original = alts.get(src);
    return original == null ? full : `![${original}](${src}${rest})`;
  });
}

export function compactTableDelimiters(markdown: string): string {
  let fence: string | null = null;
  return markdown
    .split('\n')
    .map((line) => {
      const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
      if (fenceMatch) {
        if (!fence) fence = fenceMatch[1][0];
        else if (fence === fenceMatch[1][0]) fence = null;
        return line;
      }
      if (fence) return line;
      if (/^\|(?:\s*:?-+:?\s*\|)+$/.test(line)) {
        const cells = line
          .split('|')
          .slice(1, -1)
          .map((cell) => {
            const trimmed = cell.trim();
            const left = trimmed.startsWith(':') ? ':' : '';
            const right = trimmed.endsWith(':') ? ':' : '';
            const dashes = trimmed.replace(/^:/, '').replace(/:$/, '');
            return `${left}${dashes.length >= 3 ? dashes : '---'}${right}`;
          });
        return `|${cells.join('|')}|`;
      }
      return line;
    })
    .join('\n');
}

export function cleanSerializedMarkdown(markdown: string, alts: Map<string, string>): string {
  return compactTableDelimiters(restoreImageAlts(markdown, alts));
}
