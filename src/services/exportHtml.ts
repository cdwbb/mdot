import { renderMermaidSvg } from '../editor/markdown/mermaid';

export interface BuildExportOptions {
  markdown: string;
  title: string;
  docPath: string | null;
  resolveImage: (src: string) => string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const standaloneCss = `
:root{color-scheme:light;--ink:#232f3d;--muted:#6b7480;--faint:#98a0aa;--line:#e6e6e0;--bg:#fbfbf9;--paper:#fff;--accent:#2f7cf6;--code:#f3f3ef;--code-line:#e6e6e0;--mark:rgba(251,188,5,.36);--table:#f5f5f1}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;padding:48px 24px 80px;background:var(--bg);color:var(--ink);font-family:'Segoe UI Variable Text','Segoe UI',-apple-system,BlinkMacSystemFont,'SF Pro Text','PingFang SC','Microsoft YaHei',sans-serif;font-size:16.5px;line-height:1.78;-webkit-font-smoothing:antialiased;text-spacing-trim:trim-start;hanging-punctuation:allow-end}
article{max-width:760px;margin:0 auto;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:52px 60px 64px}
article>*:first-child{margin-top:0}
p{margin:.85em 0}
h1,h2,h3,h4,h5,h6{color:#1b2430;font-weight:650;line-height:1.32;letter-spacing:-.012em;margin:1.7em 0 .6em;scroll-margin-top:32px}
h1{font-size:1.92em;margin-top:.4em;letter-spacing:-.022em}
h2{font-size:1.48em;padding-bottom:.28em;border-bottom:1px solid var(--line)}
h3{font-size:1.22em}h4{font-size:1.07em}h5{font-size:.98em}h6{font-size:.92em;color:var(--muted)}
a{color:var(--accent);text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--accent) 32%,transparent)}
strong{font-weight:650;color:#1b2430}
mark{background:var(--mark);border-radius:2px;padding:.05em .15em}
ul,ol{margin:.75em 0;padding-left:1.55em}
li{margin:.28em 0}
li::marker{color:var(--muted)}
ul.contains-task-list{list-style:none;padding-left:.25em}
li.task-list-item{list-style:none}
li.task-list-item>p.task-item-p{display:flex;align-items:baseline;gap:.5em}
input[type=checkbox]{appearance:none;width:1.02em;height:1.02em;border-radius:4px;border:1.5px solid #d7d7d0;background:#fff;display:inline-grid;place-content:center;margin:0;transform:translateY(.14em);flex:0 0 auto}
input[type=checkbox]:checked{background:var(--accent);border-color:var(--accent)}
input[type=checkbox]:checked::after{content:'';width:.55em;height:.3em;border-left:1.8px solid #fff;border-bottom:1.8px solid #fff;transform:rotate(-45deg) translateY(-1px)}
blockquote{margin:1.1em 0;padding:.15em 1.1em;border-left:3px solid #d9d9d2;color:#5a6572;background:rgba(35,47,61,.024);border-radius:0 6px 6px 0}
blockquote>*:first-child{margin-top:0}blockquote>*:last-child{margin-bottom:0}
hr{border:0;height:1px;background:#e2e2dc;margin:2.1em 0}
code{font-family:'Cascadia Mono','SF Mono',Menlo,Consolas,monospace;font-size:.875em;background:var(--code);border:1px solid var(--code-line);color:#b4331f;border-radius:4px;padding:.13em .36em}
pre{margin:1.15em 0;padding:1em 1.1em;background:var(--code);border:1px solid var(--code-line);border-radius:9px;overflow:auto;line-height:1.62;font-size:.86em}
pre code{background:none;border:0;padding:0;color:var(--ink);font-size:1em;white-space:pre}
img{max-width:100%;border-radius:6px;display:block;margin:1.2em auto}
table{width:100%;border-collapse:collapse;margin:1.2em 0;font-size:.94em;line-height:1.6}
.md-table-wrap{overflow-x:auto;margin:1.2em 0;border:1px solid var(--line);border-radius:6px}
.md-table-wrap table{margin:0}
th,td{border-bottom:1px solid var(--line);border-right:1px solid var(--line);padding:.45em .8em;text-align:left;vertical-align:top}
th:last-child,td:last-child{border-right:0}tbody tr:last-child td{border-bottom:0}
th{background:var(--table);font-weight:600;white-space:nowrap}
.code-block{position:relative;margin:1.2em 0}
.code-block pre{margin:0;padding-top:2.1em}
.code-block__head{position:absolute;top:0;left:0;right:0;height:1.95em;display:flex;align-items:center;padding:0 12px;border-bottom:1px solid var(--code-line);font-family:'Segoe UI',sans-serif;font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.code-block__copy{display:none}
.mermaid-block{display:flex;justify-content:center;margin:1.3em 0;padding:8px 0;overflow-x:auto}
.mermaid-block svg{max-width:100%;height:auto}
.frontmatter{margin:0 0 1.6em;border:1px solid var(--line);border-radius:8px;background:#f5f5f1;overflow:hidden}
.frontmatter__head{padding:6px 10px;font-family:'Segoe UI',sans-serif;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);border-bottom:1px solid var(--line)}
.frontmatter pre{margin:0;border:0;background:transparent;border-radius:0;font-size:12px;color:#5a6572;padding:9px 12px}
.katex-display{margin:1.2em 0;overflow-x:auto;overflow-y:hidden;padding:2px 0}
.math-error{font-family:monospace;color:#d93a2c;background:rgba(234,67,53,.1);padding:.1em .35em;border-radius:4px}
.heading-anchor{display:none}
.hljs-comment,.hljs-quote{color:var(--faint);font-style:italic}
.hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-type{color:#a626a4}
.hljs-string,.hljs-regexp,.hljs-addition{color:#2b8f47}
.hljs-number,.hljs-built_in,.hljs-symbol{color:#b76b01}
.hljs-title,.hljs-section,.hljs-name{color:#2f6fdb}
.hljs-attr,.hljs-attribute,.hljs-variable,.hljs-template-variable{color:#986801}
.hljs-meta,.hljs-selector-id,.hljs-selector-class{color:#7a5af8}
.hljs-deletion{color:#d93a2c}
footer{max-width:760px;margin:22px auto 0;text-align:center;font-size:11px;color:var(--faint)}
@media (max-width:760px){body{padding:0}article{border:0;border-radius:0;padding:28px 20px 56px}}
@media print{@page{margin:18mm}body{background:#fff;padding:0;font-size:11.5pt}article{max-width:none;border:0;border-radius:0;padding:0;background:#fff}footer{display:none}a{color:inherit;border:0}h1,h2,h3{break-after:avoid}pre,table,blockquote,img{break-inside:avoid}}
`;

export async function buildExportHtml(options: BuildExportOptions): Promise<string> {
  const [{ renderMarkdown }, katexModule] = await Promise.all([
    import('../editor/markdown/pipeline'),
    import('katex/dist/katex.min.css?inline'),
  ]);

  const { html } = renderMarkdown(options.markdown, {
    docPath: options.docPath,
    resolveImage: options.resolveImage,
  });

  const container = document.createElement('div');
  container.innerHTML = html;

  const mermaidBlocks = Array.from(container.querySelectorAll<HTMLElement>('.mermaid-block'));
  await Promise.all(
    mermaidBlocks.map(async (block) => {
      const source = block.querySelector('pre')?.textContent ?? '';
      if (!source.trim()) return;
      const svg = await renderMermaidSvg(source, false);
      if (svg) {
        block.innerHTML = svg;
        block.classList.remove('is-pending');
      } else {
        block.innerHTML = `<pre>${escapeHtml(source)}</pre>`;
      }
    }),
  );

  container.querySelectorAll('.code-block__copy').forEach((node) => node.remove());

  const katexCss = (katexModule as { default?: string }).default ?? '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="mdot">
<title>${escapeHtml(options.title)}</title>
<style>${katexCss}</style>
<style>${standaloneCss}</style>
</head>
<body>
<article class="md-body">
${container.innerHTML}
</article>
<footer>由 mdot 导出 · ${new Date().toLocaleString('zh-CN')}</footer>
</body>
</html>`;
}
