import type {
  AckSuccess,
  AvatarId,
  Endorsement,
  PauseReason,
  Phase,
  ResultStamp,
  RoomSettings,
  Side,
} from '@larpbox/shared';
import type { PromptDefinition } from '../content/loadPrompts.js';
import type { TimerHandle } from './clock.js';

/**
 * Internal domain model. Nothing here is ever sent to a client directly: projections build
 * explicit DTOs from it. Room-level lifetime timestamps are monotonic milliseconds; player and
 * phase timestamps are epoch milliseconds for display.
 */

export interface PlayerRecord {
  id: string;
  name: string;
  normalizedName: string;
  avatarId: AvatarId;
  seat: number;
  headline: string;
  ready: boolean;
  connected: boolean;
  everConnected: boolean;
  lastSeenAt: number;
  joinedAt: number;
  score: number;
}

export interface CachedAck {
  hash: string;
  /** Monotonic time the ack was cached. */
  at: number;
  ack: AckSuccess;
}

export interface SessionRecord {
  id: string;
  role: 'host' | 'player';
  playerId: string | null;
  tokenHash: string;
  revoked: boolean;
  activeSocketId: string | null;
  activeClientInstanceId: string | null;
  connectionGeneration: number;
  requests: Map<string, CachedAck>;
}

export interface PhaseState {
  name: Phase;
  id: string;
  startedAt: number;
  deadlineAt: number | null;
  durationMs: number | null;
  /** Active (unpaused) time accumulated before the current segment. */
  elapsedBeforePauseMs: number;
  pause: null | {
    reason: PauseReason;
    pausedAt: number;
    remainingMs: number;
  };
  writeExtensionUsed: boolean;
}

export type AssignmentStatus = 'DRAFT' | 'LOCKED' | 'FORFEIT';

export interface Assignment {
  id: string;
  playerId: string;
  duelId: string;
  draftText: string;
  draftRevision: number;
  finalText: string | null;
  status: AssignmentStatus;
  lockedAt: number | null;
  autoSubmitted: boolean;
}

export interface GuessOptionRecord {
  id: string;
  label: string;
}

export interface DuelSideOutcome {
  playerId: string;
  text: string | null;
  forfeit: boolean;
  autoSubmitted: boolean;
  votes: number;
  points: number;
}

/** Immutable after settlement. */
export interface DuelResult {
  duelId: string;
  roundNumber: number;
  multiplier: 1 | 2;
  truth: string;
  facts: string[];
  boundaries: string[];
  correctOptionId: string;
  sides: Record<Side, DuelSideOutcome>;
  votesNeither: number;
  ballotsCast: number;
  eligibleReaders: number;
  correctGuesserIds: string[];
  guessPoints: number;
  stamp: ResultStamp;
  deltas: Record<string, number>;
  totalsAfter: Record<string, number>;
}

export interface Duel {
  id: string;
  roundIndex: number;
  orderIndex: number;
  prompt: PromptDefinition;
  assignmentBySide: Record<Side, string>;
  writerBySide: Record<Side, string>;
  options: GuessOptionRecord[];
  correctOptionId: string;
  readerIds: string[];
  guesses: Map<string, string>;
  endorsements: Map<string, Endorsement>;
  settled: boolean;
  result: DuelResult | null;
}

export interface Round {
  index: number;
  multiplier: 1 | 2;
  /** Duel IDs in presentation order. */
  duelIds: string[];
  /** Repeated pairings versus round 1 (0 for round 1). */
  repeatedPairings: number;
  scoreAtStart: Record<string, number>;
}

export interface GameState {
  id: string;
  seed: string;
  rosterIds: string[];
  rounds: Round[];
  assignments: Map<string, Assignment>;
  duels: Map<string, Duel>;
  roundIndex: number;
  duelIndex: number;
}

export interface Room {
  id: string;
  code: string;
  revision: number;
  createdAt: number;
  lastHumanActivityAt: number;
  allDisconnectedSince: number | null;
  hostDisconnectedSince: number | null;
  settings: RoomSettings;
  /** Host changed settings in the lobby; unready players see "Settings changed. Ready up again." */
  settingsChanged: boolean;
  phase: PhaseState;
  players: Map<string, PlayerRecord>;
  sessions: Map<string, SessionRecord>;
  game: GameState | null;
  usedPromptIds: Set<string>;
}

/** Process-local runtime registry for one room: timers and monotonic anchors. */
export interface RoomRuntime {
  phaseTimer: TimerHandle | null;
  earlyTimer: TimerHandle | null;
  /** Monotonic start of the current unpaused segment of the phase. */
  segmentStartMono: number;
  /** Monotonic deadline of the current timed phase; null when untimed or paused. */
  deadlineMono: number | null;
  /** Monotonic time the current pause began. */
  pausedAtMono: number | null;
  reservationTimers: Map<string, TimerHandle>;
}

export interface RoomEntry {
  room: Room;
  runtime: RoomRuntime;
}
