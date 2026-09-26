import { roundMultiplier, SIDES, type Side } from '@larpbox/shared';
import type { PromptDefinition } from '../content/loadPrompts.js';
import type { Random } from './random.js';
import type { Assignment, Duel, GuessOptionRecord, Round } from './types.js';

/**
 * Fair scheduling. Each round arranges the roster in a circle; its N edges are the N duels, so
 * every player writes exactly twice per round (degree two), including odd N. Never "random partner
 * per player", which can produce unequal assignments.
 */

export const ROUND_TWO_CANDIDATES = 200;

export type Pair = readonly [string, string];

export function ringEdges(ring: readonly string[]): Pair[] {
  return ring.map((id, index) => [id, ring[(index + 1) % ring.length] as string] as const);
}

export function edgeKey([a, b]: Pair): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface RoundPlan {
  roundIndex: number;
  /** Duels as unordered writer pairs, in ring order. */
  pairs: Pair[];
  /** Presentation order: pairs[order[k]] is presented k-th. */
  order: number[];
  repeatedPairings: number;
}

/**
 * Round 1: seeded shuffle into a ring. Round 2: the lowest-overlap ring out of 200 seeded
 * candidates (first candidate wins ties); repeats are unavoidable for small N and certain at N=3.
 * Presentation order is shuffled independently from the same PRNG stream.
 */
export function planRounds(rosterIds: readonly string[], roundCount: 1 | 2, rng: Random): RoundPlan[] {
  if (rosterIds.length < 3) throw new RangeError('A ring schedule needs at least three players.');
  const indexes = rosterIds.map((_, index) => index);
  const firstPairs = ringEdges(rng.shuffle(rosterIds));
  const plans: RoundPlan[] = [
    { roundIndex: 0, pairs: firstPairs, order: rng.shuffle(indexes), repeatedPairings: 0 },
  ];
  if (roundCount === 2) {
    const seen = new Set(firstPairs.map(edgeKey));
    let best: { pairs: Pair[]; repeats: number } | null = null;
    for (let candidate = 0; candidate < ROUND_TWO_CANDIDATES; candidate += 1) {
      const pairs = ringEdges(rng.shuffle(rosterIds));
      const repeats = pairs.filter((pair) => seen.has(edgeKey(pair))).length;
      if (best === null || repeats < best.repeats) best = { pairs, repeats };
    }
    if (!best) throw new Error('unreachable: no round-two candidates');
    plans.push({
      roundIndex: 1,
      pairs: best.pairs,
      order: rng.shuffle(indexes),
      repeatedPairings: best.repeats,
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
