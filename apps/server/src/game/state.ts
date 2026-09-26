import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  type Endorsement,
  type StartBlocker,
} from '@larpbox/shared';
import type { Assignment, Duel, GameState, PlayerRecord, Room, RoomEntry } from './types.js';

/** Read-only helpers shared by the engine and the projections. */

export function playersBySeat(room: Room): PlayerRecord[] {
  return [...room.players.values()].sort((a, b) => a.seat - b.seat);
}

export function requireGame(room: Room): GameState {
  if (!room.game) throw new Error(`Room ${room.id} has no active game in phase ${room.phase.name}`);
  return room.game;
}

export function currentRound(game: GameState) {
  const round = game.rounds[game.roundIndex];
  if (!round) throw new Error(`Round index ${game.roundIndex} out of range`);
  return round;
}

export function currentDuel(game: GameState): Duel {
  const duelId = currentRound(game).duelIds[game.duelIndex];
  const duel = duelId ? game.duels.get(duelId) : undefined;
  if (!duel) throw new Error(`Duel index ${game.duelIndex} out of range`);
  return duel;
}

export function requireAssignment(game: GameState, assignmentId: string): Assignment {
  const assignment = game.assignments.get(assignmentId);
  if (!assignment) throw new Error(`Unknown assignment ${assignmentId}`);
  return assignment;
}

export function duelAssignments(game: GameState, duel: Duel): { A: Assignment; B: Assignment } {
  return {
    A: requireAssignment(game, duel.assignmentBySide.A),
    B: requireAssignment(game, duel.assignmentBySide.B),
  };
}

/** Assignments belonging to the given round, in presentation order. */
export function roundAssignments(game: GameState, roundIndex: number): Assignment[] {
  const round = game.rounds[roundIndex];
  if (!round) return [];
  const out: Assignment[] = [];
  for (const duelId of round.duelIds) {
    const duel = game.duels.get(duelId);
    if (!duel) continue;
    out.push(requireAssignment(game, duel.assignmentBySide.A), requireAssignment(game, duel.assignmentBySide.B));
  }
  return out;
}

export function availableChoices(game: GameState, duel: Duel): Endorsement[] {
  const { A, B } = duelAssignments(game, duel);
  const choices: Endorsement[] = [];
  if (A.status !== 'FORFEIT') choices.push('A');
  if (B.status !== 'FORFEIT') choices.push('B');
  choices.push('NEITHER');
  return choices;
}

/** First applicable reason the host cannot start, or null when the lobby is startable. */
export function startBlocker(room: Room): StartBlocker | null {
  const players = [...room.players.values()];
  if (players.length < MIN_PLAYERS) {
    const missing = MIN_PLAYERS - players.length;
    return {
      code: 'TOO_FEW_PLAYERS',
      message: `Need ${missing} more player${missing === 1 ? '' : 's'} to start.`,
    };
  }
  if (players.length > MAX_PLAYERS) {
    return { code: 'TOO_MANY_PLAYERS', message: `Games have at most ${MAX_PLAYERS} players.` };
  }
  const offline = players.filter((player) => !player.connected);
  if (offline.length > 0) {
    const first = offline[0] as PlayerRecord;
    return {
      code: 'PLAYER_OFFLINE',
      message: first.everConnected
        ? `Waiting for ${first.name} to reconnect.`
        : `Waiting for ${first.name} to finish joining.`,
    };
  }
  const unready = players.filter((player) => !player.ready).length;
  if (unready > 0) {
    return {
      code: 'PLAYER_NOT_READY',
      message: `Waiting for ${unready} player${unready === 1 ? '' : 's'} to ready up.`,
    };
  }
  return null;
}

/** Active (unpaused) time spent in the current phase. */
export function activeElapsedMs(entry: RoomEntry, nowMono: number): number {
  const { phase } = entry.room;
  if (phase.pause) return phase.elapsedBeforePauseMs;
  return phase.elapsedBeforePauseMs + Math.max(0, nowMono - entry.runtime.segmentStartMono);
}

/** Remaining time of the current timed phase, frozen while paused; null when untimed. */
export function remainingMs(entry: RoomEntry, nowMono: number): number | null {
  const { phase } = entry.room;
  if (phase.durationMs === null) return null;
  if (phase.pause) return phase.pause.remainingMs;
  if (entry.runtime.deadlineMono === null) return null;
  return Math.max(0, entry.runtime.deadlineMono - nowMono);
}

export function isDuelPhase(room: Room): boolean {
  const name = room.phase.name;
  return name === 'DUEL_READ' || name === 'DUEL_GUESS' || name === 'DUEL_ENDORSE' || name === 'DUEL_RESULT';
}
