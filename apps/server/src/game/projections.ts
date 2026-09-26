import {
  PHASE_TIMINGS_MS,
  PROTOCOL_VERSION,
  ROUND_TITLES,
  type AssignmentView,
  type BestPost,
  type DuelPosts,
  type DuelRole,
  type GuessOption,
  type HostScreen,
  type HostView,
  type PhaseView,
  type PlayerScreen,
  type PlayerView,
  type PostView,
  type PublicDuelResult,
  type PublicPlayer,
  type RoomSettings,
  type ScoreRow,
  type Side,
} from '@larpbox/shared';
import { finalAward, rankPlayers } from './scoring.js';
import {
  availableChoices,
  currentDuel,
  currentRound,
  duelAssignments,
  playersBySeat,
  remainingMs,
  requireGame,
  roundAssignments,
  startBlocker,
} from './state.js';
import type { Assignment, Duel, DuelResult, GameState, Room, RoomEntry } from './types.js';

/**
 * Role-filtered snapshots. Every DTO is constructed field by field from the internal model: never
 * spread a raw room/duel/assignment object and delete secrets. Anonymous posts carry only the A/B
 * label, status and text, never author IDs, names, avatars, headlines or timestamps.
 */

export interface ProjectionContext {
  bootId: string;
  publicOrigin: string;
  nowEpochMs: number;
  nowMonotonicMs: number;
  timeScale: number;
}

function scaled(ctx: ProjectionContext, ms: number): number {
  return Math.max(1, Math.round(ms * ctx.timeScale));
}

function publicPlayers(room: Room): PublicPlayer[] {
  return playersBySeat(room).map((player) => ({
    id: player.id,
    name: player.name,
    avatarId: player.avatarId,
    headline: player.headline,
    seat: player.seat,
    ready: player.ready,
    connected: player.connected,
    joining: !player.everConnected,
    score: player.score,
  }));
}

function phaseView(entry: RoomEntry, ctx: ProjectionContext): PhaseView {
  const { phase } = entry.room;
  const remaining = remainingMs(entry, ctx.nowMonotonicMs);
  return {
    name: phase.name,
    id: phase.id,
    startedAt: phase.startedAt,
    // Derived from remaining time so it is always consistent with serverNow, even after a wall-clock jump.
    deadlineAt: remaining === null || phase.pause ? null : ctx.nowEpochMs + remaining,
    remainingMs: remaining,
    durationMs: phase.durationMs,
    paused: phase.pause !== null,
    pauseReason: phase.pause?.reason ?? null,
  };
}

function copySettings(settings: RoomSettings): RoomSettings {
  return {
    roundCount: settings.roundCount,
    writingSeconds: settings.writingSeconds,
    guessSeconds: settings.guessSeconds,
    endorseSeconds: settings.endorseSeconds,
    pack: settings.pack,
  };
}

function isDuelScreen(name: string): boolean {
  return name === 'DUEL_READ' || name === 'DUEL_GUESS' || name === 'DUEL_ENDORSE' || name === 'DUEL_RESULT';
}

function base(entry: RoomEntry, ctx: ProjectionContext) {
  const { room } = entry;
  const game = room.game;
  const inRound = game !== null && room.phase.name !== 'LOBBY';
  const round = inRound ? game.rounds[game.roundIndex] : undefined;
  const hostConnected = [...room.sessions.values()].some(
    (session) => session.role === 'host' && session.activeSocketId !== null,
  );
  return {
    protocolVersion: PROTOCOL_VERSION,
    bootId: ctx.bootId,
    roomId: room.id,
    roomCode: room.code,
    revision: room.revision,
    serverNow: ctx.nowEpochMs,
    gameId: game?.id ?? null,
    phase: phaseView(entry, ctx),
    settings: copySettings(room.settings),
    players: publicPlayers(room),
    roundNumber: round ? round.index + 1 : null,
    duelNumber: game && isDuelScreen(room.phase.name) ? game.duelIndex + 1 : null,
    duelsInRound: round ? round.duelIds.length : null,
    hostConnected,
  } as const;
}

function postView(assignment: Assignment): PostView {
  if (assignment.status === 'FORFEIT') return { status: 'FORFEIT' };
  // After writing closes every assignment is LOCKED or FORFEIT; a DRAFT never reaches a duel.
  if (assignment.status !== 'LOCKED' || assignment.finalText === null) {
    throw new Error('Duel projected before its assignments were finalized');
  }
  return { status: 'POSTED', text: assignment.finalText };
}

function duelPosts(game: GameState, duel: Duel): DuelPosts {
  const { A, B } = duelAssignments(game, duel);
  return { A: postView(A), B: postView(B) };
}

function guessOptions(duel: Duel): GuessOption[] {
  return duel.options.map((option) => ({ id: option.id, label: option.label }));
}

function publicResult(result: DuelResult): PublicDuelResult {
  const side = (key: Side) => ({
    playerId: result.sides[key].playerId,
    text: result.sides[key].text,
    forfeit: result.sides[key].forfeit,
    votes: result.sides[key].votes,
    points: result.sides[key].points,
  });
  return {
    duelId: result.duelId,
    roundNumber: result.roundNumber,
    multiplier: result.multiplier,
    truth: result.truth,
    facts: [...result.facts],
    boundaries: [...result.boundaries],
    correctOptionId: result.correctOptionId,
    sides: { A: side('A'), B: side('B') },
    votesNeither: result.votesNeither,
    ballotsCast: result.ballotsCast,
    eligibleReaders: result.eligibleReaders,
    correctGuesserIds: [...result.correctGuesserIds],
    guessPoints: result.guessPoints,
    stamp: result.stamp,
  };
}

function requireResult(duel: Duel): DuelResult {
  if (!duel.settled || !duel.result) throw new Error('DUEL_RESULT projected before settlement');
  return duel.result;
}

function scoreRows(room: Room, game: GameState): ScoreRow[] {
  const round = currentRound(game);
  const ranked = rankPlayers(
    game.rosterIds.map((id) => {
      const player = room.players.get(id);
      if (!player) throw new Error('corrupt game: roster player missing');
      return { id, score: player.score, seat: player.seat };
    }),
  );
  return ranked.map((row) => ({
    playerId: row.playerId,
    rank: row.rank,
    total: row.total,
    roundGain: row.total - (round.scoreAtStart[row.playerId] ?? 0),
  }));
}

/** Highest single-duel writer award; ties go to the earliest duel, then A before B. */
function bestPost(game: GameState): BestPost | null {
  let best: BestPost | null = null;
  for (const round of game.rounds) {
    for (const duelId of round.duelIds) {
      const result = game.duels.get(duelId)?.result;
      if (!result) continue;
      for (const side of ['A', 'B'] as const) {
        const outcome = result.sides[side];
        if (outcome.text === null || outcome.points <= 0) continue;
        if (best === null || outcome.points > best.points) {
          best = {
            duelId: result.duelId,
            side,
            playerId: outcome.playerId,
            text: outcome.text,
            truth: result.truth,
            points: outcome.points,
            roundNumber: result.roundNumber,
          };
        }
      }
    }
  }
  return best;
}

function roundIntroScreen(room: Room, game: GameState) {
  const round = currentRound(game);
  return {
    kind: 'ROUND_INTRO' as const,
    roundNumber: round.index + 1,
    roundCount: room.settings.roundCount,
    multiplier: round.multiplier,
    title: ROUND_TITLES[round.index] ?? ROUND_TITLES[1],
  };
}

function scoreboardScreen(room: Room, game: GameState) {
  const round = currentRound(game);
  return {
    kind: 'ROUND_SCOREBOARD' as const,
    roundNumber: round.index + 1,
    nextMultiplier: 2 as const,
    rows: scoreRows(room, game),
  };
}

function finalScreen(room: Room, game: GameState) {
  const rows = scoreRows(room, game);
  const { winnerIds, award } = finalAward(rows.map((row) => ({ playerId: row.playerId, rank: row.rank, total: row.total })));
  return { kind: 'FINAL' as const, rows, winnerIds, award, bestPost: bestPost(game) };
}

function hostScreen(entry: RoomEntry, ctx: ProjectionContext): HostScreen {
  const { room } = entry;
  const name = room.phase.name;
  if (name === 'LOBBY') {
    const blocker = startBlocker(room);
    return {
      kind: 'LOBBY',
      readyCount: [...room.players.values()].filter((player) => player.ready).length,
      canStart: blocker === null,
      startBlocker: blocker,
      settingsChanged: room.settingsChanged,
    };
  }
  if (name === 'CLOSED') {
    return { kind: 'CLOSED', reason: 'HOST_ENDED', message: 'This room has ended.' };
  }
  const game = requireGame(room);
  switch (name) {
    case 'RULES':
      return { kind: 'RULES', skipAfterMs: scaled(ctx, PHASE_TIMINGS_MS.rulesSkipAfter) };
    case 'ROUND_INTRO':
      return roundIntroScreen(room, game);
    case 'WRITING': {
      const assignments = roundAssignments(game, game.roundIndex);
      const progress = game.rosterIds.map((playerId) => ({
        playerId,
        locked: assignments.filter((a) => a.playerId === playerId && a.status === 'LOCKED').length,
      }));
      return {
        kind: 'WRITING',
        progress,
        lockedTotal: assignments.filter((a) => a.status === 'LOCKED').length,
        assignmentTotal: assignments.length,
        extensionUsed: room.phase.writeExtensionUsed,
      };
    }
    case 'DUEL_READ': {
      const duel = currentDuel(game);
      return { kind: 'DUEL_READ', duelId: duel.id, posts: duelPosts(game, duel) };
    }
    case 'DUEL_GUESS': {
      const duel = currentDuel(game);
      return {
        kind: 'DUEL_GUESS',
        duelId: duel.id,
        posts: duelPosts(game, duel),
        options: guessOptions(duel),
        lockedCount: duel.guesses.size,
        eligibleCount: duel.readerIds.length,
      };
    }
    case 'DUEL_ENDORSE': {
      const duel = currentDuel(game);
      return {
        kind: 'DUEL_ENDORSE',
        duelId: duel.id,
        posts: duelPosts(game, duel),
        options: guessOptions(duel),
        truth: duel.prompt.truth,
        facts: [...duel.prompt.facts],
        boundaries: [...duel.prompt.boundaries],
        correctOptionId: duel.correctOptionId,
        availableChoices: availableChoices(game, duel),
        lockedCount: duel.endorsements.size,
        eligibleCount: duel.readerIds.length,
      };
    }
    case 'DUEL_RESULT': {
      const duel = currentDuel(game);
      return { kind: 'DUEL_RESULT', duelId: duel.id, result: publicResult(requireResult(duel)) };
    }
    case 'ROUND_SCOREBOARD':
      return scoreboardScreen(room, game);
    case 'FINAL':
      return finalScreen(room, game);
  }
}

export function projectHost(entry: RoomEntry, ctx: ProjectionContext): HostView {
  return {
    ...base(entry, ctx),
    role: 'host',
    joinUrl: `${ctx.publicOrigin}/join/${entry.room.code}`,
    screen: hostScreen(entry, ctx),
  };
}

function duelSelf(game: GameState, duel: Duel, playerId: string) {
  let side: Side | null = null;
  if (duel.writerBySide.A === playerId) side = 'A';
  else if (duel.writerBySide.B === playerId) side = 'B';
  const role: DuelRole = side ? 'WRITER' : 'READER';
  const autoSubmitted = side ? duelAssignments(game, duel)[side].autoSubmitted : false;
  return { role, side, autoSubmitted };
}

function assignmentView(game: GameState, assignment: Assignment): AssignmentView {
  const duel = game.duels.get(assignment.duelId);
  if (!duel) throw new Error('corrupt game: assignment without duel');
  return {
    id: assignment.id,
    presentationNumber: duel.orderIndex + 1,
    truth: duel.prompt.truth,
    facts: [...duel.prompt.facts],
    boundaries: [...duel.prompt.boundaries],
    draftText: assignment.draftText,
    draftRevision: assignment.draftRevision,
    status: assignment.status,
    finalText: assignment.finalText,
    autoSubmitted: assignment.autoSubmitted,
  };
}

function playerScreen(entry: RoomEntry, playerId: string, ctx: ProjectionContext): PlayerScreen {
  const { room } = entry;
  const name = room.phase.name;
  if (name === 'LOBBY') {
    return {
      kind: 'LOBBY',
      readyCount: [...room.players.values()].filter((player) => player.ready).length,
      settingsChanged: room.settingsChanged,
    };
  }
  if (name === 'CLOSED') {
    return { kind: 'CLOSED', reason: 'HOST_ENDED', message: 'This room has ended.' };
  }
  const game = requireGame(room);
  switch (name) {
    case 'RULES':
      return { kind: 'RULES', skipAfterMs: scaled(ctx, PHASE_TIMINGS_MS.rulesSkipAfter) };
    case 'ROUND_INTRO':
      return roundIntroScreen(room, game);
    case 'WRITING': {
      // Only this player's own assignments for the current round: never the opponent, the prompt
      // ID, distractors, the correct option, the seed, or any future round.
      const own = roundAssignments(game, game.roundIndex)
        .filter((assignment) => assignment.playerId === playerId)
        .map((assignment) => assignmentView(game, assignment))
        .sort((a, b) => a.presentationNumber - b.presentationNumber);
      return { kind: 'WRITING', assignments: own };
    }
    case 'DUEL_READ': {
      const duel = currentDuel(game);
      return { kind: 'DUEL_READ', duelId: duel.id, posts: duelPosts(game, duel), me: duelSelf(game, duel, playerId) };
    }
    case 'DUEL_GUESS': {
      const duel = currentDuel(game);
      return {
        kind: 'DUEL_GUESS',
        duelId: duel.id,
        posts: duelPosts(game, duel),
        options: guessOptions(duel),
        lockedCount: duel.guesses.size,
        eligibleCount: duel.readerIds.length,
        me: { ...duelSelf(game, duel, playerId), guessOptionId: duel.guesses.get(playerId) ?? null },
      };
    }
    case 'DUEL_ENDORSE': {
      const duel = currentDuel(game);
      const guess = duel.guesses.get(playerId) ?? null;
      return {
        kind: 'DUEL_ENDORSE',
        duelId: duel.id,
        posts: duelPosts(game, duel),
        options: guessOptions(duel),
        truth: duel.prompt.truth,
        facts: [...duel.prompt.facts],
        boundaries: [...duel.prompt.boundaries],
        correctOptionId: duel.correctOptionId,
        availableChoices: availableChoices(game, duel),
        lockedCount: duel.endorsements.size,
        eligibleCount: duel.readerIds.length,
        me: {
          ...duelSelf(game, duel, playerId),
          guessOptionId: guess,
          guessCorrect: guess === null ? null : guess === duel.correctOptionId,
          endorsement: duel.endorsements.get(playerId) ?? null,
        },
      };
    }
    case 'DUEL_RESULT': {
      const duel = currentDuel(game);
      const result = requireResult(duel);
      const self = duelSelf(game, duel, playerId);
      const guess = duel.guesses.get(playerId) ?? null;
      const delta = result.deltas[playerId] ?? 0;
      return {
        kind: 'DUEL_RESULT',
        duelId: duel.id,
        result: publicResult(result),
        me: {
          ...self,
          guessCorrect: self.role === 'READER' && guess !== null ? guess === duel.correctOptionId : null,
          writingPoints: self.role === 'WRITER' ? delta : null,
          guessPoints: self.role === 'READER' ? delta : null,
          total: result.totalsAfter[playerId] ?? room.players.get(playerId)?.score ?? 0,
        },
      };
    }
    case 'ROUND_SCOREBOARD':
      return scoreboardScreen(room, game);
    case 'FINAL':
      return finalScreen(room, game);
  }
}

export function projectPlayer(entry: RoomEntry, playerId: string, ctx: ProjectionContext): PlayerView {
  if (!entry.room.players.has(playerId)) throw new Error('projectPlayer: unknown player');
  return {
    ...base(entry, ctx),
    role: 'player',
    selfId: playerId,
    screen: playerScreen(entry, playerId, ctx),
  };
}
