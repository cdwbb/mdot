type GotoDetail = { anchor: string; line?: number };

type ActiveHeadingDetail = { id: string | null };

const GOTO_EVENT = 'mdot:goto-anchor';
const ACTIVE_EVENT = 'mdot:active-heading';
const REQUEST_PREVIEW = 'mdot:request-preview';

/** Jump both editors (and the outline) to a heading id like `h-42`. */
export function emitGoto(detail: GotoDetail): void {
  window.dispatchEvent(new CustomEvent<GotoDetail>(GOTO_EVENT, { detail }));
}

export function onGoto(handler: (detail: GotoDetail) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<GotoDetail>).detail);
  window.addEventListener(GOTO_EVENT, listener);
  return () => window.removeEventListener(GOTO_EVENT, listener);
}

export function emitActiveHeading(id: string | null): void {
  window.dispatchEvent(new CustomEvent<ActiveHeadingDetail>(ACTIVE_EVENT, { detail: { id } }));
}

export function onActiveHeading(handler: (id: string | null) => void): () => void {
  const listener = (event: Event) =>
    handler((event as CustomEvent<ActiveHeadingDetail>).detail.id);
  window.addEventListener(ACTIVE_EVENT, listener);
  return () => window.removeEventListener(ACTIVE_EVENT, listener);
}

/** Preview asks the active source editor to scroll its cursor into view. */
export function requestPreviewRepaint(): void {
  window.dispatchEvent(new CustomEvent(REQUEST_PREVIEW));
}

export function onPreviewRepaintRequest(handler: () => void): () => void {
  window.addEventListener(REQUEST_PREVIEW, handler);
  return () => window.removeEventListener(REQUEST_PREVIEW, handler);
}
