import { APP_VERSION } from '../version';
import { backend } from './backend';

const RELEASES_API = 'https://api.github.com/repos/cdwbb/mdot/releases/latest';
const RELEASES_PAGE = 'https://github.com/cdwbb/mdot/releases/latest';
const TIMEOUT_MS = 6000;

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'latest' }
  | { status: 'available'; version: string; url: string }
  | { status: 'failed' };

const triple = (raw: string): number[] | null => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(raw.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

export const isNewerVersion = (candidate: string, current: string): boolean => {
  const next = triple(candidate);
  const now = triple(current);
  if (!next || !now) return false;
  for (let i = 0; i < 3; i += 1) {
    if (next[i] !== now[i]) return next[i] > now[i];
  }
  return false;
};

/** Asks GitHub for the newest release. Every network or parse problem comes
 * back as `failed` — callers stay quiet unless the user asked for the check. */
export async function checkForUpdate(): Promise<UpdateState> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(RELEASES_API, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return { status: 'failed' };
    const release = (await response.json()) as {
      tag_name?: unknown;
      html_url?: unknown;
      prerelease?: unknown;
      draft?: unknown;
    };
    if (release.prerelease === true || release.draft === true) return { status: 'latest' };
    const tag = typeof release.tag_name === 'string' ? release.tag_name : '';
    const version = tag.replace(/^v/, '');
    if (!triple(version)) return { status: 'failed' };
    if (!isNewerVersion(version, APP_VERSION)) return { status: 'latest' };
    const url = typeof release.html_url === 'string' && release.html_url ? release.html_url : RELEASES_PAGE;
    return { status: 'available', version, url };
  } catch {
    return { status: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}

export const openReleasePage = (url: string): void => {
  void backend.openExternal(url);
};
