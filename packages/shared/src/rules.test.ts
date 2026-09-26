import { describe, expect, it } from 'vitest';
import { duelsPerRound, estimateGameSeconds, estimateRangeMinutes, writingSecondsFor } from './rules.js';
import { DEFAULT_SETTINGS } from './schemas.js';

describe('game length rules', () => {
  it('counts post-offs per round for each mode', () => {
    expect([3, 4, 5, 8].map((n) => duelsPerRound(n, 2))).toEqual([3, 4, 5, 8]);
    expect([3, 4, 5, 8].map((n) => duelsPerRound(n, 1))).toEqual([1, 2, 2, 4]);
  });

  it('times writing per post', () => {
    expect(writingSecondsFor({ postsPerPlayer: 1, secondsPerPost: 60 })).toBe(60);
    expect(writingSecondsFor({ postsPerPlayer: 2, secondsPerPost: 45 })).toBe(90);
  });

  it("keeps the spec's formula with D post-offs per round", () => {
    // R * (4 + W + D * (12 + G + E + 10)) + 15 + (R - 1) * 12
    expect(estimateGameSeconds(DEFAULT_SETTINGS, 5)).toBe(2 * (4 + 60 + 2 * (12 + 20 + 20 + 10)) + 15 + 12);
    expect(estimateGameSeconds({ ...DEFAULT_SETTINGS, postsPerPlayer: 2, secondsPerPost: 45 }, 5)).toBe(
      2 * (4 + 90 + 5 * (12 + 20 + 20 + 10)) + 15 + 12,
    );
    // 3 players: 279s; 8 players: 651s.
    expect(estimateRangeMinutes(DEFAULT_SETTINGS)).toEqual({ min: 5, max: 11 });
  });
});
