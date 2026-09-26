export const PROTOCOL_VERSION = 1 as const;

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

/** 24 letters: the English alphabet without I and O. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/;

export const POST_MIN_GRAPHEMES = 20;
export const POST_MAX_GRAPHEMES = 280;
export const POST_MAX_LINES = 4;
export const POST_MAX_NEWLINES = 4;
/** Raw UTF-8 cap for any submitted text, checked before normalization. */
export const TEXT_MAX_BYTES = 4096;

export const NAME_MIN_GRAPHEMES = 2;
export const NAME_MAX_GRAPHEMES = 16;

export const PHASES = [
  'LOBBY',
  'RULES',
  'ROUND_INTRO',
  'WRITING',
  'DUEL_READ',
  'DUEL_GUESS',
  'DUEL_ENDORSE',
  'DUEL_RESULT',
  'ROUND_SCOREBOARD',
  'FINAL',
  'CLOSED',
] as const;
export type Phase = (typeof PHASES)[number];

export const SIDES = ['A', 'B'] as const;
export type Side = (typeof SIDES)[number];

export const ENDORSEMENTS = ['A', 'B', 'NEITHER'] as const;
export type Endorsement = (typeof ENDORSEMENTS)[number];

export const PAUSE_REASONS = ['HOST_PAUSED', 'HOST_DISCONNECTED'] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

/** Unscaled phase durations. The server multiplies these by GAME_TIME_SCALE (1 outside tests). */
export const PHASE_TIMINGS_MS = {
  rules: 15_000,
  rulesSkipAfter: 5_000,
  roundIntro: 4_000,
  duelRead: 12_000,
  guessMinimum: 5_000,
  endorseMinimum: 8_000,
  duelResult: 10_000,
  duelResultUnfilled: 5_000,
  roundScoreboard: 12_000,
  writingExtension: 30_000,
} as const;

export const SCORING = {
  /** Writer points per duel before the round multiplier, split by endorsement share. */
  writerPool: 1000,
  /** Points for a correct locked guess before the round multiplier. */
  correctGuess: 250,
} as const;

export const ROUND_TITLES = ['Open to work', 'Open to anything'] as const;

export const AVATAR_IDS = [
  'briefcase',
  'coffee',
  'ladder',
  'trophy',
  'necktie',
  'spreadsheet',
  'plant',
  'stamp',
] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

export const AVATAR_LABELS: Record<AvatarId, string> = {
  briefcase: 'Briefcase',
  coffee: 'Coffee cup',
  ladder: 'Ladder',
  trophy: 'Trophy',
  necktie: 'Necktie',
  spreadsheet: 'Spreadsheet',
  plant: 'Plant',
  stamp: 'Rubber stamp',
};

export const PACKS = ['mixed', 'everyday', 'campus-work'] as const;
export type PackId = (typeof PACKS)[number];

export const PACK_LABELS: Record<PackId, string> = {
  mixed: 'Mixed',
  everyday: 'Everyday',
  'campus-work': 'Campus & Work',
};

export const SETTINGS_CHOICES = {
  roundCount: [1, 2],
  writingSeconds: [90, 120, 180],
  guessSeconds: [20, 30],
  endorseSeconds: [20, 30],
  pack: PACKS,
} as const;

export const ROUND_COUNT_LABELS: Record<1 | 2, string> = {
  1: 'Quick: 1 round',
  2: 'Standard: 2 rounds',
};

export const ERROR_CODES = [
  'BAD_INPUT',
  'NOT_FOUND',
  'ROOM_NOT_FOUND',
  'ROOM_ENDED',
  'ROOM_FULL',
  'ROOM_CAPACITY',
  'GAME_STARTED',
  'NAME_TAKEN',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'PROTOCOL_MISMATCH',
  'SESSION_IN_USE',
  'SESSION_REPLACED',
  'PHASE_CHANGED',
  'GAME_PAUSED',
  'DEADLINE_PASSED',
  'ALREADY_LOCKED',
  'REVISION_CONFLICT',
  'REQUEST_CONFLICT',
  'REQUEST_EXPIRED',
  'CHOICE_UNAVAILABLE',
  'CONFIG_INVALID',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const CLOSE_REASONS = ['HOST_ENDED', 'EXPIRED', 'REMOVED', 'LEFT', 'SERVER_SHUTDOWN'] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

export const STORAGE_KEYS = {
  host: (roomId: string) => `larpbox:host:${roomId}`,
  player: (roomId: string) => `larpbox:player:${roomId}`,
  roomIndex: (code: string) => `larpbox:roomIndex:${code}`,
  draft: (gameId: string, assignmentId: string) => `larpbox:draft:${gameId}:${assignmentId}`,
  prefs: 'larpbox:prefs',
  lastPlayedPhaseId: 'larpbox:lastPlayedPhaseId',
} as const;
