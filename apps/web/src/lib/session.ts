import { STORAGE_KEYS } from '@larpbox/shared';
import { keysWithPrefix, readItem, readJson, removeItem, writeItem, writeJson } from './storage';

/**
 * Room credentials are scoped capabilities for one private game, not accounts. Host and player
 * credentials use separate keys so the host operator can also play from another tab.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface HostCredential {
  roomId: string;
  roomCode: string;
  token: string;
  createdAt: number;
}

export interface PlayerCredential {
  roomId: string;
  roomCode: string;
  playerId: string;
  token: string;
  name: string;
  createdAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHost(value: unknown): value is HostCredential {
  return isRecord(value) && typeof value.roomId === 'string' && typeof value.token === 'string' && typeof value.roomCode === 'string';
}

function isPlayer(value: unknown): value is PlayerCredential {
  return isHost(value) && typeof (value as unknown as PlayerCredential).playerId === 'string';
}

function roomIdForCode(code: string): string | null {
  return readItem('local', STORAGE_KEYS.roomIndex(code));
}

export function saveHostCredential(credential: HostCredential): void {
  writeJson('local', STORAGE_KEYS.host(credential.roomId), credential);
  writeItem('local', STORAGE_KEYS.roomIndex(credential.roomCode), credential.roomId);
}

export function savePlayerCredential(credential: PlayerCredential): void {
  writeJson('local', STORAGE_KEYS.player(credential.roomId), credential);
  writeItem('local', STORAGE_KEYS.roomIndex(credential.roomCode), credential.roomId);
}

export function hostCredentialFor(code: string): HostCredential | null {
  const roomId = roomIdForCode(code);
  if (!roomId) return null;
  const credential = readJson('local', STORAGE_KEYS.host(roomId), isHost);
  return credential && credential.roomCode === code ? credential : null;
}

export function playerCredentialFor(code: string): PlayerCredential | null {
  const roomId = roomIdForCode(code);
  if (!roomId) return null;
  const credential = readJson('local', STORAGE_KEYS.player(roomId), isPlayer);
  return credential && credential.roomCode === code ? credential : null;
}

/** Clears this room's credential for one role and every related draft. Other rooms are untouched. */
export function forgetRoom(roomId: string, role: 'host' | 'player'): void {
  const hostKey = STORAGE_KEYS.host(roomId);
  const playerKey = STORAGE_KEYS.player(roomId);
  const host = readJson('local', hostKey, isHost);
  const player = readJson('local', playerKey, isPlayer);
  if (role === 'host') removeItem('local', hostKey);
  else removeItem('local', playerKey);
  const code = host?.roomCode ?? player?.roomCode;
  const otherRoleRemains = role === 'host' ? player !== null : host !== null;
  if (code && !otherRoleRemains) removeItem('local', STORAGE_KEYS.roomIndex(code));
  if (role === 'player') {
    for (const key of keysWithPrefix('local', 'larpbox:draft:')) {
      const draft = readJson('local', key, isRecord);
      if (draft && draft.roomId === roomId) removeItem('local', key);
    }
  }
}

/** Removes abandoned credentials and drafts older than a day. Runs once per page load. */
export function purgeStaleEntries(now = Date.now()): void {
  for (const prefix of ['larpbox:host:', 'larpbox:player:', 'larpbox:draft:']) {
    for (const key of keysWithPrefix('local', prefix)) {
      const value = readJson('local', key, isRecord);
      const stamp = value ? (value.createdAt ?? value.updatedAt) : null;
      if (!value || typeof stamp !== 'number' || now - stamp > DAY_MS) removeItem('local', key);
    }
  }
  for (const key of keysWithPrefix('local', 'larpbox:roomIndex:')) {
    const roomId = readItem('local', key);
    if (!roomId) continue;
    const alive = readItem('local', STORAGE_KEYS.host(roomId)) ?? readItem('local', STORAGE_KEYS.player(roomId));
    if (!alive) removeItem('local', key);
  }
}

// Pending bootstrap requests survive a reload so a retried create/join reuses its request ID.

export interface PendingRequest {
  requestId: string;
  bodyKey: string;
  createdAt: number;
}

function isPending(value: unknown): value is PendingRequest {
  return isRecord(value) && typeof value.requestId === 'string' && typeof value.bodyKey === 'string';
}

const PENDING_TTL_MS = 2 * 60 * 1000;

export function pendingRequestId(slot: string, bodyKey: string): string | null {
  const pending = readJson('session', `larpbox:pending:${slot}`, isPending);
  if (!pending || pending.bodyKey !== bodyKey || Date.now() - pending.createdAt > PENDING_TTL_MS) return null;
  return pending.requestId;
}

export function rememberPendingRequest(slot: string, requestId: string, bodyKey: string): void {
  writeJson('session', `larpbox:pending:${slot}`, { requestId, bodyKey, createdAt: Date.now() });
}

export function clearPendingRequest(slot: string): void {
  removeItem('session', `larpbox:pending:${slot}`);
}
