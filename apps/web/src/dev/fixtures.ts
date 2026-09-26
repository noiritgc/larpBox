import {
  DEFAULT_SETTINGS,
  HostViewSchema,
  PlayerViewSchema,
  PROTOCOL_VERSION,
  takeGraphemes,
  type HostScreen,
  type HostView,
  type PhaseView,
  type PlayerScreen,
  type PlayerView,
  type PublicPlayer,
  type RoomSettings,
} from '@larpbox/shared';

/**
 * Development-only fixture views for the scenario gallery. They are invented examples (not the
 * server prompt pack) and are validated with the same strict schemas the server's projections
 * must satisfy.
 */

export const id = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const HEADLINES = [
  'Thought Leader · Between Opportunities',
  'Founder · Details Coming Soon',
  'Strategic Coffee Professional',
  'Open to Being Impressed',
  'Head of Personal Branding',
  'Synergy Consultant · Self-Appointed',
  'Building in Public · Mostly Posting',
  'Chief Meeting Attendee',
];
const NAMES = ['Alexandra', 'Sam', 'Jo 🎉', 'Priya', 'Wolfgang-Amadeus', 'Mo', 'Tanvi', 'Bea'];
const AVATARS = ['briefcase', 'coffee', 'ladder', 'trophy', 'necktie', 'spreadsheet', 'plant', 'stamp'] as const;

export function players(count: number, patch: (player: PublicPlayer, index: number) => Partial<PublicPlayer> = () => ({})): PublicPlayer[] {
  return Array.from({ length: count }, (_, index) => {
    const base: PublicPlayer = {
      id: id(100 + index),
      name: NAMES[index] ?? `Player ${index + 1}`,
      avatarId: AVATARS[index % 8] ?? 'briefcase',
      headline: HEADLINES[index] ?? HEADLINES[0] ?? '',
      seat: index,
      ready: true,
      connected: true,
      joining: false,
      score: 0,
    };
    return { ...base, ...patch(base, index) };
  });
}

/** Exactly 280 grapheme clusters over four lines: the worst case the TV must fit. */
export const LONG_POST = takeGraphemes(
  'Humbled and honored to announce that after a period of deep reflection, I have completed a full-cycle taxonomy overhaul of a mission-critical flavor portfolio.\n' +
    'It was not easy. Nobody asked me to.\n' +
    'Leadership means bringing order to the chaos.\n' +
    '#Grateful #Resilience #Growth #Impact',
  280,
);
export const LONG_POST_B = takeGraphemes(
  'This morning I stepped into an alignment gap others had tolerated for years. Eleven assets, one alphabet, and a completely different outlook for everyone who cooks after me. \u{1F336}\uFE0F\u2728\n' +
    'Grateful for the chance to serve my household.\n' +
    'Change starts with you.\n' +
    '#Leadership #Humbled #SpiceRacks',
  280,
);
export const UNBROKEN_POST = `Proud to share my latest framework: #${'Synergy'.repeat(24)} and I could not be more humbled.`;
export const SHORT_POST = 'Proud to have restructured a mission-critical flavor portfolio from A to Z.';

// Invented example content (not from the server prompt pack).
const TRUTH = 'You alphabetized your spice rack.';
const FACTS = ['There were eleven spice jars.', 'You rearranged them from A to Z.'];
const BOUNDARIES = ['You did not cook anything or start a food blog.'];
export const OPTIONS = [
  { id: id(201), label: 'You labeled your freezer bags.' },
  { id: id(202), label: TRUTH },
  { id: id(203), label: 'You descaled a kettle.' },
  { id: id(204), label: 'You sorted your sock drawer.' },
];

function phase(name: PhaseView['name'], options: { remainingMs?: number | null; durationMs?: number | null; paused?: PhaseView['pauseReason'] } = {}): PhaseView {
  const remaining = options.remainingMs === undefined ? 47_000 : options.remainingMs;
  const paused = options.paused ?? null;
  return {
    name,
    id: id(900 + name.length),
    startedAt: Date.now() - 5_000,
    deadlineAt: remaining === null || paused ? null : Date.now() + remaining,
    remainingMs: remaining,
    durationMs: options.durationMs === undefined ? (remaining === null ? null : 60_000) : options.durationMs,
    paused: paused !== null,
    pauseReason: paused,
  };
}

interface Common {
  phase?: PhaseView;
  players?: PublicPlayer[];
  round?: number | null;
  duel?: number | null;
  duels?: number | null;
  hostConnected?: boolean;
  gameId?: string | null;
  settings?: Partial<RoomSettings>;
}

function base(kind: PhaseView['name'], common: Common) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    bootId: id(1),
    roomId: id(2),
    roomCode: 'KPRT',
    revision: 42,
    serverNow: Date.now(),
    gameId: common.gameId === undefined ? (kind === 'LOBBY' ? null : id(3)) : common.gameId,
    phase: common.phase ?? phase(kind, kind === 'LOBBY' || kind === 'FINAL' ? { remainingMs: null } : {}),
    settings: { ...DEFAULT_SETTINGS, ...common.settings },
    players: common.players ?? players(5),
    roundNumber: common.round === undefined ? (kind === 'LOBBY' ? null : 1) : common.round,
    duelNumber: common.duel === undefined ? (kind.startsWith('DUEL_') ? 2 : null) : common.duel,
    duelsInRound: common.duels === undefined ? (kind === 'LOBBY' ? null : 5) : common.duels,
    hostConnected: common.hostConnected ?? true,
  };
}

export function hostView(screen: HostScreen, common: Common = {}): HostView {
  return HostViewSchema.parse({ ...base(screen.kind, common), role: 'host', joinUrl: 'http://192.168.1.20:5173/join/KPRT', screen });
}

export function playerView(screen: PlayerScreen, common: Common & { selfId?: string } = {}): PlayerView {
  return PlayerViewSchema.parse({ ...base(screen.kind, common), role: 'player', selfId: common.selfId ?? id(100), screen });
}

export const posts = {
  long: { A: { status: 'POSTED' as const, text: LONG_POST }, B: { status: 'POSTED' as const, text: LONG_POST_B } },
  short: { A: { status: 'POSTED' as const, text: SHORT_POST }, B: { status: 'POSTED' as const, text: 'Eleven jars. One alphabet. A completely different outlook.' } },
  forfeitB: { A: { status: 'POSTED' as const, text: LONG_POST }, B: { status: 'FORFEIT' as const } },
  unbroken: { A: { status: 'POSTED' as const, text: UNBROKEN_POST }, B: { status: 'POSTED' as const, text: SHORT_POST } },
};

export const reveal = {
  truth: TRUTH,
  facts: FACTS,
  boundaries: BOUNDARIES,
  correctOptionId: id(202),
};

export function result(options: {
  stamp: 'ENDORSED_A' | 'ENDORSED_B' | 'CO_ENDORSED' | 'NO_ENDORSEMENTS' | 'UNFILLED';
  votesA: number;
  votesB: number;
  neither: number;
  pointsA: number;
  pointsB: number;
  forfeitB?: boolean;
  correct?: string[];
}) {
  const unfilled = options.stamp === 'UNFILLED';
  return {
    duelId: id(300),
    roundNumber: 1,
    multiplier: 1 as const,
    ...reveal,
    sides: {
      A: { playerId: id(100), text: unfilled ? null : LONG_POST, forfeit: unfilled, votes: options.votesA, points: options.pointsA },
      B: {
        playerId: id(101),
        text: unfilled || options.forfeitB ? null : LONG_POST_B,
        forfeit: unfilled || Boolean(options.forfeitB),
        votes: options.votesB,
        points: options.pointsB,
      },
    },
    votesNeither: options.neither,
    ballotsCast: options.votesA + options.votesB + options.neither,
    eligibleReaders: 3,
    correctGuesserIds: options.correct ?? [id(102), id(103)],
    guessPoints: 250,
    stamp: options.stamp,
  };
}

export { phase as fixturePhase };
