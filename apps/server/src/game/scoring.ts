import { SCORING, type Endorsement, type FinalAward, type ResultStamp } from '@larpbox/shared';

/** The single scoring implementation. Clients display server-computed values only. */

export interface EndorsementCounts {
  A: number;
  B: number;
  NEITHER: number;
}

export function countEndorsements(ballots: Iterable<Endorsement>): EndorsementCounts {
  const counts: EndorsementCounts = { A: 0, B: 0, NEITHER: 0 };
  for (const ballot of ballots) counts[ballot] += 1;
  return counts;
}

/** floor(1000 * m * votes / ballots); zero when no ballots were cast. Remainders are discarded. */
export function writerPoints(votes: number, ballots: number, multiplier: 1 | 2): number {
  if (ballots === 0) return 0;
  return Math.floor((SCORING.writerPool * multiplier * votes) / ballots);
}

export function guessPoints(multiplier: 1 | 2): number {
  return SCORING.correctGuess * multiplier;
}

export function resultStamp(input: {
  forfeitA: boolean;
  forfeitB: boolean;
  votesA: number;
  votesB: number;
}): ResultStamp {
  if (input.forfeitA && input.forfeitB) return 'UNFILLED';
  if (input.votesA === 0 && input.votesB === 0) return 'NO_ENDORSEMENTS';
  if (input.votesA === input.votesB) return 'CO_ENDORSED';
  return input.votesA > input.votesB ? 'ENDORSED_A' : 'ENDORSED_B';
}

export interface Rankable {
  id: string;
  score: number;
  seat: number;
}

export interface RankedEntry {
  playerId: string;
  rank: number;
  total: number;
}

/**
 * Competition ranking (1, 1, 3): equal scores share a rank. Seat order only orders tied rows
 * visually; it never breaks a tie.
 */
export function rankPlayers(players: readonly Rankable[]): RankedEntry[] {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.seat - b.seat);
  return sorted.map((player) => ({
    playerId: player.id,
    total: player.score,
    rank: 1 + sorted.filter((other) => other.score > player.score).length,
  }));
}

export function finalAward(ranked: readonly RankedEntry[]): { winnerIds: string[]; award: FinalAward } {
  const winnerIds = ranked.filter((entry) => entry.rank === 1).map((entry) => entry.playerId);
  return {
    winnerIds,
    award: winnerIds.length > 1 ? 'CO_CEOS_OF_DOING_NOTHING' : 'CHIEF_EXAGGERATION_OFFICER',
  };
}
