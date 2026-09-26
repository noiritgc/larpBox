import { STORAGE_KEYS } from '@larpbox/shared';
import { readJson, removeItem, writeJson } from './storage';

/** Phone-local copy of a draft, written on every keystroke so a refresh never loses text. */
export interface LocalDraft {
  roomId: string;
  text: string;
  /** Server draftRevision this text was last acknowledged at (or rebased onto). */
  lastAckRevision: number;
  /** True when `text` has changes the server has not acknowledged. */
  unsent: boolean;
  updatedAt: number;
  /** A lock that was sent but whose ack never arrived (refresh or connection loss). */
  pendingLock: { requestId: string; text: string } | null;
}

function isDraft(value: unknown): value is LocalDraft {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as LocalDraft).text === 'string' &&
    typeof (value as LocalDraft).lastAckRevision === 'number'
  );
}

export function readLocalDraft(gameId: string, assignmentId: string): LocalDraft | null {
  return readJson('local', STORAGE_KEYS.draft(gameId, assignmentId), isDraft);
}

export function writeLocalDraft(gameId: string, assignmentId: string, draft: LocalDraft): void {
  writeJson('local', STORAGE_KEYS.draft(gameId, assignmentId), draft);
}

export function removeLocalDraft(gameId: string, assignmentId: string): void {
  removeItem('local', STORAGE_KEYS.draft(gameId, assignmentId));
}
