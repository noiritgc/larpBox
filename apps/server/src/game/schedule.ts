import { roundMultiplier, SIDES, type RoomSettings, type Side } from '@larpbox/shared';
import type { PromptDefinition } from '../content/loadPrompts.js';
import type { Random } from './random.js';
import type { Assignment, Duel, GuessOptionRecord, Round } from './types.js';

/**
 * Fair scheduling, never "random partner per player", which can produce unequal assignments.
 *
 * Two posts each: each round arranges the roster in a circle; its N edges are the N duels, so every
 * player writes exactly twice per round (degree two), including odd N.
 *
 * One post each: each round pairs players up (a perfect matching, floor(N / 2) duels). With an odd
 * roster the unpaired player sits out that round and judges every post-off; in a two-round game a
 * different player sits out in round 2.
 */

export const ROUND_TWO_CANDIDATES = 200;

export type Pair = readonly [string, string];

export function ringEdges(ring: readonly string[]): Pair[] {
  return ring.map((id, index) => [id, ring[(index + 1) % ring.length] as string] as const);
}

/** Consecutive pairs of a shuffled roster; an odd roster leaves its last player sitting out. */
export function matchingPairs(order: readonly string[]): { pairs: Pair[]; sitOutIds: string[] } {
  const pairs: Pair[] = [];
  for (let index = 0; index + 1 < order.length; index += 2) {
    pairs.push([order[index] as string, order[index + 1] as string] as const);
  }
  const last = order[order.length - 1];
  return { pairs, sitOutIds: order.length % 2 === 1 && last !== undefined ? [last] : [] };
}

export function edgeKey([a, b]: Pair): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface RoundPlan {
  roundIndex: number;
  /** Duels as unordered writer pairs, in ring (or matching) order. */
  pairs: Pair[];
  /** Presentation order: pairs[order[k]] is presented k-th. */
  order: number[];
  repeatedPairings: number;
  /** Players with no post this round (one post each, odd roster). */
  sitOutIds: string[];
}

function arrange(order: readonly string[], postsPerPlayer: RoomSettings['postsPerPlayer']): { pairs: Pair[]; sitOutIds: string[] } {
  return postsPerPlayer === 2 ? { pairs: ringEdges(order), sitOutIds: [] } : matchingPairs(order);
}

/**
 * Round 1: seeded shuffle into a ring or matching. Round 2: the lowest-overlap arrangement out of
 * 200 seeded candidates (first candidate wins ties); with one post each and an odd roster, only
 * candidates whose sit-out differs from round 1 qualify. Repeats are unavoidable for small N.
 * Presentation order is shuffled independently from the same PRNG stream.
 */
export function planRounds(
  rosterIds: readonly string[],
  roundCount: 1 | 2,
  rng: Random,
  postsPerPlayer: RoomSettings['postsPerPlayer'] = 2,
): RoundPlan[] {
  if (rosterIds.length < 3) throw new RangeError('A schedule needs at least three players.');
  const first = arrange(rng.shuffle(rosterIds), postsPerPlayer);
  const plans: RoundPlan[] = [
    {
      roundIndex: 0,
      pairs: first.pairs,
      order: rng.shuffle(first.pairs.map((_, index) => index)),
      repeatedPairings: 0,
      sitOutIds: first.sitOutIds,
    },
  ];
  if (roundCount === 2) {
    const seen = new Set(first.pairs.map(edgeKey));
    const satOut = new Set(first.sitOutIds);
    let best: { pairs: Pair[]; sitOutIds: string[]; repeats: number } | null = null;
    for (let candidate = 0; candidate < ROUND_TWO_CANDIDATES; candidate += 1) {
      const next = arrange(rng.shuffle(rosterIds), postsPerPlayer);
      if (next.sitOutIds.some((id) => satOut.has(id))) continue;
      const repeats = next.pairs.filter((pair) => seen.has(edgeKey(pair))).length;
      if (best === null || repeats < best.repeats) best = { ...next, repeats };
    }
    if (!best) {
      // Practically unreachable (each candidate repeats the sit-out with probability 1/N): rotate
      // round 1's order so its sit-out moves into the first pair.
      const rotated = [...first.sitOutIds, ...first.pairs.flat()];
      const next = arrange(rotated, postsPerPlayer);
      best = { ...next, repeats: next.pairs.filter((pair) => seen.has(edgeKey(pair))).length };
    }
    plans.push({
      roundIndex: 1,
      pairs: best.pairs,
      order: rng.shuffle(best.pairs.map((_, index) => index)),
      repeatedPairings: best.repeats,
      sitOutIds: best.sitOutIds,
    });
  }
  return plans;
}

export interface BuiltSchedule {
  rounds: Round[];
  duels: Map<string, Duel>;
  assignments: Map<string, Assignment>;
}

/**
 * Materializes duels in presentation order: one unused prompt each (copied in full), writer sides
 * randomized once, and the truth plus three distractors shuffled once under opaque option IDs.
 */
export function buildSchedule(input: {
  rosterIds: readonly string[];
  plans: readonly RoundPlan[];
  prompts: readonly PromptDefinition[];
  rng: Random;
  newId: () => string;
}): BuiltSchedule {
  const { rosterIds, plans, prompts, rng, newId } = input;
  const needed = plans.reduce((sum, plan) => sum + plan.pairs.length, 0);
  if (prompts.length < needed) {
    throw new RangeError(`Schedule needs ${needed} prompts but only ${prompts.length} were provided.`);
  }
  const draw = [...prompts];
  if (new Set(draw.map((prompt) => prompt.id)).size !== draw.length) {
    throw new RangeError('Prompts passed to buildSchedule must be unique.');
  }

  const rounds: Round[] = [];
  const duels = new Map<string, Duel>();
  const assignments = new Map<string, Assignment>();
  let drawIndex = 0;

  for (const plan of plans) {
    const duelIds: string[] = [];
    plan.order.forEach((pairIndex, orderIndex) => {
      const pair = plan.pairs[pairIndex];
      const prompt = draw[drawIndex];
      drawIndex += 1;
      if (!pair || !prompt) throw new Error('unreachable: schedule index out of range');

      const swap = rng.int(2) === 1;
      const writerBySide: Record<Side, string> = {
        A: swap ? pair[1] : pair[0],
        B: swap ? pair[0] : pair[1],
      };
      const options: GuessOptionRecord[] = rng
        .shuffle([prompt.truth, ...prompt.distractors])
        .map((label) => ({ id: newId(), label }));
      const correct = options.find((option) => option.label === prompt.truth);
      if (!correct) throw new Error('unreachable: truth missing from options');

      const duelId = newId();
      const assignmentBySide = {} as Record<Side, string>;
      for (const side of SIDES) {
        const assignmentId = newId();
        assignmentBySide[side] = assignmentId;
        assignments.set(assignmentId, {
          id: assignmentId,
          playerId: writerBySide[side],
          duelId,
          draftText: '',
          draftRevision: 0,
          finalText: null,
          status: 'DRAFT',
          lockedAt: null,
          autoSubmitted: false,
        });
      }
      duels.set(duelId, {
        id: duelId,
        roundIndex: plan.roundIndex,
        orderIndex,
        prompt: structuredClone(prompt),
        assignmentBySide,
        writerBySide,
        options,
        correctOptionId: correct.id,
        readerIds: rosterIds.filter((id) => id !== pair[0] && id !== pair[1]),
        guesses: new Map(),
        endorsements: new Map(),
        guessPicks: new Map(),
        endorsementPicks: new Map(),
        settled: false,
        result: null,
      });
      duelIds.push(duelId);
    });
    rounds.push({
      index: plan.roundIndex,
      multiplier: roundMultiplier(plan.roundIndex),
      duelIds,
      repeatedPairings: plan.repeatedPairings,
      sitOutIds: [...plan.sitOutIds],
      scoreAtStart: {},
    });
  }
  return { rounds, duels, assignments };
}

/**
 * Chooses the prompts for a new game. Prompts already used in this room are skipped; if too few
 * remain, the used set is reset for the selected pack only, before drawing. A game never reuses a
 * truth. Returns null when even the full pack is too small (CONFIG_INVALID).
 */
export function drawPrompts(input: {
  packPrompts: readonly PromptDefinition[];
  usedPromptIds: Set<string>;
  needed: number;
  rng: Random;
}): { prompts: PromptDefinition[]; resetUsed: boolean } | null {
  const { packPrompts, usedPromptIds, needed, rng } = input;
  if (packPrompts.length < needed) return null;
  let available = packPrompts.filter((prompt) => !usedPromptIds.has(prompt.id));
  let resetUsed = false;
  if (available.length < needed) {
    for (const prompt of packPrompts) usedPromptIds.delete(prompt.id);
    available = [...packPrompts];
    resetUsed = true;
  }
  const prompts = rng.shuffle(available).slice(0, needed);
  for (const prompt of prompts) usedPromptIds.add(prompt.id);
  return { prompts, resetUsed };
}
