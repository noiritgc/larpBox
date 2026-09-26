import { checkPost, POST_ISSUE_MESSAGES, type AssignmentView, type DraftAckData } from '@larpbox/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { readLocalDraft, removeLocalDraft, writeLocalDraft, type LocalDraft } from '../lib/drafts';
import { uuid } from '../lib/ids';
import type { CommandResult, RoomConnection } from '../lib/socket';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'local' | 'paused' | 'error';

export interface DraftController {
  text: string;
  setText(value: string): void;
  /** Save now (blur, tab switch). */
  flush(): void;
  lock(): Promise<boolean>;
  saveStatus: SaveStatus;
  locking: boolean;
  /** The editor text was restored from this phone after a refresh or disconnect. */
  restored: boolean;
  message: string | null;
}

const SAVE_DEBOUNCE_MS = 400;

function initialDraft(gameId: string, roomId: string, assignment: AssignmentView): { text: string; restored: boolean; dirty: boolean } {
  if (assignment.status !== 'DRAFT') return { text: assignment.finalText ?? assignment.draftText, restored: false, dirty: false };
  const local = readLocalDraft(gameId, assignment.id);
  if (local && local.roomId === roomId && (local.unsent || local.pendingLock) && local.text !== assignment.draftText) {
    // Prefer newer unsent text from this phone; it is rebased onto the server revision on save.
    return { text: local.text, restored: true, dirty: true };
  }
  return { text: assignment.draftText, restored: false, dirty: false };
}

/**
 * Autosave for one assignment: every keystroke is written to this phone at once, the server copy
 * is debounced (400ms) with one save in flight, and a lock sends the complete text after any
 * outstanding save. Server state always wins once an assignment is locked or forfeited.
 */
export function useDraft(params: {
  gameId: string;
  roomId: string;
  assignment: AssignmentView;
  connection: RoomConnection | null;
  connected: boolean;
  paused: boolean;
}): DraftController {
  const { gameId, roomId, assignment, connection, connected, paused } = params;
  const [initial] = useState(() => initialDraft(gameId, roomId, assignment));
  const [text, setTextState] = useState(initial.text);
  const [restored, setRestored] = useState(initial.restored);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(initial.dirty ? 'local' : assignment.draftRevision > 0 ? 'saved' : 'idle');
  const [locking, setLocking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const textRef = useRef(initial.text);
  const dirtyRef = useRef(initial.dirty);
  const revisionRef = useRef(assignment.draftRevision);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const queuedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const lockingRef = useRef(false);
  const lockedRef = useRef(assignment.status !== 'DRAFT');
  const connectionRef = useRef(connection);
  const liveRef = useRef({ connected, paused });
  connectionRef.current = connection;
  liveRef.current = { connected, paused };

  const persistLocal = useCallback(
    (patch: Partial<LocalDraft>) => {
      const previous = readLocalDraft(gameId, assignment.id);
      writeLocalDraft(gameId, assignment.id, {
        roomId,
        text: textRef.current,
        lastAckRevision: revisionRef.current,
        unsent: dirtyRef.current,
        pendingLock: previous?.pendingLock ?? null,
        updatedAt: Date.now(),
        ...patch,
      });
    },
    [assignment.id, gameId, roomId],
  );

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const save = useCallback((): Promise<void> => {
    clearTimer();
    if (lockedRef.current || lockingRef.current || !dirtyRef.current) return Promise.resolve();
    if (inFlightRef.current) {
      queuedRef.current = true;
      return inFlightRef.current;
    }
    const conn = connectionRef.current;
    if (!conn || !liveRef.current.connected) {
      setSaveStatus('local');
      return Promise.resolve();
    }
    if (liveRef.current.paused) {
      setSaveStatus('paused');
      return Promise.resolve();
    }
    const check = checkPost(textRef.current);
    if (!check.okForDraft) {
      setSaveStatus('local');
      return Promise.resolve();
    }
    const sent = textRef.current;
    setSaveStatus('saving');
    const flight = conn
      .command('writing.saveDraft', { assignmentId: assignment.id, text: sent, expectedDraftRevision: revisionRef.current })
      .then((result: CommandResult) => {
        if (result.ok) {
          const data = result.data as DraftAckData | undefined;
          if (data) revisionRef.current = data.draftRevision;
          if (textRef.current === sent) {
            dirtyRef.current = false;
            setSaveStatus('saved');
          }
          persistLocal({ lastAckRevision: revisionRef.current, unsent: dirtyRef.current });
          return;
        }
        switch (result.code) {
          case 'REVISION_CONFLICT':
            // The server sends this phone a fresh private snapshot; the effect below rebases.
            setSaveStatus('local');
            return;
          case 'GAME_PAUSED':
            setSaveStatus('paused');
            return;
          case 'OFFLINE':
            setSaveStatus('local');
            return;
          case 'ALREADY_LOCKED':
          case 'PHASE_CHANGED':
          case 'DEADLINE_PASSED':
            return;
          case 'RATE_LIMITED':
            setSaveStatus('local');
            timerRef.current = window.setTimeout(() => void save(), result.retryAfterMs ?? 1_000);
            return;
          default:
            setSaveStatus('error');
        }
      })
      .finally(() => {
        inFlightRef.current = null;
        if (queuedRef.current) {
          queuedRef.current = false;
          if (dirtyRef.current && !lockingRef.current) void save();
        } else if (dirtyRef.current && textRef.current !== sent && !lockingRef.current) {
          timerRef.current = window.setTimeout(() => void save(), SAVE_DEBOUNCE_MS);
        }
      });
    inFlightRef.current = flight;
    return flight;
  }, [assignment.id, persistLocal]);

  const setText = useCallback(
    (value: string) => {
      if (lockedRef.current) return;
      textRef.current = value;
      dirtyRef.current = true;
      setTextState(value);
      setMessage(null);
      // The restored-draft notice stays until the writer edits again.
      setRestored(false);
      persistLocal({ unsent: true });
      clearTimer();
      timerRef.current = window.setTimeout(() => void save(), SAVE_DEBOUNCE_MS);
      setSaveStatus((current) => (current === 'saving' ? current : liveRef.current.connected ? 'saving' : 'local'));
    },
    [persistLocal, save],
  );

  const flush = useCallback(() => {
    void save();
  }, [save]);

  const lock = useCallback(async (): Promise<boolean> => {
    if (lockedRef.current || lockingRef.current) return false;
    const conn = connectionRef.current;
    const check = checkPost(textRef.current);
    if (!check.okForLock) {
      setMessage(POST_ISSUE_MESSAGES[check.issues[0] ?? 'TOO_SHORT']);
      return false;
    }
    if (!conn || !liveRef.current.connected) {
      setMessage('Reconnecting… your post is saved on this phone.');
      return false;
    }
    lockingRef.current = true;
    setLocking(true);
    setMessage(null);
    clearTimer();
    queuedRef.current = false;
    try {
      // Wait for the outstanding save; the lock carries the full text anyway.
      if (inFlightRef.current) await inFlightRef.current;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const requestId = uuid();
        const finalText = textRef.current;
        persistLocal({ pendingLock: { requestId, text: finalText } });
        const result = await conn.command(
          'writing.lockPost',
          { assignmentId: assignment.id, text: finalText, expectedDraftRevision: revisionRef.current },
          { requestId },
        );
        if (result.ok) {
          lockedRef.current = true;
          dirtyRef.current = false;
          removeLocalDraft(gameId, assignment.id);
          return true;
        }
        if (result.code === 'REVISION_CONFLICT') {
          // Wait briefly for the private sync snapshot to rebase the revision, then retry once.
          await new Promise((resolve) => window.setTimeout(resolve, 300));
          continue;
        }
        if (result.code === 'ALREADY_LOCKED' || result.code === 'PHASE_CHANGED' || result.code === 'DEADLINE_PASSED') {
          return false;
        }
        setMessage(result.code === 'BAD_INPUT' ? result.message : result.code === 'GAME_PAUSED' ? 'The game is paused. Lock again when it resumes.' : "Couldn't lock your post. Try again.");
        return false;
      }
      setMessage('Your post changed on the server. Check it and lock again.');
      return false;
    } finally {
      lockingRef.current = false;
      setLocking(false);
    }
  }, [assignment.id, gameId, persistLocal]);

  // Server snapshot updates: adopt newer revisions, and follow a server-side lock or forfeit.
  useEffect(() => {
    if (assignment.status !== 'DRAFT') {
      lockedRef.current = true;
      dirtyRef.current = false;
      clearTimer();
      const local = readLocalDraft(gameId, assignment.id);
      if (!local || local.text === assignment.finalText || local.pendingLock?.text === assignment.finalText) {
        removeLocalDraft(gameId, assignment.id);
      }
      textRef.current = assignment.finalText ?? textRef.current;
      setTextState(textRef.current);
      return;
    }
    // While a save is in flight its ack carries the revision; otherwise the snapshot is authoritative.
    if (assignment.draftRevision !== revisionRef.current && !inFlightRef.current) {
      revisionRef.current = assignment.draftRevision;
      if (!dirtyRef.current) {
        textRef.current = assignment.draftText;
        setTextState(assignment.draftText);
      } else if (!inFlightRef.current) {
        void save();
      }
    }
  }, [assignment.status, assignment.draftRevision, assignment.draftText, assignment.finalText, assignment.id, gameId, save]);

  // Coming back online or unpausing: send whatever is waiting.
  useEffect(() => {
    if (connected && !paused && dirtyRef.current && !lockedRef.current) void save();
  }, [connected, paused, save]);

  // Save restored text right away, and flush on unmount (tab switch or phase change).
  useEffect(() => {
    if (dirtyRef.current) void save();
    return () => {
      clearTimer();
      if (dirtyRef.current && !lockedRef.current) void save();
    };
  }, [save]);

  return { text, setText, flush, lock, saveStatus, locking, restored, message };
}
