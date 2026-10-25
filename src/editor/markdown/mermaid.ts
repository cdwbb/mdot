type MermaidApi = typeof import('mermaid')['default'];

let loader: Promise<MermaidApi> | null = null;
let initializedTheme: string | null = null;
const svgCache = new Map<string, string>();

function getMermaid(): Promise<MermaidApi> {
  loader ??= import('mermaid').then((mod) => mod.default);
  return loader;
}

async function ensureTheme(dark: boolean): Promise<MermaidApi> {
  const api = await getMermaid();
  const key = dark ? 'dark' : 'light';
  if (initializedTheme !== key) {
    api.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'neutral',
      fontFamily:
        "'Segoe UI Variable Text', 'Segoe UI', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
      flowchart: { htmlLabels: true, curve: 'basis' },
      themeVariables: dark
        ? {
            background: '#1b1f24',
            primaryColor: '#26313f',
            primaryTextColor: '#e4e7ea',
            primaryBorderColor: '#4285f4',
            lineColor: '#5b6572',
            secondaryColor: '#232830',
            tertiaryColor: '#1f252c',
            fontSize: '14px',
          }
        : {
            background: '#fbfbf9',
            primaryColor: '#eef4ff',
            primaryTextColor: '#232f3d',
            primaryBorderColor: '#4285f4',
            lineColor: '#9aa1ab',
            secondaryColor: '#f5f5f1',
            tertiaryColor: '#faf9f4',
            fontSize: '14px',
          },
    });
    initializedTheme = key;
  }
  return api;
}

let uid = 0;

/**
 * Renders every unfilled mermaid block inside `root`.
 * Returns false when the generation token is stale (a newer render started).
 */
export async function renderMermaidBlocks(
  root: HTMLElement,
  dark: boolean,
  generation: number,
  currentGeneration: () => number,
): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-block'));
  if (!blocks.length) return;

  let api: MermaidApi;
  try {
    api = await ensureTheme(dark);
  } catch {
    return;
  }
  if (generation !== currentGeneration()) return;

  for (const block of blocks) {
    if (generation !== currentGeneration()) return;
    const source = block.querySelector('pre.mermaid-src')?.textContent ?? '';
    if (!source.trim()) continue;

    const cacheKey = `${dark ? 'd' : 'l'}::${source}`;
    const cached = svgCache.get(cacheKey);
    if (cached) {
      block.innerHTML = cached;
      block.classList.remove('is-pending');
      continue;
    }

    try {
      const id = `mdot-mmd-${++uid}`;
      const { svg } = await api.render(id, source);
      if (generation !== currentGeneration()) return;
      if (svgCache.size > 80) {
        const first = svgCache.keys().next().value;
        if (first) svgCache.delete(first);
      }
      svgCache.set(cacheKey, svg);
      block.innerHTML = svg;
      block.classList.remove('is-pending');
    } catch (error) {
      if (generation !== currentGeneration()) return;
      const message = error instanceof Error ? error.message : String(error);
      block.innerHTML = `<div class="mermaid-error">Mermaid 渲染失败\n${message
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')}</div>`;
      block.classList.remove('is-pending');
    }
  }
}

/** Render a single mermaid graph to standalone SVG markup (used by HTML export). */
export async function renderMermaidSvg(source: string, dark = false): Promise<string | null> {
  try {
    const api = await ensureTheme(dark);
    const { svg } = await api.render(`mdot-export-${++uid}`, source);
    return svg;
  } catch {
    return null;
  }
}

/** Copy helper used by preview code blocks and headings. */export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
