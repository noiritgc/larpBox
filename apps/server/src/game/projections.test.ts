import { describe, expect, it } from 'vitest';
import { loadPromptPack } from '../content/loadPrompts.js';
import { DEFAULT_STRATEGY, EngineHarness, type TestRoom } from '../testing/harness.js';
import { currentDuel } from './state.js';
import type { Duel, GameState } from './types.js';

const pack = loadPromptPack();

function screenJson(view: { screen: unknown }): string {
  return JSON.stringify(view.screen);
}

function allDuels(game: GameState): Duel[] {
  return game.rounds.flatMap((round) => round.duelIds.map((id) => game.duels.get(id)!));
}

/** Secrets that must never appear anywhere in any view. */
function assertNoGlobalSecrets(h: EngineHarness, room: TestRoom, json: string): void {
  const entry = h.entry(room);
  for (const session of entry.room.sessions.values()) expect(json).not.toContain(session.tokenHash);
  expect(json).not.toContain(room.hostToken);
  for (const player of room.players) expect(json).not.toContain(player.token);
  const game = entry.room.game;
  if (game) {
    expect(json).not.toContain(game.seed);
    for (const duel of game.duels.values()) expect(json).not.toContain(`"${duel.prompt.id}"`);
    // No part of the pack outside this game's prompts.
    const used = new Set([...game.duels.values()].map((duel) => duel.prompt.id));
    for (const prompt of pack.prompts) {
      if (!used.has(prompt.id)) expect(json).not.toContain(prompt.truth);
    }
  }
  for (const key of ['"tokenHash"', '"seed"', '"distractors"', '"promptId"', '"writerBySide"', '"guesses"', '"endorsements"', '"requests"']) {
    expect(json).not.toContain(key);
  }
}

/** Walks a full game, checking every view at every phase against the secrecy timeline. */
function walkGameCheckingSecrecy(n: number): number {
  const h = new EngineHarness();
  const room = h.lobby(n);
  h.start(room);
  let checks = 0;
  let guard = 0;
  while (h.phase(room) !== 'FINAL') {
    guard += 1;
    if (guard > 2000) throw new Error('game did not finish');
    const entry = h.entry(room);
    const game = entry.room.game!;
    const phase = entry.room.phase.name;
    const host = h.hostView(room);
    const hostJson = JSON.stringify(host);
    const players = room.players.map((player) => ({ player, view: h.playerView(room, player) }));
    assertNoGlobalSecrets(h, room, hostJson);
    for (const { view } of players) assertNoGlobalSecrets(h, room, JSON.stringify(view));

    const roundDuels = game.rounds[game.roundIndex]!.duelIds.map((id) => game.duels.get(id)!);
    const futureDuels = game.rounds.slice(game.roundIndex + 1).flatMap((r) => r.duelIds.map((id) => game.duels.get(id)!));
    // Future-round content is never projected.
    for (const duel of futureDuels) {
      expect(hostJson).not.toContain(duel.prompt.truth);
      for (const { view } of players) expect(JSON.stringify(view)).not.toContain(duel.prompt.truth);
    }

    if (phase === 'WRITING') {
      for (const duel of allDuels(game)) expect(hostJson).not.toContain(duel.prompt.truth);
      for (const { player, view } of players) {
        const json = screenJson(view);
        const own = roundDuels.filter((d) => d.writerBySide.A === player.id || d.writerBySide.B === player.id);
        expect(own).toHaveLength(2);
        for (const duel of roundDuels) {
          if (own.includes(duel)) expect(json).toContain(duel.prompt.truth);
          else expect(json).not.toContain(duel.prompt.truth);
          for (const distractor of duel.prompt.distractors) expect(json).not.toContain(distractor);
          for (const option of duel.options) expect(json).not.toContain(option.id);
        }
        for (const other of room.players) if (other !== player) expect(json).not.toContain(other.id);
      }
      // Drafts never leave their owner.
      const writer = room.players[0]!;
      const writerView = players[0]!.view;
      if (writerView.screen.kind === 'WRITING') {
        const assignment = writerView.screen.assignments.find((a) => a.status === 'DRAFT');
        if (assignment) {
          const secret = `secret draft ${game.roundIndex} unique marker`;
          h.expectOk(h.send(room, writer, 'writing.saveDraft', { assignmentId: assignment.id, text: secret, expectedDraftRevision: assignment.draftRevision }));
          expect(JSON.stringify(h.hostView(room))).not.toContain(secret);
          for (const other of room.players.slice(1)) expect(JSON.stringify(h.playerView(room, other))).not.toContain(secret);
          expect(JSON.stringify(h.playerView(room, writer))).toContain(secret);
        }
      }
      h.lockAllPosts(room);
      checks += 1;
      continue;
    }

    if (phase === 'DUEL_READ' || phase === 'DUEL_GUESS' || phase === 'DUEL_ENDORSE') {
      const duel = currentDuel(game);
      const views = [{ json: screenJson(host) }, ...players.map(({ view }) => ({ json: screenJson(view) }))];
      for (const { json } of views) {
        // Author identities are hidden until RESULT.
        for (const player of room.players) expect(json).not.toContain(player.id);
        if (phase === 'DUEL_READ') {
          for (const option of duel.options) {
            expect(json).not.toContain(option.id);
          }
          for (const distractor of duel.prompt.distractors) expect(json).not.toContain(distractor);
          expect(json).not.toContain(duel.prompt.truth);
        }
        if (phase === 'DUEL_GUESS') {
          expect(json).not.toContain('"correctOptionId"');
          expect(json).not.toContain('"truth"');
          for (const fact of duel.prompt.facts) expect(json).not.toContain(fact);
        }
        if (phase === 'DUEL_ENDORSE') {
          expect(json).toContain(duel.prompt.truth);
          expect(json).not.toContain('"votes"');
        }
      }
      if (phase === 'DUEL_GUESS') {
        for (const reader of h.readersOfCurrentDuel(room)) {
          const view = h.playerView(room, reader);
          if (view.screen.kind !== 'DUEL_GUESS') continue;
          const optionId = DEFAULT_STRATEGY.guess(reader, view.screen.options, game.duelIndex + 1, game.roundIndex + 1);
          if (optionId) h.expectOk(h.send(room, reader, 'duel.lockGuess', { duelId: duel.id, optionId }));
          // Everyone sees only the aggregate count plus, at most, their own locked guess.
          for (const other of room.players) {
            const otherView = h.playerView(room, other);
            if (otherView.screen.kind !== 'DUEL_GUESS') continue;
            expect(otherView.screen.me.guessOptionId).toBe(duel.guesses.get(other.id) ?? null);
            expect(otherView.screen.lockedCount).toBe(duel.guesses.size);
          }
        }
      }
      if (phase === 'DUEL_ENDORSE') {
        for (const reader of h.readersOfCurrentDuel(room)) {
          const view = h.playerView(room, reader);
          if (view.screen.kind !== 'DUEL_ENDORSE') continue;
          const choice = DEFAULT_STRATEGY.endorse(reader, view.screen.availableChoices, game.duelIndex + 1, game.roundIndex + 1);
          if (choice) h.expectOk(h.send(room, reader, 'duel.lockEndorsement', { duelId: duel.id, choice }));
        }
        const hostMid = screenJson(h.hostView(room));
        expect(hostMid).not.toContain('"votes"');
        for (const player of room.players) expect(hostMid).not.toContain(player.id);
      }
      if (h.phase(room) === phase) h.advanceToNextPhase(room);
      checks += 1;
      continue;
    }

    if (phase === 'DUEL_RESULT') {
      const duel = currentDuel(game);
      const correct = new Set(duel.result!.correctGuesserIds);
      for (const json of [screenJson(host), ...players.map(({ view }) => screenJson(view))]) {
        expect(json).toContain(duel.writerBySide.A);
        expect(json).toContain(duel.writerBySide.B);
        // Readers who guessed wrong (or not at all) are never named; ballots are never listed.
        for (const readerId of duel.readerIds) {
          if (correct.has(readerId)) expect(json).toContain(readerId);
          else expect(json).not.toContain(readerId);
        }
      }
      h.advanceToNextPhase(room);
      checks += 1;
      continue;
    }

    h.advanceToNextPhase(room);
  }
  return checks;
}

describe('secrecy timeline', () => {
  for (const n of [3, 5, 8]) {
    it(`holds at every phase of a full ${n}-player game`, () => {
      expect(walkGameCheckingSecrecy(n)).toBeGreaterThan(n * 4);
    });
  }

  it('shows the host no truths or drafts during writing even if the host operator also plays', () => {
    const h = new EngineHarness();
    const room = h.lobby(3);
    h.start(room);
    h.advanceUntil(room, 'WRITING');
    const view = h.hostView(room);
    if (view.screen.kind !== 'WRITING') throw new Error('expected WRITING');
    expect(Object.keys(view.screen).sort()).toEqual(['assignmentTotal', 'extensionUsed', 'kind', 'lockedTotal', 'progress']);
    expect(view.screen.progress.every((p) => p.locked === 0)).toBe(true);
  });

  it('gives anonymous posts identical, author-free shapes', () => {
    const h = new EngineHarness();
    const room = h.lobby(4);
    h.start(room);
    h.advanceUntil(room, 'WRITING');
    h.lockAllPosts(room);
    h.advanceUntil(room, 'DUEL_READ');
    const view = h.hostView(room);
    if (view.screen.kind !== 'DUEL_READ') throw new Error('expected READ');
    expect(Object.keys(view.screen.posts.A).sort()).toEqual(['status', 'text']);
    expect(Object.keys(view.screen.posts.B).sort()).toEqual(['status', 'text']);
  });

  it('personalizes result breakdowns without exposing ballots', () => {
    const h = new EngineHarness();
    const room = h.lobby(4, { roundCount: 1 });
    h.start(room);
    h.advanceUntil(room, 'WRITING');
    h.lockAllPosts(room);
    h.advanceUntil(room, 'DUEL_RESULT');
    const { A } = h.writersOfCurrentDuel(room);
    const writerView = h.playerView(room, A);
    if (writerView.screen.kind !== 'DUEL_RESULT') throw new Error('expected RESULT');
    expect(writerView.screen.me).toMatchObject({ role: 'WRITER', side: 'A', guessPoints: null, guessCorrect: null });
    expect(writerView.screen.me.writingPoints).toBe(0);
  });
});
