import { MAX_PLAYERS, MIN_PLAYERS } from './constants.js';
import type { RoomSettings } from './schemas.js';

/**
 * Post-offs per round. Two posts each: the roster forms a ring, one post-off per edge (N). One post
 * each: players pair up (floor(N / 2)); with an odd roster one player sits out and only judges.
 */
export function duelsPerRound(playerCount: number, postsPerPlayer: RoomSettings['postsPerPlayer']): number {
  return postsPerPlayer === 2 ? playerCount : Math.floor(playerCount / 2);
}

/** Length of the writing phase: time per post times posts per player. */
export function writingSecondsFor(settings: Pick<RoomSettings, 'postsPerPlayer' | 'secondsPerPost'>): number {
  return settings.postsPerPlayer * settings.secondsPerPost;
}

/**
 * Conservative duration estimate in seconds, from the spec's formula with D post-offs per round:
 * R * (4 + W + D * (12 + G + E + 10)) + 15 + (R - 1) * 12.
 * Excludes pauses, extensions, early locks and the untimed lobby/final screens.
 */
export function estimateGameSeconds(settings: RoomSettings, playerCount: number): number {
  const r = settings.roundCount;
  const d = duelsPerRound(playerCount, settings.postsPerPlayer);
  return (
    r * (4 + writingSecondsFor(settings) + d * (12 + settings.guessSeconds + settings.endorseSeconds + 10)) +
    15 +
    (r - 1) * 12
  );
}

export function estimateGameMinutes(settings: RoomSettings, playerCount: number): number {
  return Math.ceil(estimateGameSeconds(settings, playerCount) / 60);
}

export function estimateRangeMinutes(settings: RoomSettings): { min: number; max: number } {
  return {
    min: estimateGameMinutes(settings, MIN_PLAYERS),
    max: estimateGameMinutes(settings, MAX_PLAYERS),
  };
}

export function roundMultiplier(roundIndex: number): 1 | 2 {
  return roundIndex === 0 ? 1 : 2;
}
