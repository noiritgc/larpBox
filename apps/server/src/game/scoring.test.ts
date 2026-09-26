import { describe, expect, it } from 'vitest';
import { countEndorsements, finalAward, rankPlayers, resultStamp, writerPoints } from './scoring.js';

describe('writer points', () => {
  it('2 A / 1 B gives 666 / 333, doubled round gives 1333 / 666', () => {
    expect([writerPoints(2, 3, 1), writerPoints(1, 3, 1)]).toEqual([666, 333]);
    expect([writerPoints(2, 3, 2), writerPoints(1, 3, 2)]).toEqual([1333, 666]);
  });

  it('1 A / 1 B / 1 Neither gives 333 / 333, doubled 666 / 666', () => {
    const counts = countEndorsements(['A', 'B', 'NEITHER']);
    const ballots = counts.A + counts.B + counts.NEITHER;
    expect([writerPoints(counts.A, ballots, 1), writerPoints(counts.B, ballots, 1)]).toEqual([333, 333]);
    expect([writerPoints(counts.A, ballots, 2), writerPoints(counts.B, ballots, 2)]).toEqual([666, 666]);
  });

  it('all Neither pays writers nothing', () => {
    expect(writerPoints(0, 4, 1)).toBe(0);
  });

  it('no ballots pays writers nothing', () => {
    expect(writerPoints(0, 0, 2)).toBe(0);
  });

  it('discards rounding remainders instead of redistributing them', () => {
    for (let ballots = 1; ballots <= 6; ballots += 1) {
      for (let a = 0; a <= ballots; a += 1) {
        for (const m of [1, 2] as const) {
          const b = ballots - a;
          const total = writerPoints(a, ballots, m) + writerPoints(b, ballots, m);
          expect(total).toBeLessThanOrEqual(1000 * m);
          expect(writerPoints(a, ballots, m)).toBe(Math.floor((1000 * m * a) / ballots));
        }
      }
    }
  });
});

describe('result stamps', () => {
  it('marks winners, ties, empty votes and double forfeits', () => {
    expect(resultStamp({ forfeitA: false, forfeitB: false, votesA: 2, votesB: 1 })).toBe('ENDORSED_A');
    expect(resultStamp({ forfeitA: false, forfeitB: false, votesA: 0, votesB: 3 })).toBe('ENDORSED_B');
    expect(resultStamp({ forfeitA: false, forfeitB: false, votesA: 2, votesB: 2 })).toBe('CO_ENDORSED');
    expect(resultStamp({ forfeitA: false, forfeitB: false, votesA: 0, votesB: 0 })).toBe('NO_ENDORSEMENTS');
    expect(resultStamp({ forfeitA: true, forfeitB: true, votesA: 0, votesB: 0 })).toBe('UNFILLED');
  });
});

describe('ranking', () => {
  it('uses competition ranking with seat order only for display', () => {
    const ranked = rankPlayers([
      { id: 'a', score: 500, seat: 2 },
      { id: 'b', score: 900, seat: 3 },
      { id: 'c', score: 900, seat: 0 },
      { id: 'd', score: 100, seat: 1 },
    ]);
    expect(ranked).toEqual([
      { playerId: 'c', rank: 1, total: 900 },
      { playerId: 'b', rank: 1, total: 900 },
      { playerId: 'a', rank: 3, total: 500 },
      { playerId: 'd', rank: 4, total: 100 },
    ]);
  });

  it('awards a single winner or joint Co-CEOs without a tie-break', () => {
    expect(finalAward(rankPlayers([{ id: 'a', score: 5, seat: 0 }, { id: 'b', score: 1, seat: 1 }]))).toEqual({
      winnerIds: ['a'],
      award: 'CHIEF_EXAGGERATION_OFFICER',
    });
    const tie = finalAward(
      rankPlayers([
        { id: 'a', score: 0, seat: 1 },
        { id: 'b', score: 0, seat: 0 },
        { id: 'c', score: 0, seat: 2 },
      ]),
    );
    expect(tie.award).toBe('CO_CEOS_OF_DOING_NOTHING');
    expect(tie.winnerIds).toEqual(['b', 'a', 'c']);
  });
});
