import { z } from 'zod';
import {
  CLOSE_REASONS,
  ENDORSEMENTS,
  ERROR_CODES,
  MAX_PLAYERS,
  PAUSE_REASONS,
  PHASES,
  PROTOCOL_VERSION,
  SIDES,
} from './constants.js';
import { AvatarIdSchema, RoomCodeSchema, RoomSettingsSchema, UuidSchema } from './schemas.js';

/**
 * Role-filtered views the server sends to each recipient. Every object is strict, so a projection
 * that accidentally carries an extra (possibly secret) field fails validation in tests and on the
 * client. Screens are a discriminated union on `kind`, which always equals the current phase name.
 */

const Int = z.int();
const Count = z.int().nonnegative();

export const PhaseNameSchema = z.enum(PHASES);
export const SideSchema = z.enum(SIDES);
export const EndorsementSchema = z.enum(ENDORSEMENTS);
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export const CloseReasonSchema = z.enum(CLOSE_REASONS);
export const MultiplierSchema = z.union([z.literal(1), z.literal(2)]);

export const PublicPlayerSchema = z.strictObject({
  id: UuidSchema,
  name: z.string(),
  avatarId: AvatarIdSchema,
  headline: z.string(),
  seat: z.int().min(0).max(MAX_PLAYERS - 1),
  ready: z.boolean(),
  connected: z.boolean(),
  /** Reserved over HTTP but no socket has authenticated yet. */
  joining: z.boolean(),
  score: Int,
});
export type PublicPlayer = z.infer<typeof PublicPlayerSchema>;

export const PhaseViewSchema = z.strictObject({
  name: PhaseNameSchema,
  id: UuidSchema,
  startedAt: z.number(),
  /** Epoch deadline consistent with `serverNow`; null when untimed or paused. */
  deadlineAt: z.number().nullable(),
  remainingMs: z.number().nonnegative().nullable(),
  /** Total timed duration including any extension; null when untimed. */
  durationMs: z.number().nonnegative().nullable(),
  paused: z.boolean(),
  pauseReason: z.enum(PAUSE_REASONS).nullable(),
});
export type PhaseView = z.infer<typeof PhaseViewSchema>;

export const PostViewSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('POSTED'), text: z.string() }),
  z.strictObject({ status: z.literal('FORFEIT') }),
]);
export type PostView = z.infer<typeof PostViewSchema>;

export const DuelPostsSchema = z.strictObject({ A: PostViewSchema, B: PostViewSchema });
export type DuelPosts = z.infer<typeof DuelPostsSchema>;

export const GuessOptionSchema = z.strictObject({ id: UuidSchema, label: z.string() });
export type GuessOption = z.infer<typeof GuessOptionSchema>;

export const DuelSideResultSchema = z.strictObject({
  playerId: UuidSchema,
  text: z.string().nullable(),
  forfeit: z.boolean(),
  votes: Count,
  points: Count,
});
export type DuelSideResult = z.infer<typeof DuelSideResultSchema>;

export const ResultStampSchema = z.enum([
  'ENDORSED_A',
  'ENDORSED_B',
  'CO_ENDORSED',
  'NO_ENDORSEMENTS',
  'UNFILLED',
]);
export type ResultStamp = z.infer<typeof ResultStampSchema>;

export const PublicDuelResultSchema = z.strictObject({
  duelId: UuidSchema,
  roundNumber: z.int().positive(),
  multiplier: MultiplierSchema,
  truth: z.string(),
  facts: z.array(z.string()),
  boundaries: z.array(z.string()),
  correctOptionId: UuidSchema,
  sides: z.strictObject({ A: DuelSideResultSchema, B: DuelSideResultSchema }),
  votesNeither: Count,
  ballotsCast: Count,
  eligibleReaders: Count,
  correctGuesserIds: z.array(UuidSchema),
  /** Points each correct guesser received in this duel. */
  guessPoints: Count,
  stamp: ResultStampSchema,
});
export type PublicDuelResult = z.infer<typeof PublicDuelResultSchema>;

export const ScoreRowSchema = z.strictObject({
  playerId: UuidSchema,
  rank: z.int().positive(),
  total: Int,
  roundGain: Int,
});
export type ScoreRow = z.infer<typeof ScoreRowSchema>;

export const BestPostSchema = z.strictObject({
  duelId: UuidSchema,
  side: SideSchema,
  playerId: UuidSchema,
  text: z.string(),
  truth: z.string(),
  points: z.int().positive(),
  roundNumber: z.int().positive(),
});
export type BestPost = z.infer<typeof BestPostSchema>;

export const FinalAwardSchema = z.enum(['CHIEF_EXAGGERATION_OFFICER', 'CO_CEOS_OF_DOING_NOTHING']);
export type FinalAward = z.infer<typeof FinalAwardSchema>;

export const StartBlockerSchema = z.strictObject({
  code: z.enum(['TOO_FEW_PLAYERS', 'TOO_MANY_PLAYERS', 'PLAYER_OFFLINE', 'PLAYER_NOT_READY']),
  message: z.string(),
});
export type StartBlocker = z.infer<typeof StartBlockerSchema>;

// ---------------------------------------------------------------------------
// Screens shared by both roles

const RulesScreenSchema = z.strictObject({
  kind: z.literal('RULES'),
  /** Active (unpaused) time after which the host may skip. */
  skipAfterMs: Count,
});

const RoundIntroScreenSchema = z.strictObject({
  kind: z.literal('ROUND_INTRO'),
  roundNumber: z.int().positive(),
  roundCount: MultiplierSchema,
  multiplier: MultiplierSchema,
  title: z.string(),
  /** Players who write nothing this round (one each, odd roster) and judge every post-off. */
  sitOutIds: z.array(UuidSchema),
});

const DuelResultScreenBase = {
  kind: z.literal('DUEL_RESULT'),
  duelId: UuidSchema,
  result: PublicDuelResultSchema,
};

const ScoreboardScreenSchema = z.strictObject({
  kind: z.literal('ROUND_SCOREBOARD'),
  roundNumber: z.int().positive(),
  nextMultiplier: MultiplierSchema,
  rows: z.array(ScoreRowSchema),
});

const FinalScreenSchema = z.strictObject({
  kind: z.literal('FINAL'),
  rows: z.array(ScoreRowSchema),
  winnerIds: z.array(UuidSchema),
  award: FinalAwardSchema,
  bestPost: BestPostSchema.nullable(),
});

const ClosedScreenSchema = z.strictObject({
  kind: z.literal('CLOSED'),
  reason: CloseReasonSchema,
  message: z.string(),
});

// ---------------------------------------------------------------------------
// Host screens

export const HostScreenSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('LOBBY'),
    readyCount: Count,
    canStart: z.boolean(),
    startBlocker: StartBlockerSchema.nullable(),
    settingsChanged: z.boolean(),
  }),
  RulesScreenSchema,
  RoundIntroScreenSchema,
  z.strictObject({
    kind: z.literal('WRITING'),
    /** Per player: posts locked out of posts assigned this round (0 assigned = sitting out). */
    progress: z.array(z.strictObject({ playerId: UuidSchema, locked: z.int().min(0).max(2), total: z.int().min(0).max(2) })),
    lockedTotal: Count,
    assignmentTotal: Count,
    extensionUsed: z.boolean(),
  }),
  z.strictObject({ kind: z.literal('DUEL_READ'), duelId: UuidSchema, posts: DuelPostsSchema }),
  z.strictObject({
    kind: z.literal('DUEL_GUESS'),
    duelId: UuidSchema,
    posts: DuelPostsSchema,
    options: z.array(GuessOptionSchema),
    lockedCount: Count,
    eligibleCount: Count,
  }),
  z.strictObject({
    kind: z.literal('DUEL_ENDORSE'),
    duelId: UuidSchema,
    posts: DuelPostsSchema,
    options: z.array(GuessOptionSchema),
    truth: z.string(),
    facts: z.array(z.string()),
    boundaries: z.array(z.string()),
    correctOptionId: UuidSchema,
    availableChoices: z.array(EndorsementSchema),
    lockedCount: Count,
    eligibleCount: Count,
  }),
  z.strictObject(DuelResultScreenBase),
  ScoreboardScreenSchema,
  FinalScreenSchema,
  ClosedScreenSchema,
]);
export type HostScreen = z.infer<typeof HostScreenSchema>;

// ---------------------------------------------------------------------------
// Player screens

export const AssignmentViewSchema = z.strictObject({
  id: UuidSchema,
  /** One-based position of this post-off in the round's presentation order. */
  presentationNumber: z.int().positive(),
  truth: z.string(),
  facts: z.array(z.string()),
  boundaries: z.array(z.string()),
  draftText: z.string(),
  draftRevision: Count,
  status: z.enum(['DRAFT', 'LOCKED', 'FORFEIT']),
  finalText: z.string().nullable(),
  autoSubmitted: z.boolean(),
});
export type AssignmentView = z.infer<typeof AssignmentViewSchema>;

export const DuelRoleSchema = z.enum(['WRITER', 'READER']);
export type DuelRole = z.infer<typeof DuelRoleSchema>;

const DuelSelfShape = {
  role: DuelRoleSchema,
  /** The writer's own side; null for readers. */
  side: SideSchema.nullable(),
  /** The writer's post was their saved draft, submitted automatically at the deadline. */
  autoSubmitted: z.boolean(),
};

export const PlayerScreenSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('LOBBY'),
    readyCount: Count,
    settingsChanged: z.boolean(),
  }),
  RulesScreenSchema,
  RoundIntroScreenSchema,
  z.strictObject({
    kind: z.literal('WRITING'),
    assignments: z.array(AssignmentViewSchema),
  }),
  z.strictObject({
    kind: z.literal('DUEL_READ'),
    duelId: UuidSchema,
    posts: DuelPostsSchema,
    me: z.strictObject(DuelSelfShape),
  }),
  z.strictObject({
    kind: z.literal('DUEL_GUESS'),
    duelId: UuidSchema,
    posts: DuelPostsSchema,
    options: z.array(GuessOptionSchema),
    lockedCount: Count,
    eligibleCount: Count,
    me: z.strictObject({
      ...DuelSelfShape,
      guessOptionId: UuidSchema.nullable(),
      /** Unlocked pick; it is locked automatically if time runs out first. */
      guessPick: UuidSchema.nullable(),
    }),
  }),
  z.strictObject({
    kind: z.literal('DUEL_ENDORSE'),
    duelId: UuidSchema,
    posts: DuelPostsSchema,
    options: z.array(GuessOptionSchema),
    truth: z.string(),
    facts: z.array(z.string()),
    boundaries: z.array(z.string()),
    correctOptionId: UuidSchema,
    availableChoices: z.array(EndorsementSchema),
    lockedCount: Count,
    eligibleCount: Count,
    me: z.strictObject({
      ...DuelSelfShape,
      guessOptionId: UuidSchema.nullable(),
      guessCorrect: z.boolean().nullable(),
      endorsement: EndorsementSchema.nullable(),
      /** Unlocked pick; locked automatically at the deadline (no pick counts as Neither). */
      endorsementPick: EndorsementSchema.nullable(),
    }),
  }),
  z.strictObject({
    ...DuelResultScreenBase,
    me: z.strictObject({
      ...DuelSelfShape,
      guessCorrect: z.boolean().nullable(),
      writingPoints: Count.nullable(),
      guessPoints: Count.nullable(),
      total: Int,
    }),
  }),
  ScoreboardScreenSchema,
  FinalScreenSchema,
  ClosedScreenSchema,
]);
export type PlayerScreen = z.infer<typeof PlayerScreenSchema>;

// ---------------------------------------------------------------------------
// Snapshots

const SnapshotBaseShape = {
  protocolVersion: z.literal(PROTOCOL_VERSION),
  bootId: UuidSchema,
  roomId: UuidSchema,
  roomCode: RoomCodeSchema,
  revision: Count,
  serverNow: z.number(),
  gameId: UuidSchema.nullable(),
  phase: PhaseViewSchema,
  settings: RoomSettingsSchema,
  players: z.array(PublicPlayerSchema),
  roundNumber: z.int().positive().nullable(),
  duelNumber: z.int().positive().nullable(),
  duelsInRound: z.int().positive().nullable(),
  hostConnected: z.boolean(),
};

export const HostViewSchema = z.strictObject({
  ...SnapshotBaseShape,
  role: z.literal('host'),
  joinUrl: z.string(),
  screen: HostScreenSchema,
});
export type HostView = z.infer<typeof HostViewSchema>;

export const PlayerViewSchema = z.strictObject({
  ...SnapshotBaseShape,
  role: z.literal('player'),
  selfId: UuidSchema,
  screen: PlayerScreenSchema,
});
export type PlayerView = z.infer<typeof PlayerViewSchema>;

export type RoomView = HostView | PlayerView;

// ---------------------------------------------------------------------------
// HTTP responses

export const CreateRoomResponseSchema = z.strictObject({
  roomId: UuidSchema,
  roomCode: RoomCodeSchema,
  hostToken: z.string(),
  joinUrl: z.string(),
  bootId: UuidSchema,
});
export type CreateRoomResponse = z.infer<typeof CreateRoomResponseSchema>;

export const RoomPreviewSchema = z.strictObject({
  roomCode: RoomCodeSchema,
  state: z.enum(['LOBBY', 'PLAYING', 'FINAL']),
  playerCount: Count,
  maxPlayers: z.literal(MAX_PLAYERS),
  canJoin: z.boolean(),
});
export type RoomPreview = z.infer<typeof RoomPreviewSchema>;

export const JoinRoomResponseSchema = z.strictObject({
  roomId: UuidSchema,
  roomCode: RoomCodeSchema,
  playerId: UuidSchema,
  playerToken: z.string(),
  bootId: UuidSchema,
});
export type JoinRoomResponse = z.infer<typeof JoinRoomResponseSchema>;

export const HealthResponseSchema = z.strictObject({
  ok: z.literal(true),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  bootId: UuidSchema,
  version: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ApiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: ErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
    fieldErrors: z.record(z.string(), z.string()).optional(),
    retryAfterMs: z.number().optional(),
  }),
  requestId: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
