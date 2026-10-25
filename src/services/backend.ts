import type { Backend } from '../types';
import { isTauri } from './platform';
import { createTauriBackend } from './tauriBackend';
import { createWebBackend } from './webBackend';

export const backend: Backend = isTauri() ? createTauriBackend() : createWebBackend();

export const isDesktop = backend.kind === 'tauri';
