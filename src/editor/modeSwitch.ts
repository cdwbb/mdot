import { useAppStore } from '../store/useAppStore';
import type { EditorMode, ScrollTarget } from '../types';

export interface ScrollController {
  capture(): ScrollTarget;
  restore(target: ScrollTarget): void;
}

const controllers = new Map<EditorMode, ScrollController>();
let pending: ScrollTarget | null = null;

export function registerScrollController(mode: EditorMode, controller: ScrollController): () => void {
  controllers.set(mode, controller);
  return () => {
    if (controllers.get(mode) === controller) controllers.delete(mode);
  };
}

export function takePendingScroll(mode: EditorMode): ScrollTarget | null {
  if (!pending || pending.from === mode) {
    pending = null;
    return null;
  }
  const target = pending;
  pending = null;
  return target;
}

export function clearPendingScroll(): void {
  pending = null;
}

/** Switch editor mode while carrying the reading position across. */
export function switchMode(next: EditorMode): void {
  const state = useAppStore.getState();
  if (state.mode === next) return;
  const controller = controllers.get(state.mode);
  pending = controller ? controller.capture() : null;
  state.setMode(next);
  state.patchSettings({ defaultMode: next });
}

export function toggleMode(): void {
  const order: EditorMode[] = ['seamless', 'split', 'dual'];
  const mode = useAppStore.getState().mode;
  const index = order.indexOf(mode);
  switchMode(order[(index + 1) % order.length]);
}
