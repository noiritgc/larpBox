import { describe, expect, it } from 'vitest';
import { loadPromptPack, promptsForPack } from '../content/loadPrompts.js';
import { sequentialIds } from '../testing/harness.js';
import { createSeededRandom } from './random.js';
import { buildSchedule, drawPrompts, edgeKey, matchingPairs, planRounds, ringEdges, ROUND_TWO_CANDIDATES } from './schedule.js';

const pack = loadPromptPack();
const roster = (n: number) => Array.from({ length: n }, (_, i) => `player-${i}`);

function build(n: number, roundCount: 1 | 2, seed = 'seed') {
  const rng = createSeededRandom(seed);
  const ids = roster(n);
  const plans = planRounds(ids, roundCount, rng);
  const drawn = drawPrompts({
    packPrompts: promptsForPack(pack, 'mixed'),
    usedPromptIds: new Set(),
    needed: n * roundCount,
    rng,
  });
  if (!drawn) throw new Error('pack too small');
  return { ids, plans, ...buildSchedule({ rosterIds: ids, plans, prompts: drawn.prompts, rng, newId: sequentialIds() }) };
}

describe('ring scheduling', () => {
  for (const n of [3, 4, 5, 6, 7, 8]) {
    for (const roundCount of [1, 2] as const) {
      it(`N=${n}, ${roundCount} round(s): N duels per round, degree two, no self-duels`, () => {
        const { ids, rounds, duels, assignments } = build(n, roundCount);
        expect(rounds).toHaveLength(roundCount);
        for (const round of rounds) {
          expect(round.duelIds).toHaveLength(n);
          const perPlayer = new Map(ids.map((id) => [id, 0]));
          for (const duelId of round.duelIds) {
            const duel = duels.get(duelId);
            if (!duel) throw new Error('missing duel');
            expect(duel.writerBySide.A).not.toBe(duel.writerBySide.B);
            expect(duel.readerIds).toHaveLength(n - 2);
            expect(duel.readerIds).not.toContain(duel.writerBySide.A);
            expect(duel.readerIds).not.toContain(duel.writerBySide.B);
            for (const side of ['A', 'B'] as const) {
              const writer = duel.writerBySide[side];
              perPlayer.set(writer, (perPlayer.get(writer) ?? 0) + 1);
              const assignment = assignments.get(duel.assignmentBySide[side]);
              expect(assignment?.playerId).toBe(writer);
              expect(assignment?.duelId).toBe(duel.id);
            }
          }
          for (const count of perPlayer.values()) expect(count).toBe(2);
          // N distinct undirected pairs.
          const keys = round.duelIds.map((id) => {
            const duel = duels.get(id);
            if (!duel) throw new Error('missing duel');
            return edgeKey([duel.writerBySide.A, duel.writerBySide.B]);
          });
          expect(new Set(keys).size).toBe(n);
        }
        expect(assignments.size).toBe(2 * n * roundCount);
      });
    }
  }

  it('ring edges wrap around', () => {
    expect(ringEdges(['a', 'b', 'c'])).toEqual([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]);
  });

  it('the same seed reproduces pairings, order, sides and option arrangement', () => {
    const summarize = (seed: string) => {
      const { rounds, duels } = build(6, 2, seed);
      return rounds.map((round) =>
        round.duelIds.map((id) => {
          const duel = duels.get(id);
          if (!duel) throw new Error('missing duel');
          return {
            a: duel.writerBySide.A,
            b: duel.writerBySide.B,
            prompt: duel.prompt.id,
            options: duel.options.map((option) => option.label),
          };
        }),
      );
    };
    expect(summarize('alpha')).toEqual(summarize('alpha'));
    expect(summarize('alpha')).not.toEqual(summarize('beta'));
  });

  it('shows the truth exactly once among four options with opaque unique IDs', () => {
    const { duels } = build(8, 2);
    for (const duel of duels.values()) {
      expect(duel.options).toHaveLength(4);
      expect(duel.options.filter((option) => option.label === duel.prompt.truth)).toHaveLength(1);
      expect(new Set(duel.options.map((option) => option.id)).size).toBe(4);
      const correct = duel.options.find((option) => option.id === duel.correctOptionId);
      expect(correct?.label).toBe(duel.prompt.truth);
      for (const option of duel.options) expect(option.id).not.toContain(duel.prompt.id);
    }
  });

  it('never reuses a prompt within a game, even at the largest size', () => {
    const { duels } = build(8, 2);
    const promptIds = [...duels.values()].map((duel) => duel.prompt.id);
    expect(new Set(promptIds).size).toBe(16);
  });

  it('round two picks the lowest-overlap candidate', () => {
    for (const n of [5, 6, 7, 8]) {
      const rng = createSeededRandom(`overlap-${n}`);
      const ids = roster(n);
      const plans = planRounds(ids, 2, rng);
      const [first, second] = plans;
      if (!first || !second) throw new Error('missing plans');
      const seen = new Set(first.pairs.map(edgeKey));
      const repeats = second.pairs.filter((pair) => seen.has(edgeKey(pair))).length;
      expect(second.repeatedPairings).toBe(repeats);
      // Replay the same stream: no candidate could have had fewer repeats.
      const replay = createSeededRandom(`overlap-${n}`);
      const replayFirst = ringEdges(replay.shuffle(ids));
      replay.shuffle(ids.map((_, i) => i));
      let minimum = Infinity;
      for (let c = 0; c < ROUND_TWO_CANDIDATES; c += 1) {
        const pairs = ringEdges(replay.shuffle(ids));
        const replaySeen = new Set(replayFirst.map(edgeKey));
        minimum = Math.min(minimum, pairs.filter((pair) => replaySeen.has(edgeKey(pair))).length);
      }
      expect(repeats).toBe(minimum);
    }
  });

  it('N=3 necessarily repeats every pairing in round two, which is expected', () => {
    const { plans } = build(3, 2);
    expect(plans[1]?.repeatedPairings).toBe(3);
  });
});

describe('prompt drawing', () => {
  const everyday = promptsForPack(pack, 'everyday');

  it('refuses when the pack cannot cover the game', () => {
    const rng = createSeededRandom('x');
    expect(drawPrompts({ packPrompts: everyday.slice(0, 5), usedPromptIds: new Set(), needed: 6, rng })).toBeNull();
  });

  it('skips prompts used earlier in the room', () => {
    const used = new Set(everyday.slice(0, 10).map((prompt) => prompt.id));
    const drawn = drawPrompts({ packPrompts: everyday, usedPromptIds: used, needed: 6, rng: createSeededRandom('y') });
    expect(drawn?.resetUsed).toBe(false);
    for (const prompt of drawn?.prompts ?? []) expect(everyday.slice(0, 10).map((p) => p.id)).not.toContain(prompt.id);
    expect(used.size).toBe(16);
  });

  it('resets the used set for that pack between games when it runs low, never mid-game', () => {
    const used = new Set(everyday.slice(0, 12).map((prompt) => prompt.id));
    used.add('campus-work-typo');
    const drawn = drawPrompts({ packPrompts: everyday, usedPromptIds: used, needed: 6, rng: createSeededRandom('z') });
    expect(drawn?.resetUsed).toBe(true);
    expect(new Set(drawn?.prompts.map((prompt) => prompt.id)).size).toBe(6);
    // The other pack's history is untouched.
    expect(used.has('campus-work-typo')).toBe(true);
  });
});

describe('one-post scheduling', () => {
  it('pairs consecutive players and leaves the last one out of an odd roster', () => {
    expect(matchingPairs(['a', 'b', 'c', 'd'])).toEqual({ pairs: [['a', 'b'], ['c', 'd']], sitOutIds: [] });
    expect(matchingPairs(['a', 'b', 'c', 'd', 'e'])).toEqual({ pairs: [['a', 'b'], ['c', 'd']], sitOutIds: ['e'] });
  });

  for (const n of [3, 4, 5, 6, 7, 8]) {
    for (const seed of ['seed', 'another', 'third']) {
      it(`N=${n} (${seed}): everyone but the sit-out writes once per round; nobody sits out twice`, () => {
        const ids = roster(n);
        const plans = planRounds(ids, 2, createSeededRandom(seed), 1);
        const sitOuts: string[] = [];
        for (const plan of plans) {
          expect(plan.pairs).toHaveLength(Math.floor(n / 2));
          expect(plan.sitOutIds).toHaveLength(n % 2);
          expect([...plan.order].sort((a, b) => a - b)).toEqual(plan.pairs.map((_, index) => index));
          const writers = plan.pairs.flat();
          expect(new Set(writers).size).toBe(writers.length);
          expect([...writers, ...plan.sitOutIds].sort()).toEqual([...ids].sort());
          for (const [a, b] of plan.pairs) expect(a).not.toBe(b);
          sitOuts.push(...plan.sitOutIds);
        }
        expect(new Set(sitOuts).size).toBe(sitOuts.length);
        // With four or more players, round 2 can always avoid repeating a pair.
        if (n >= 4) expect(plans[1]?.repeatedPairings).toBe(0);
      });
    }
  }

  it('builds one duel per pair with the sit-out reading every duel', () => {
    const rng = createSeededRandom('seed');
    const ids = roster(5);
    const plans = planRounds(ids, 1, rng, 1);
    const drawn = drawPrompts({ packPrompts: promptsForPack(pack, 'mixed'), usedPromptIds: new Set(), needed: 2, rng });
    if (!drawn) throw new Error('pack too small');
    const built = buildSchedule({ rosterIds: ids, plans, prompts: drawn.prompts, rng, newId: sequentialIds() });
    const round = built.rounds[0]!;
    expect(round.duelIds).toHaveLength(2);
    expect(round.sitOutIds).toEqual(plans[0]!.sitOutIds);
    for (const duelId of round.duelIds) {
      const duel = built.duels.get(duelId)!;
      expect(duel.readerIds).toContain(round.sitOutIds[0]);
      expect(duel.readerIds).toHaveLength(3);
    }
    expect(built.assignments.size).toBe(4);
  });
});

