/**
 * Browser storage that never throws. Private browsing, quota errors and disabled storage fall back
 * to memory, and the UI explains "Keep this tab open to stay connected."
 */

type Kind = 'local' | 'session';

const memory: Record<Kind, Map<string, string>> = { local: new Map(), session: new Map() };
const available: Record<Kind, boolean | null> = { local: null, session: null };

function backing(kind: Kind): Storage | null {
  if (available[kind] === false) return null;
  try {
    const storage = kind === 'local' ? window.localStorage : window.sessionStorage;
    if (available[kind] === null) {
      const probe = '__larpbox_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      available[kind] = true;
    }
    return storage;
  } catch {
    available[kind] = false;
    return null;
  }
}

export function persistentStorageAvailable(): boolean {
  return backing('local') !== null;
}

export function readItem(kind: Kind, key: string): string | null {
  const storage = backing(kind);
  if (!storage) return memory[kind].get(key) ?? null;
  try {
    return storage.getItem(key);
  } catch {
    return memory[kind].get(key) ?? null;
  }
}

export function writeItem(kind: Kind, key: string, value: string): void {
  memory[kind].set(key, value);
  const storage = backing(kind);
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Quota or privacy error: the memory copy keeps this tab working.
  }
}

export function removeItem(kind: Kind, key: string): void {
  memory[kind].delete(key);
  const storage = backing(kind);
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore.
  }
}

export function keysWithPrefix(kind: Kind, prefix: string): string[] {
  const keys = new Set<string>();
  for (const key of memory[kind].keys()) if (key.startsWith(prefix)) keys.add(key);
  const storage = backing(kind);
  if (storage) {
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key?.startsWith(prefix)) keys.add(key);
      }
    } catch {
      // Ignore.
    }
  }
  return [...keys];
}

export function readJson<T>(kind: Kind, key: string, guard: (value: unknown) => value is T): T | null {
  const raw = readItem(kind, key);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return guard(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeJson(kind: Kind, key: string, value: unknown): void {
  writeItem(kind, key, JSON.stringify(value));
}
