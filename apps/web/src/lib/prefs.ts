import { STORAGE_KEYS } from '@larpbox/shared';
import { readJson, writeJson } from './storage';

/** Harmless per-device preferences. */
export interface Prefs {
  sound: boolean;
  motion: 'system' | 'reduced';
}

const DEFAULT_PREFS: Prefs = { sound: true, motion: 'system' };

function isPrefs(value: unknown): value is Partial<Prefs> {
  return typeof value === 'object' && value !== null;
}

export function readPrefs(): Prefs {
  const stored = readJson('local', STORAGE_KEYS.prefs, isPrefs) ?? {};
  return {
    sound: typeof stored.sound === 'boolean' ? stored.sound : DEFAULT_PREFS.sound,
    motion: stored.motion === 'reduced' ? 'reduced' : 'system',
  };
}

export function writePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...readPrefs(), ...patch };
  writeJson('local', STORAGE_KEYS.prefs, next);
  applyMotionPreference(next.motion);
  return next;
}

export function applyMotionPreference(motion: Prefs['motion']): void {
  if (motion === 'reduced') document.documentElement.dataset.motion = 'reduced';
  else delete document.documentElement.dataset.motion;
}

export function prefersReducedMotion(): boolean {
  if (document.documentElement.dataset.motion === 'reduced') return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
