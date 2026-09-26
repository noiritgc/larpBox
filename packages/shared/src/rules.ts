import { MAX_PLAYERS, MIN_PLAYERS } from './constants.js';
import type { RoomSettings } from './schemas.js';

/**
 * Conservative duration estimate in seconds, from the spec:
 * R * (4 + W + N * (12 + G + E + 10)) + 15 + (R - 1) * 12.
 * Excludes pauses, extensions, early locks and the untimed lobby/final screens.
 */
export function estimateGameSeconds(settings: RoomSettings, playerCount: number): number {
  const r = settings.roundCount;
  const n = playerCount;
  return (
    r * (4 + settings.writingSeconds + n * (12 + settings.guessSeconds + settings.endorseSeconds + 10)) +
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
