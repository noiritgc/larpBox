import { randomUUID } from 'node:crypto';
import { DEFAULT_SETTINGS, type Phase } from '@larpbox/shared';
import { describe, expect, it } from 'vitest';
import { HEADLINES } from '../content/headlines.js';
import { loadPromptPack } from '../content/loadPrompts.js';
import {
  DEFAULT_STRATEGY,
  EngineHarness,
  expectedScores,
  playGame,
  type TestRoom,
} from '../testing/harness.js';
import { GameError } from './engine.js';
import { currentDuel, remainingMs } from './state.js';

/** `duels`: post-offs per round (N with two posts each, floor(N / 2) with one each). */
function expectedPhaseSequence(duels: number, rounds: 1 | 2): Phase[] {
  const out: Phase[] = ['RULES'];
  for (let r = 0; r < rounds; r += 1) {
    out.push('ROUND_INTRO', 'WRITING');
    for (let d = 0; d < duels; d += 1) out.push('DUEL_READ', 'DUEL_GUESS', 'DUEL_ENDORSE', 'DUEL_RESULT');
    if (r < rounds - 1) out.push('ROUND_SCOREBOARD');
  }
  out.push('FINAL');
  return out;
}

function scoresOf(h: EngineHarness, room: TestRoom): Record<string, number> {
  return Object.fromEntries([...h.entry(room).room.players.values()].map((p) => [p.id, p.score]));
}

function expectGameError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(GameError);
    expect((error as GameError).code).toBe(code);
    return;
  }
  throw new Error(`expected GameError ${code}`);
}

describe('complete games', () => {
  for (const n of [3, 4, 5, 6, 7, 8]) {
    for (const roundCount of [2, 1] as const) {
      it(`N=${n} ${roundCount === 2 ? 'Standard' : 'Quick'}: every phase, fair assignments, exact scores`, () => {
        const h = new EngineHarness();
        const room = h.lobby(n, { roundCount });
        h.start(room);
        const { duels, phases } = playGame(h, room);
        expect(phases).toEqual(expectedPhaseSequence(n, roundCount));
        expect(duels).toHaveLength(n * roundCount);
        for (let r = 1; r <= roundCount; r += 1) {
          const inRound = duels.filter((d) => d.roundNumber === r);
          expect(inRound).toHaveLength(n);
          for (const player of room.players) {
            const writes = inRound.filter((d) => d.writerA === player.id || d.writerB === player.id);
            expect(writes).toHaveLength(2);
          }
          for (const d of inRound) expect(d.multiplier).toBe(r === 1 ? 1 : 2);
        }
        const roster = room.players.map((p) => p.id);
        expect(scoresOf(h, room)).toEqual(expectedScores(roster, duels));
        const final = h.hostView(room);
        if (final.screen.kind !== 'FINAL') throw new Error('expected FINAL');
        expect(final.screen.rows).toHaveLength(n);
      });
    }
  }

  for (const n of [3, 4, 5, 6, 7, 8]) {
    for (const roundCount of [2, 1] as const) {
      it(`N=${n} ${roundCount === 2 ? 'Standard' : 'Quick'}, one post each: pairs, sit-outs, exact scores`, () => {
        const h = new EngineHarness();
        const room = h.lobby(n, { roundCount, postsPerPlayer: 1 });
        h.start(room);
        const { duels, phases } = playGame(h, room);
        const perRound = Math.floor(n / 2);
        expect(phases).toEqual(expectedPhaseSequence(perRound, roundCount));
        expect(duels).toHaveLength(perRound * roundCount);
        const game = h.entry(room).room.game;
        if (!game) throw new Error('no game');
        const sitOuts: string[] = [];
        for (let r = 1; r <= roundCount; r += 1) {
          const inRound = duels.filter((d) => d.roundNumber === r);
          const round = game.rounds[r - 1];
          if (!round) throw new Error('missing round');
          expect(round.sitOutIds).toHaveLength(n % 2);
          sitOuts.push(...round.sitOutIds);
          for (const player of room.players) {
            const writes = inRound.filter((d) => d.writerA === player.id || d.writerB === player.id);
            expect(writes).toHaveLength(round.sitOutIds.includes(player.id) ? 0 : 1);
          }
          // Whoever sits out reads every post-off of the round.
          for (const d of inRound) for (const id of round.sitOutIds) expect(d.readers).toContain(id);
        }
        // Nobody sits out twice.
        expect(new Set(sitOuts).size).toBe(sitOuts.length);
        const roster = room.players.map((p) => p.id);
        expect(scoresOf(h, room)).toEqual(expectedScores(roster, duels));
      });
    }
  }

  it('gives each player the same two truths as their opponents, and nothing else', () => {
    const h = new EngineHarness();
    const room = h.lobby(5);
    h.start(room);
    h.advanceUntil(room, 'WRITING');
    const game = h.entry(room).room.game;
    if (!game) throw new Error('no game');
    const truthsByPlayer = new Map<string, string[]>();
    for (const player of room.players) {
      const view = h.playerView(room, player);
      if (view.screen.kind !== 'WRITING') throw new Error('expected WRITING');
      expect(view.screen.assignments).toHaveLength(2);
      const numbers = view.screen.assignments.map((a) => a.presentationNumber);
      expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
      truthsByPlayer.set(player.id, view.screen.assignments.map((a) => a.truth));
    }
    for (const duelId of game.rounds[0]?.duelIds ?? []) {
      const duel = game.duels.get(duelId);
      if (!duel) throw new Error('missing duel');
      expect(truthsByPlayer.get(duel.writerBySide.A)).toContain(duel.prompt.truth);
      expect(truthsByPlayer.get(duel.writerBySide.B)).toContain(duel.prompt.truth);
    }
  });
});

describe('lobby', () => {
  it('assigns the smallest free seat and its headline; removal frees the seat', () => {
    const h = new EngineHarness();
    const room = h.createRoom();
    const [a, b, c] = ['Alex', 'Sam', 'Jo'].map((name) => h.join(room, name));
    const players = () => h.entry(room).room.players;
    expect([a, b, c].map((p) => players().get(p!.id)?.seat)).toEqual([0, 1, 2]);
    h.expectOk(h.send(room, 'host', 'host.removePlayer', { playerId: b!.id }));
    const d = h.join(room, 'Dev');
    expect(players().get(d.id)?.seat).toBe(1);
    const headlines = [...players().values()].map((player) => player.headline);
    for (const headline of headlines) expect(HEADLINES).toContain(headline);
    expect(new Set(headlines).size).toBe(headlines.length);
    expect(h.publisher.revoked.at(-1)?.payload.reason).toBe('REMOVED');
  });

  it('rejects duplicate names case-insensitively, bad names, a ninth player and late joins', () => {
    const h = new EngineHarness();
    const room = h.createRoom();
    h.join(room, 'Alex');
    expectGameError(() => h.join(room, '  aLEX '), 'NAME_TAKEN');
    expectGameError(() => h.join(room, 'A'), 'BAD_INPUT');
    expectGameError(() => h.join(room, 'Line\nBreak'), 'BAD_INPUT');
    for (let i = 2; i <= 8; i += 1) h.join(room, `Player ${i}`);
    expectGameError(() => h.join(room, 'Ninth'), 'ROOM_FULL');
    expect(h.engine.previewRoom(room.code)).toMatchObject({ playerCount: 8, canJoin: false, state: 'LOBBY' });

    const started = h.lobby(3);
    h.start(started);
    expectGameError(() => h.join(started, 'Latecomer'), 'GAME_STARTED');
    expect(h.engine.previewRoom(started.code)).toMatchObject({ state: 'PLAYING', canJoin: false });
  });

  it('blocks start below three players, with offline members, or unready members', () => {
    const h = new EngineHarness();
    const room = h.lobby(2);
    let ack = h.send(room, 'host', 'host.startGame', {});
    expect(ack.ok ? null : ack.code).toBe('FORBIDDEN');
    expect(h.hostView(room).screen).toMatchObject({ kind: 'LOBBY', canStart: false, startBlocker: { code: 'TOO_FEW_PLAYERS' } });

    const third = h.join(room, 'P3');
    expect(h.hostView(room).screen).toMatchObject({ startBlocker: { code: 'PLAYER_NOT_READY' } });
    h.expectOk(h.send(room, third, 'player.setReady', { ready: true }));
    h.disconnectPlayer(room, third);
    expect(h.hostView(room).screen).toMatchObject({ startBlocker: { code: 'PLAYER_OFFLINE' } });
    ack = h.send(room, 'host', 'host.startGame', {});
    expect(ack.ok ? null : ack.code).toBe('FORBIDDEN');
    h.connectPlayer(room, third);
    expect(h.hostView(room).screen).toMatchObject({ canStart: true, startBlocker: null });
  });

  it('clears readiness when the host changes settings', () => {
    const h = new EngineHarness();
    const room = h.lobby(3);
    h.expectOk(
      h.send(room, 'host', 'host.updateSettings', { settings: { ...DEFAULT_SETTINGS, secondsPerPost: 90 } }),
    );
    const view = h.playerView(room, room.players[0]!);
    expect(view.settings.secondsPerPost).toBe(90);
    expect(view.players.every((p) => !p.ready)).toBe(true);
    expect(view.screen).toMatchObject({ kind: 'LOBBY', settingsChanged: true });
  });

  it('expires a join reservation that never connects within 60 seconds', () => {
    const h = new EngineHarness();
    const room = h.createRoom();
    const ghost = h.join(room, 'Ghost', { connect: false });
    expect(h.hostView(room).players[0]).toMatchObject({ name: 'Ghost', joining: true, connected: false });
    h.clock.advance(59_999);
    expect(h.entry(room).room.players.has(ghost.id)).toBe(true);
    h.clock.advance(1);
    expect(h.entry(room).room.players.has(ghost.id)).toBe(false);
    expectGameError(
      () => h.engine.authenticate({ protocolVersion: 1, roomCode: room.code, role: 'player', token: ghost.token, clientInstanceId: randomUUID(), takeover: false }),
      'UNAUTHORIZED',
    );
  });

  it('lets a player leave only in the lobby, revoking their credential', () => {
    const h = new EngineHarness();
    const room = h.lobby(3);
    const leaver = room.players[2]!;
    h.expectOk(h.send(room, leaver, 'player.leave', {}));
    expect(h.entry(room).room.players.has(leaver.id)).toBe(false);
    expect(h.publisher.revoked.at(-1)?.payload.reason).toBe('LEFT');
    h.join(room, 'P3');
    for (const p of room.players.slice(2)) h.send(room, p, 'player.setReady', { ready: true });
    h.start(room);
    const ack = h.send(room, room.players[0]!, 'player.leave', {});
    expect(ack.ok ? null : ack.code).toBe('FORBIDDEN');
  });
});

describe('HTTP idempotency', () => {
  it('returns the same room for a retried create and rejects a changed body', () => {
    const h = new EngineHarness();
    const requestId = randomUUID();
    const first = h.engine.createRoom(requestId, DEFAULT_SETTINGS);
    const again = h.engine.createRoom(requestId, DEFAULT_SETTINGS);
    expect(again).toEqual(first);
    expect(h.engine.store.size).toBe(1);
    expectGameError(() => h.engine.createRoom(requestId, { ...DEFAULT_SETTINGS, roundCount: 1 }), 'REQUEST_CONFLICT');
    h.clock.advance(2 * 60_000);
    expectGameError(() => h.engine.createRoom(requestId, DEFAULT_SETTINGS), 'REQUEST_EXPIRED');
  });

  it('returns the same reservation for a retried join', () => {
    const h = new EngineHarness();
    const room = h.createRoom();
    const requestId = randomUUID();
    const first = h.engine.joinRoom(room.code, { requestId, name: 'Alex', avatarId: 'coffee' });
    const again = h.engine.joinRoom(room.code, { requestId, name: 'Alex', avatarId: 'coffee' });
    expect(again).toEqual(first);
    expect(h.entry(room).room.players.size).toBe(1);
    expectGameError(() => h.engine.joinRoom(room.code, { requestId, name: 'Alexa', avatarId: 'coffee' }), 'REQUEST_CONFLICT');
    // The reservation expires unconnected: a delayed retry must not resurrect the old credential.
    h.clock.advance(60_000);
    expectGameError(() => h.engine.joinRoom(room.code, { requestId, name: 'Alex', avatarId: 'coffee' }), 'REQUEST_EXPIRED');
  });

  it('enforces room capacity', () => {
    const h = new EngineHarness({ config: { maxRooms: 2 } });
    h.createRoom();
    h.createRoom();
    expectGameError(() => h.engine.createRoom(randomUUID(), DEFAULT_SETTINGS), 'ROOM_CAPACITY');
  });
});

describe('commands', () => {
  function inGuess(n = 5) {
    const h = new EngineHarness();
    const room = h.lobby(n);
    h.start(room);
    h.advanceUntil(room, 'WRITING');
    h.lockAllPosts(room);
    h.advanceUntil(room, 'DUEL_GUESS');
    return { h, room };
  }

  it('applies a retried request once and rejects a reused ID with a different body', () => {
    const { h, room } = inGuess();
    const reader = h.readersOfCurrentDuel(room)[0]!;
    const view = h.playerView(room, reader);
    if (view.screen.kind !== 'DUEL_GUESS') throw new Error('expected guess');
    const requestId = randomUUID();
    const [first, second] = view.screen.options;
    const ack1 = h.send(room, reader, 'duel.lockGuess', { duelId: view.screen.duelId, optionId: first!.id }, { requestId });
    const ack2 = h.send(room, reader, 'duel.lockGuess', { duelId: view.screen.duelId, optionId: first!.id }, { requestId });
    expect(ack2).toEqual(ack1);
    expect(currentDuel(h.entry(room).room.game!).guesses.size).toBe(1);
    const conflict = h.send(room, reader, 'duel.lockGuess', { duelId: view.screen.duelId, optionId: second!.id }, { requestId });
    expect(conflict.ok ? null : conflict.code).toBe('REQUEST_CONFLICT');
    const fresh = h.send(room, reader, 'duel.lockGuess', { duelId: view.screen.duelId, optionId: second!.id });
    expect(fresh.ok ? null : fresh.code).toBe('ALREADY_LOCKED');
    expect(currentDuel(h.entry(room).room.game!).guesses.get(reader.id)).toBe(first!.id);
  });

  it('rejects writer guesses and votes even when forged', () => {
    const { h, room } = inGuess();
    const { A } = h.writersOfCurrentDuel(room);
    const view = h.playerView(room, A);
    if (view.screen.kind !== 'DUEL_GUESS') throw new Error('expected guess');
    expect(view.screen.me.role).toBe('WRITER');
    const guess = h.send(room, A, 'duel.lockGuess', { duelId: view.screen.duelId, optionId: view.screen.options[0]!.id });
    expect(guess.ok ? null : guess.code).toBe('FORBIDDEN');
    for (const reader of h.readersOfCurrentDuel(room)) {
      h.send(room, reader, 'duel.lockGuess', { duelId: view.screen.duelId, optionId: view.screen.options[0]!.id });
    }
    h.advanceUntil(room, 'DUEL_ENDORSE');
    const vote = h.send(room, A, 'duel.lockEndorsement', { duelId: view.screen.duelId, choice: 'NEITHER' });
    expect(vote.ok ? null : vote.code).toBe('FORBIDDEN');
  });

  it('keeps host and player credentials in their lanes', () => {
    const { h, room } = inGuess();
    const hostGuess = h.send(room, 'host', 'duel.lockGuess', { duelId: randomUUID(), optionId: randomUUID() });
    expect(hostGuess.ok ? null : hostGuess.code).toBe('FORBIDDEN');
    const playerPause = h.send(room, room.players[0]!, 'host.pause', {});
    expect(playerPause.ok ? null : playerPause.code).toBe('FORBIDDEN');
    const playerClose = h.send(room, room.players[0]!, 'host.closeRoom', {});
    expect(playerClose.ok ? null : playerClose.code).toBe('FORBIDDEN');
  });

  it('rejects unknown option IDs, wrong duel IDs and stale phase IDs', () => {
    const { h, room } = inGuess();
    const reader = h.readersOfCurrentDuel(room)[0]!;
    const view = h.playerView(room, reader);
    if (view.screen.kind !== 'DUEL_GUESS') throw new Error('expected guess');
    const unknownOption = h.send(room, reader, 'duel.lockGuess', { duelId: view.screen.duelId, optionId: randomUUID() });
    expect(unknownOption.ok ? null : unknownOption.code).toBe('CHOICE_UNAVAILABLE');
    const wrongDuel = h.send(room, reader, 'duel.lockGuess', { duelId: randomUUID(), optionId: view.screen.options[0]!.id });
    expect(wrongDuel.ok ? null : wrongDuel.code).toBe('BAD_INPUT');
    const stale = h.send(room, reader, 'duel.lockGuess', { duelId: view.screen.duelId, optionId: view.screen.options[0]!.id }, { phaseId: randomUUID() });
    expect(stale.ok ? null : stale.code).toBe('PHASE_CHANGED');
  });
});

describe('writing', () => {
  function inWriting(n = 3, settings = {}) {
    const h = new EngineHarness();
    const room = h.lobby(n, settings);
    h.start(room);
    h.advanceUntil(room, 'WRITING');
    return { h, room };
  }

  function assignmentsOf(h: EngineHarness, room: TestRoom, index = 0) {
    const view = h.playerView(room, room.players[index]!);
    if (view.screen.kind !== 'WRITING') throw new Error('expected WRITING');
    return view.screen.assignments;
  }

  it('autosaves drafts with revisions and detects revision conflicts', () => {
    const { h, room } = inWriting();
    const player = room.players[0]!;
    const [first] = assignmentsOf(h, room);
    const saved = h.send(room, player, 'writing.saveDraft', { assignmentId: first!.id, text: 'short', expectedDraftRevision: 0 });
    expect(saved).toMatchObject({ ok: true, data: { draftRevision: 1, status: 'DRAFT' } });
    expect(h.publisher.publishes.at(-1)?.audience).toEqual({ kind: 'player', playerId: player.id });
    const conflict = h.send(room, player, 'writing.saveDraft', { assignmentId: first!.id, text: 'stale', expectedDraftRevision: 0 });
    expect(conflict.ok ? null : conflict.code).toBe('REVISION_CONFLICT');
    expect(h.publisher.publishes.at(-1)?.audience).toEqual({ kind: 'session', sessionId: player.sessionId });
    expect(assignmentsOf(h, room)[0]).toMatchObject({ draftText: 'short', draftRevision: 1 });
  });

  it('locks the complete text atomically and never lets a delayed save overwrite it', () => {
    const { h, room } = inWriting();
    const player = room.players[0]!;
    const [first] = assignmentsOf(h, room);
    const text = 'Proud to share that I have completed a strategic realignment of household resources.';
    const lockRequest = randomUUID();
    const locked = h.send(room, player, 'writing.lockPost', { assignmentId: first!.id, text, expectedDraftRevision: 0 }, { requestId: lockRequest });
    expect(locked).toMatchObject({ ok: true, data: { status: 'LOCKED', draftRevision: 1 } });
    const lateSave = h.send(room, player, 'writing.saveDraft', { assignmentId: first!.id, text: 'overwrite attempt', expectedDraftRevision: 1 });
    expect(lateSave.ok ? null : lateSave.code).toBe('ALREADY_LOCKED');
    const relock = h.send(room, player, 'writing.lockPost', { assignmentId: first!.id, text: `${text} again`, expectedDraftRevision: 1 });
    expect(relock.ok ? null : relock.code).toBe('ALREADY_LOCKED');
    // A lost-ack retry of the original lock is still a success.
    const retry = h.send(room, player, 'writing.lockPost', { assignmentId: first!.id, text, expectedDraftRevision: 0 }, { requestId: lockRequest });
    expect(retry).toEqual(locked);
    expect(assignmentsOf(h, room)[0]).toMatchObject({ status: 'LOCKED', finalText: text });
  });

  it('refuses to lock posts under 20 characters or over the limits', () => {
    const { h, room } = inWriting();
    const player = room.players[0]!;
    const [first] = assignmentsOf(h, room);
    const short = h.send(room, player, 'writing.lockPost', { assignmentId: first!.id, text: 'too short', expectedDraftRevision: 0 });
    expect(short).toMatchObject({ ok: false, code: 'BAD_INPUT', fieldErrors: { text: '20 characters minimum.' } });
    const long = h.send(room, player, 'writing.lockPost', { assignmentId: first!.id, text: 'x'.repeat(281), expectedDraftRevision: 0 });
    expect(long.ok ? null : long.code).toBe('BAD_INPUT');
  });

  it("rejects another player's assignment and unknown assignment IDs", () => {
    const { h, room } = inWriting();
    const theirs = assignmentsOf(h, room, 1)[0]!;
    const forged = h.send(room, room.players[0]!, 'writing.saveDraft', { assignmentId: theirs.id, text: 'mine now', expectedDraftRevision: 0 });
    expect(forged.ok ? null : forged.code).toBe('FORBIDDEN');
    const unknown = h.send(room, room.players[0]!, 'writing.saveDraft', { assignmentId: randomUUID(), text: 'x', expectedDraftRevision: 0 });
    expect(unknown.ok ? null : unknown.code).toBe('BAD_INPUT');
  });

  it('ends writing as soon as all 2N posts are locked', () => {
    const { h, room } = inWriting(4);
    h.lockAllPosts(room);
    expect(h.phase(room)).toBe('DUEL_READ');
  });

  it('auto-submits valid saved drafts and forfeits empty or invalid ones at the deadline', () => {
    const { h, room } = inWriting(3);
    const [p1, p2] = room.players;
    const a1 = assignmentsOf(h, room, 0);
    const a2 = assignmentsOf(h, room, 1);
    h.expectOk(h.send(room, p1!, 'writing.saveDraft', { assignmentId: a1[0]!.id, text: 'A perfectly valid saved draft for the team.', expectedDraftRevision: 0 }));
    h.expectOk(h.send(room, p1!, 'writing.saveDraft', { assignmentId: a1[1]!.id, text: 'too short', expectedDraftRevision: 0 }));
    h.expectOk(h.send(room, p2!, 'writing.lockPost', { assignmentId: a2[0]!.id, text: 'Locked with plenty of characters to spare.', expectedDraftRevision: 0 }));
    h.advanceToNextPhase(room);
    const game = h.entry(room).room.game!;
    expect(game.assignments.get(a1[0]!.id)).toMatchObject({ status: 'LOCKED', autoSubmitted: true, finalText: 'A perfectly valid saved draft for the team.' });
    expect(game.assignments.get(a1[1]!.id)).toMatchObject({ status: 'FORFEIT', finalText: null });
    expect(game.assignments.get(a2[0]!.id)).toMatchObject({ status: 'LOCKED', autoSubmitted: false });
    expect(game.assignments.get(a2[1]!.id)).toMatchObject({ status: 'FORFEIT' });
  });

  it('accepts a lock 1ms before the deadline and rejects it at the deadline', () => {
    const { h, room } = inWriting(3);
    const [p1, p2] = room.players;
    const a1 = assignmentsOf(h, room, 0)[0]!;
    const a2 = assignmentsOf(h, room, 1)[0]!;
    const entry = h.entry(room);
    const remaining = remainingMs(entry, h.clock.nowMonotonicMs())!;
    h.clock.advanceSilently(remaining - 1);
    h.expectOk(h.send(room, p1!, 'writing.lockPost', { assignmentId: a1.id, text: 'Locked with one millisecond to spare.', expectedDraftRevision: 0 }));
    h.clock.advanceSilently(1);
    const late = h.send(room, p2!, 'writing.lockPost', { assignmentId: a2.id, text: 'Locked exactly at the deadline, too late.', expectedDraftRevision: 0 });
    expect(late.ok ? null : late.code).toBe('DEADLINE_PASSED');
    expect(h.phase(room)).not.toBe('WRITING');
  });

  it('extends writing exactly once by 30 seconds', () => {
    const { h, room } = inWriting(3);
    const entry = h.entry(room);
    const before = remainingMs(entry, h.clock.nowMonotonicMs())!;
    h.expectOk(h.send(room, 'host', 'host.extendWriting', { seconds: 30 }));
    expect(remainingMs(entry, h.clock.nowMonotonicMs())).toBe(before + 30_000);
    expect(h.hostView(room).phase.durationMs).toBe(120_000);
    const twice = h.send(room, 'host', 'host.extendWriting', { seconds: 30 });
    expect(twice.ok ? null : twice.code).toBe('FORBIDDEN');
    h.clock.advance(before + 29_999);
    expect(h.phase(room)).toBe('WRITING');
    h.clock.advance(1);
    expect(h.phase(room)).not.toBe('WRITING');
  });
});

describe('timers', () => {
  function inGuess(n = 4) {
    const h = new EngineHarness();
    const room = h.lobby(n);
    h.start(room);
    h.advanceUntil(room, 'WRITING');
    h.lockAllPosts(room);
    h.advanceUntil(room, 'DUEL_GUESS');
    return { h, room };
  }

  function lockAllGuesses(h: EngineHarness, room: TestRoom) {
    for (const reader of h.readersOfCurrentDuel(room)) {
      const view = h.playerView(room, reader);
      if (view.screen.kind !== 'DUEL_GUESS') throw new Error('expected guess');
      h.expectOk(h.send(room, reader, 'duel.lockGuess', { duelId: view.screen.duelId, optionId: view.screen.options[0]!.id }));
    }
  }

  it('holds GUESS for its 5-second minimum even when everyone locks instantly', () => {
    const { h, room } = inGuess();
    lockAllGuesses(h, room);
    expect(h.phase(room)).toBe('DUEL_GUESS');
    h.clock.advance(4_999);
    expect(h.phase(room)).toBe('DUEL_GUESS');
    h.clock.advance(1);
    expect(h.phase(room)).toBe('DUEL_ENDORSE');
  });

  it('ends GUESS immediately when everyone locks after the minimum', () => {
    const { h, room } = inGuess();
    h.clock.advance(7_000);
    lockAllGuesses(h, room);
    expect(h.phase(room)).toBe('DUEL_ENDORSE');
  });

  it('holds ENDORSE for its 8-second minimum', () => {
    const { h, room } = inGuess();
    lockAllGuesses(h, room);
    h.advanceUntil(room, 'DUEL_ENDORSE');
    for (const reader of h.readersOfCurrentDuel(room)) {
      const view = h.playerView(room, reader);
      if (view.screen.kind !== 'DUEL_ENDORSE') throw new Error('expected endorse');
      h.expectOk(h.send(room, reader, 'duel.lockEndorsement', { duelId: view.screen.duelId, choice: 'A' }));
    }
    h.clock.advance(7_999);
    expect(h.phase(room)).toBe('DUEL_ENDORSE');
    h.clock.advance(1);
    expect(h.phase(room)).toBe('DUEL_RESULT');
  });

  it('runs the full countdown when readers stay silent; connected silent readers count as Neither', () => {
    const { h, room } = inGuess();
    h.clock.advance(19_999);
    expect(h.phase(room)).toBe('DUEL_GUESS');
    h.clock.advance(1);
    expect(h.phase(room)).toBe('DUEL_ENDORSE');
    const readers = h.readersOfCurrentDuel(room).length;
    h.clock.advance(20_000);
    expect(h.phase(room)).toBe('DUEL_RESULT');
    const view = h.hostView(room);
    if (view.screen.kind !== 'DUEL_RESULT') throw new Error('expected result');
    expect(view.screen.result).toMatchObject({ ballotsCast: readers, votesNeither: readers, stamp: 'NO_ENDORSEMENTS' });
    expect(view.screen.result.correctGuesserIds).toEqual([]);
    expect(view.screen.result.sides.A.points + view.screen.result.sides.B.points).toBe(0);
  });

  it('casts no ballot for readers who are offline when endorsing ends', () => {
    const { h, room } = inGuess();
    h.advanceUntil(room, 'DUEL_ENDORSE');
    for (const reader of h.readersOfCurrentDuel(room)) h.disconnectPlayer(room, reader);
    h.clock.advance(20_000);
    const view = h.hostView(room);
    if (view.screen.kind !== 'DUEL_RESULT') throw new Error('expected result');
    expect(view.screen.result).toMatchObject({ ballotsCast: 0, votesNeither: 0, stamp: 'NO_ENDORSEMENTS' });
  });

  it('pause freezes both the deadline and the minimum-display clock', () => {
    const { h, room } = inGuess();
    h.clock.advance(2_000);
    lockAllGuesses(h, room);
    h.clock.advance(1_000);
    h.expectOk(h.send(room, 'host', 'host.pause', {}));
    const paused = h.hostView(room);
    expect(paused.phase).toMatchObject({ paused: true, pauseReason: 'HOST_PAUSED', remainingMs: 17_000, deadlineAt: null });
    h.clock.advance(10 * 60_000);
    expect(h.phase(room)).toBe('DUEL_GUESS');
    const reader = h.readersOfCurrentDuel(room)[0]!;
    const blocked = h.send(room, reader, 'duel.lockGuess', { duelId: randomUUID(), optionId: randomUUID() });
    expect(blocked.ok ? null : blocked.code).toBe('GAME_PAUSED');
    h.expectOk(h.send(room, 'host', 'host.resume', {}));
    // 3s of active minimum time were used; 2s remain despite 10 minutes of paused wall time.
    h.clock.advance(1_999);
    expect(h.phase(room)).toBe('DUEL_GUESS');
    h.clock.advance(1);
    expect(h.phase(room)).toBe('DUEL_ENDORSE');
  });

  it('keeps the same phase ID across pause and resume', () => {
    const { h, room } = inGuess();
    const id = h.entry(room).room.phase.id;
    h.expectOk(h.send(room, 'host', 'host.pause', {}));
    h.expectOk(h.send(room, 'host', 'host.resume', {}));
    expect(h.entry(room).room.phase.id).toBe(id);
  });

  it('ignores stale timer callbacks from earlier phases', () => {
    const h = new EngineHarness();
    h.clock.ignoreCancellation = true;
    const room = h.lobby(4);
    h.start(room);
    const { duels, phases } = playGame(h, room);
    expect(phases).toEqual(expectedPhaseSequence(4, 2));
    expect(scoresOf(h, room)).toEqual(expectedScores(room.players.map((p) => p.id), duels));
  });

  it('is unaffected by wall-clock jumps', () => {
    const { h, room } = inGuess();
    const before = h.hostView(room).phase.remainingMs!;
    h.clock.jumpWallClock(60 * 60 * 1000);
    const after = h.hostView(room);
    expect(after.phase.remainingMs).toBe(before);
    expect(after.phase.deadlineAt! - after.serverNow).toBe(before);
    h.clock.jumpWallClock(-2 * 60 * 60 * 1000);
    h.clock.advance(before - 1);
    expect(h.phase(room)).toBe('DUEL_GUESS');
  });

  it('allows skipping the rules only after five active seconds', () => {
    const h = new EngineHarness();
    const room = h.lobby(3);
    h.start(room);
    expect(h.phase(room)).toBe('RULES');
    h.clock.advance(4_999);
    const early = h.send(room, 'host', 'host.skipRules', {});
    expect(early.ok ? null : early.code).toBe('FORBIDDEN');
    h.clock.advance(1);
    h.expectOk(h.send(room, 'host', 'host.skipRules', {}));
    expect(h.phase(room)).toBe('ROUND_INTRO');
  });

  it('scales every timed phase with GAME_TIME_SCALE', () => {
    const h = new EngineHarness({ timeScale: 0.2 });
    const room = h.lobby(3);
    h.start(room);
    expect(h.hostView(room).phase.durationMs).toBe(3_000);
    h.advanceUntil(room, 'WRITING');
    expect(h.hostView(room).phase.durationMs).toBe(18_000);
  });
});

describe('host connection', () => {
  it('pauses timed play when the host disconnects and stays paused after reconnect', () => {
    const h = new EngineHarness();
    const room = h.lobby(3);
    h.start(room);
    h.advanceUntil(room, 'WRITING');
    h.clock.advance(30_000);
    h.disconnectHost(room);
    const view = h.playerView(room, room.players[0]!);
    expect(view.phase).toMatchObject({ paused: true, pauseReason: 'HOST_DISCONNECTED', remainingMs: 60_000 });
    expect(view.hostConnected).toBe(false);
    h.clock.advance(5 * 60_000);
    expect(h.phase(room)).toBe('WRITING');
    h.connectHost(room);
    const back = h.hostView(room);
    expect(back.phase).toMatchObject({ paused: true, pauseReason: 'HOST_PAUSED', remainingMs: 60_000 });
    h.expectOk(h.send(room, 'host', 'host.resume', {}));
    h.clock.advance(59_999);
    expect(h.phase(room)).toBe('WRITING');
    h.clock.advance(1);
    expect(h.phase(room)).not.toBe('WRITING');
  });

  it('does not double-subtract time when the host drops while already paused', () => {
    const h = new EngineHarness();
    const room = h.lobby(3);
    h.start(room);
    h.advanceUntil(room, 'WRITING');
    h.clock.advance(10_000);
    h.expectOk(h.send(room, 'host', 'host.pause', {}));
    h.clock.advance(20_000);
    h.disconnectHost(room);
    expect(h.hostView(room).phase).toMatchObject({ remainingMs: 80_000, pauseReason: 'HOST_DISCONNECTED' });
  });

  it('keeps player sessions when only the host drops', () => {
    const h = new EngineHarness();
    const room = h.lobby(3);
    h.disconnectHost(room);
    expect(h.hostView(room).players.every((p) => p.connected)).toBe(true);
  });
});

describe('sessions', () => {
  it('requires an explicit takeover from a different tab', () => {
    const h = new EngineHarness();
    const room = h.lobby(3);
    const player = room.players[0]!;
    const original = player.socketId!;
    expectGameError(() => h.connectPlayer(room, player, { newTab: true }), 'SESSION_IN_USE');
    const takeover = h.connectPlayer(room, player, { takeover: true });
    expect(takeover).not.toBe(original);
    expect(h.liveSockets.has(original)).toBe(false);
    // The replaced socket's late disconnect must not mark the new connection offline.
    h.dropSocket(room, original);
    expect(h.entry(room).room.players.get(player.id)?.connected).toBe(true);
  });

  it('lets the same live tab replace its own stale transport', () => {
    const h = new EngineHarness();
    const room = h.lobby(3);
    const player = room.players[0]!;
    const first = player.socketId!;
    const second = h.connectPlayer(room, player);
    expect(second).not.toBe(first);
    expect(h.entry(room).room.players.get(player.id)?.connected).toBe(true);
  });

  it('denies wrong roles, bad tokens, other rooms and old protocols', () => {
    const h = new EngineHarness();
    const room = h.lobby(3);
    const other = h.createRoom();
    const base = { protocolVersion: 1, clientInstanceId: randomUUID(), takeover: false } as const;
    expectGameError(() => h.engine.authenticate({ ...base, roomCode: room.code, role: 'player', token: room.hostToken }), 'FORBIDDEN');
    expectGameError(() => h.engine.authenticate({ ...base, roomCode: room.code, role: 'player', token: 'x'.repeat(43) }), 'UNAUTHORIZED');
    expectGameError(() => h.engine.authenticate({ ...base, roomCode: other.code, role: 'player', token: room.players[0]!.token }), 'UNAUTHORIZED');
    expectGameError(() => h.engine.authenticate({ ...base, protocolVersion: 2, roomCode: room.code, role: 'host', token: room.hostToken }), 'PROTOCOL_MISMATCH');
    const ok = h.engine.authenticate({ ...base, roomCode: room.code, role: 'host', token: room.hostToken });
    expect(ok.session.role).toBe('host');
  });
});

describe('forfeits and scoring', () => {
  it('handles one forfeit: remaining post can win, forfeited side cannot be endorsed', () => {
    const h = new EngineHarness();
    const room = h.lobby(4);
    h.start(room);
    h.advanceUntil(room, 'WRITING');
    const game = h.entry(room).room.game!;
    const firstDuel = game.duels.get(game.rounds[0]!.duelIds[0]!)!;
    const absentee = room.players.find((p) => p.id === firstDuel.writerBySide.A)!;
    h.lockAllPosts(room, room.players.filter((p) => p !== absentee));
    h.advanceUntil(room, 'DUEL_READ');
    const read = h.hostView(room);
    if (read.screen.kind !== 'DUEL_READ') throw new Error('expected read');
    expect(read.screen.posts.A).toEqual({ status: 'FORFEIT' });
    expect(read.screen.posts.B.status).toBe('POSTED');
    h.advanceUntil(room, 'DUEL_ENDORSE');
    const endorse = h.hostView(room);
    if (endorse.screen.kind !== 'DUEL_ENDORSE') throw new Error('expected endorse');
    expect(endorse.screen.availableChoices).toEqual(['B', 'NEITHER']);
    const [r1, r2] = h.readersOfCurrentDuel(room);
    const bad = h.send(room, r1!, 'duel.lockEndorsement', { duelId: endorse.screen.duelId, choice: 'A' });
    expect(bad.ok ? null : bad.code).toBe('CHOICE_UNAVAILABLE');
    h.expectOk(h.send(room, r1!, 'duel.lockEndorsement', { duelId: endorse.screen.duelId, choice: 'B' }));
    h.expectOk(h.send(room, r2!, 'duel.lockEndorsement', { duelId: endorse.screen.duelId, choice: 'NEITHER' }));
    h.advanceUntil(room, 'DUEL_RESULT');
    const result = h.hostView(room);
    if (result.screen.kind !== 'DUEL_RESULT') throw new Error('expected result');
    expect(result.screen.result.sides.A).toMatchObject({ forfeit: true, text: null, points: 0, votes: 0 });
    expect(result.screen.result.sides.B).toMatchObject({ forfeit: false, points: 500, votes: 1 });
    expect(result.screen.result.stamp).toBe('ENDORSED_B');
  });

  it('skips a double forfeit straight to a 5-second unfilled result', () => {
    const h = new EngineHarness();
    const room = h.lobby(3);
    h.start(room);
    h.advanceUntil(room, 'WRITING');
    h.advanceToNextPhase(room); // nobody writes anything
    expect(h.phase(room)).toBe('DUEL_RESULT');
    const view = h.hostView(room);
    if (view.screen.kind !== 'DUEL_RESULT') throw new Error('expected result');
    expect(view.phase.durationMs).toBe(5_000);
    expect(view.screen.result).toMatchObject({ stamp: 'UNFILLED', ballotsCast: 0, correctGuesserIds: [] });
    expect(view.players.every((p) => p.score === 0)).toBe(true);
  });

  it('finishes an all-forfeit game in an all-zero joint win with no best post', () => {
    const h = new EngineHarness();
    const room = h.lobby(3);
    h.start(room);
    const { phases } = playGame(h, room, { write: () => null });
    expect(phases.filter((p) => p === 'DUEL_READ')).toHaveLength(0);
    const final = h.hostView(room);
    if (final.screen.kind !== 'FINAL') throw new Error('expected final');
    expect(final.screen.award).toBe('CO_CEOS_OF_DOING_NOTHING');
    expect(final.screen.winnerIds).toHaveLength(3);
    expect(final.screen.bestPost).toBeNull();
    expect(final.screen.rows.every((row) => row.rank === 1 && row.total === 0)).toBe(true);
  });

  it('pays all-Neither duels nothing for writers but still pays correct readers', () => {
    const h = new EngineHarness();
    const room = h.lobby(4, { roundCount: 1 });
    h.start(room);
    h.advanceUntil(room, 'WRITING');
    h.lockAllPosts(room);
    h.advanceUntil(room, 'DUEL_GUESS');
    const game = h.entry(room).room.game!;
    const duel = currentDuel(game);
    for (const reader of h.readersOfCurrentDuel(room)) {
      h.expectOk(h.send(room, reader, 'duel.lockGuess', { duelId: duel.id, optionId: duel.correctOptionId }));
    }
    h.advanceUntil(room, 'DUEL_ENDORSE');
    for (const reader of h.readersOfCurrentDuel(room)) {
      h.expectOk(h.send(room, reader, 'duel.lockEndorsement', { duelId: duel.id, choice: 'NEITHER' }));
    }
    h.advanceUntil(room, 'DUEL_RESULT');
    const view = h.hostView(room);
    if (view.screen.kind !== 'DUEL_RESULT') throw new Error('expected result');
    expect(view.screen.result).toMatchObject({ votesNeither: 2, ballotsCast: 2, stamp: 'NO_ENDORSEMENTS', guessPoints: 250 });
    expect(view.screen.result.sides.A.points + view.screen.result.sides.B.points).toBe(0);
    expect(view.screen.result.correctGuesserIds).toHaveLength(2);
  });

  it('scores the spec example: 666/333 and 250 per correct reader, doubled in round two', () => {
    for (const roundNumber of [1, 2]) {
      const h = new EngineHarness();
      const room = h.lobby(5);
      h.start(room);
      if (roundNumber === 2) {
        playUntilRound(h, room, 2);
      }
      h.advanceUntil(room, 'WRITING');
      h.lockAllPosts(room);
      h.advanceUntil(room, 'DUEL_GUESS');
      const game = h.entry(room).room.game!;
      const duel = currentDuel(game);
      const [r1, r2, r3] = h.readersOfCurrentDuel(room);
      const wrong = duel.options.find((o) => o.id !== duel.correctOptionId)!.id;
      h.expectOk(h.send(room, r1!, 'duel.lockGuess', { duelId: duel.id, optionId: duel.correctOptionId }));
      h.expectOk(h.send(room, r2!, 'duel.lockGuess', { duelId: duel.id, optionId: duel.correctOptionId }));
      h.expectOk(h.send(room, r3!, 'duel.lockGuess', { duelId: duel.id, optionId: wrong }));
      h.advanceUntil(room, 'DUEL_ENDORSE');
      h.expectOk(h.send(room, r1!, 'duel.lockEndorsement', { duelId: duel.id, choice: 'A' }));
      h.expectOk(h.send(room, r2!, 'duel.lockEndorsement', { duelId: duel.id, choice: 'A' }));
      h.expectOk(h.send(room, r3!, 'duel.lockEndorsement', { duelId: duel.id, choice: 'B' }));
      const before = scoresOf(h, room);
      h.advanceUntil(room, 'DUEL_RESULT');
      const after = scoresOf(h, room);
      const m = roundNumber === 1 ? 1 : 2;
      const delta = (id: string) => (after[id] ?? 0) - (before[id] ?? 0);
      expect(delta(duel.writerBySide.A)).toBe(m === 1 ? 666 : 1333);
      expect(delta(duel.writerBySide.B)).toBe(m === 1 ? 333 : 666);
      expect(delta(r1!.id)).toBe(250 * m);
      expect(delta(r2!.id)).toBe(250 * m);
      expect(delta(r3!.id)).toBe(0);
      const personal = h.playerView(room, r1!);
      if (personal.screen.kind !== 'DUEL_RESULT') throw new Error('expected result');
      expect(personal.screen.me).toMatchObject({ role: 'READER', guessPoints: 250 * m, writingPoints: null, guessCorrect: true });
      // Settling again returns the identical result and leaves totals unchanged.
      const again = h.engine.settleDuel(h.entry(room), duel);
      expect(again).toBe(duel.result);
      expect(scoresOf(h, room)).toEqual(after);
    }
  });

  it('marks tied positive endorsements as co-endorsed with no bonus', () => {
    const h = new EngineHarness();
    const room = h.lobby(4, { roundCount: 1 });
    h.start(room);
    h.advanceUntil(room, 'WRITING');
    h.lockAllPosts(room);
    h.advanceUntil(room, 'DUEL_ENDORSE');
    const duel = currentDuel(h.entry(room).room.game!);
    const [r1, r2] = h.readersOfCurrentDuel(room);
    h.expectOk(h.send(room, r1!, 'duel.lockEndorsement', { duelId: duel.id, choice: 'A' }));
    h.expectOk(h.send(room, r2!, 'duel.lockEndorsement', { duelId: duel.id, choice: 'B' }));
    h.advanceUntil(room, 'DUEL_RESULT');
    const view = h.hostView(room);
    if (view.screen.kind !== 'DUEL_RESULT') throw new Error('expected result');
    expect(view.screen.result.stamp).toBe('CO_ENDORSED');
    expect([view.screen.result.sides.A.points, view.screen.result.sides.B.points]).toEqual([500, 500]);
  });
});

function playUntilRound(h: EngineHarness, room: TestRoom, round: number): void {
  let guard = 0;
  while ((h.entry(room).room.game?.roundIndex ?? 0) + 1 < round || h.phase(room) !== 'ROUND_INTRO') {
    guard += 1;
    if (guard > 500) throw new Error('never reached round');
    if (h.phase(room) === 'WRITING') h.lockAllPosts(room);
    else h.advanceToNextPhase(room);
  }
}

describe('rematch and prompt reuse', () => {
  it('returns connected players to the lobby, drops offline ones and resets scores', () => {
    const h = new EngineHarness();
    const room = h.lobby(4);
    h.start(room);
    playGame(h, room, DEFAULT_STRATEGY);
    const dropped = room.players[3]!;
    h.disconnectPlayer(room, dropped);
    const seatsBefore = room.players.slice(0, 3).map((p) => h.entry(room).room.players.get(p.id)?.seat);
    h.expectOk(h.send(room, 'host', 'host.returnToLobby', {}));
    const entry = h.entry(room);
    expect(entry.room.phase.name).toBe('LOBBY');
    expect(entry.room.game).toBeNull();
    expect(entry.room.players.has(dropped.id)).toBe(false);
    expect(h.publisher.revoked.at(-1)).toMatchObject({ sessionId: dropped.sessionId, payload: { reason: 'REMOVED' } });
    expect(room.players.slice(0, 3).map((p) => entry.room.players.get(p.id)?.seat)).toEqual(seatsBefore);
    for (const player of entry.room.players.values()) expect(player).toMatchObject({ score: 0, ready: false });
    expect(entry.room.code).toBe(room.code);
    expectGameError(
      () => h.engine.authenticate({ protocolVersion: 1, roomCode: room.code, role: 'player', token: dropped.token, clientInstanceId: randomUUID(), takeover: false }),
      'UNAUTHORIZED',
    );
  });

  it('uses fresh prompts across rematches until the pack runs out, then resets between games', () => {
    const h = new EngineHarness();
    const room = h.lobby(8, { pack: 'everyday', roundCount: 1 });
    const seen: string[][] = [];
    for (let game = 0; game < 3; game += 1) {
      if (game > 0) {
        h.expectOk(h.send(room, 'host', 'host.returnToLobby', {}));
        for (const p of room.players) h.expectOk(h.send(room, p, 'player.setReady', { ready: true }));
      }
      h.start(room);
      const g = h.entry(room).room.game!;
      seen.push([...g.duels.values()].map((d) => d.prompt.id));
      playGame(h, room);
    }
    expect(new Set(seen[0]).size).toBe(8);
    // Games 1 and 2 together use all 16 Everyday prompts exactly once.
    expect(new Set([...seen[0]!, ...seen[1]!]).size).toBe(16);
    // Game 3 needed a reset, but still has no internal repeats.
    expect(new Set(seen[2]).size).toBe(8);
  });

  it('refuses to start when the selected pack cannot cover the game', () => {
    const full = loadPromptPack();
    const h = new EngineHarness({ promptPack: { ...full, prompts: full.prompts.slice(0, 5) } });
    const room = h.lobby(3);
    const ack = h.send(room, 'host', 'host.startGame', {});
    expect(ack.ok ? null : ack.code).toBe('CONFIG_INVALID');
    expect(h.phase(room)).toBe('LOBBY');
  });
});

describe('room lifetime', () => {
  it('expires an idle lobby after 30 minutes and cleans up everything', () => {
    const h = new EngineHarness();
    const room = h.lobby(3);
    h.clock.advance(30 * 60_000 - 1);
    h.engine.sweep();
    expect(h.engine.store.get(room.roomId)).toBeDefined();
    h.clock.advance(1);
    h.engine.sweep();
    expect(h.engine.store.get(room.roomId)).toBeUndefined();
    expect(h.publisher.closed.at(-1)).toMatchObject({ roomId: room.roomId, payload: { reason: 'EXPIRED' } });
    expect(h.clock.pendingTimerCount()).toBe(0);
    expectGameError(
      () => h.engine.authenticate({ protocolVersion: 1, roomCode: room.code, role: 'host', token: room.hostToken, clientInstanceId: randomUUID(), takeover: false }),
      'ROOM_ENDED',
    );
    // The code stays tombstoned for ten minutes, then reads as unknown.
    h.clock.advance(10 * 60_000);
    h.engine.sweep();
    expectGameError(() => h.engine.previewRoom(room.code), 'ROOM_NOT_FOUND');
  });

  it('does not expire an active timed game for lobby idleness', () => {
    const h = new EngineHarness({ config: { roomIdleMs: 60_000 } });
    const room = h.lobby(3);
    h.start(room);
    h.advanceUntil(room, 'WRITING');
    h.clock.advance(80_000);
    h.engine.sweep();
    expect(h.engine.store.get(room.roomId)).toBeDefined();
  });

  it('expires a room ten minutes after every device went offline', () => {
    const h = new EngineHarness();
    const room = h.lobby(3);
    h.disconnectHost(room);
    for (const p of room.players) h.disconnectPlayer(room, p);
    h.clock.advance(10 * 60_000);
    h.engine.sweep();
    expect(h.engine.store.get(room.roomId)).toBeUndefined();
  });

  it('expires an active game ten minutes after the host left', () => {
    const h = new EngineHarness();
    const room = h.lobby(3);
    h.start(room);
    h.advanceUntil(room, 'WRITING');
    h.disconnectHost(room);
    h.clock.advance(10 * 60_000 - 1);
    h.engine.sweep();
    expect(h.engine.store.get(room.roomId)).toBeDefined();
    h.clock.advance(1);
    h.engine.sweep();
    expect(h.engine.store.get(room.roomId)).toBeUndefined();
  });

  it('expires after the six-hour absolute lifetime', () => {
    const h = new EngineHarness({ config: { roomIdleMs: 24 * 60 * 60_000 } });
    const room = h.lobby(3);
    h.clock.advance(6 * 60 * 60_000);
    h.engine.sweep();
    expect(h.engine.store.get(room.roomId)).toBeUndefined();
  });

  it('closes on host request after acknowledging, and revokes every credential', () => {
    const h = new EngineHarness();
    const room = h.lobby(3);
    h.start(room);
    const ack = h.send(room, 'host', 'host.closeRoom', {});
    expect(ack.ok).toBe(true);
    expect(h.engine.store.get(room.roomId)).toBeUndefined();
    expect(h.publisher.closed.at(-1)?.payload.reason).toBe('HOST_ENDED');
    expect(h.clock.pendingTimerCount()).toBe(0);
  });
});

describe('one post each', () => {
  it('pairs players, tells everyone who sits out, and gives the sit-out nothing to write', () => {
    const h = new EngineHarness();
    const room = h.lobby(5, { postsPerPlayer: 1 });
    h.start(room);
    h.advanceUntil(room, 'ROUND_INTRO');
    const intro = h.hostView(room);
    if (intro.screen.kind !== 'ROUND_INTRO') throw new Error('expected ROUND_INTRO');
    expect(intro.screen.sitOutIds).toHaveLength(1);
    const sitOutId = intro.screen.sitOutIds[0]!;
    expect(intro.duelsInRound).toBe(2);

    h.advanceUntil(room, 'WRITING');
    for (const player of room.players) {
      const view = h.playerView(room, player);
      if (view.screen.kind !== 'WRITING') throw new Error('expected WRITING');
      expect(view.screen.assignments).toHaveLength(player.id === sitOutId ? 0 : 1);
    }
    const writing = h.hostView(room);
    if (writing.screen.kind !== 'WRITING') throw new Error('expected WRITING');
    expect(writing.screen.assignmentTotal).toBe(4);
    for (const entry of writing.screen.progress) expect(entry.total).toBe(entry.playerId === sitOutId ? 0 : 1);

    // Writing ends as soon as the four writers lock; the sit-out has nothing to lock.
    h.lockAllPosts(room, room.players.filter((player) => player.id !== sitOutId));
    expect(h.phase(room)).toBe('DUEL_READ');
    expect(h.readersOfCurrentDuel(room).map((player) => player.id)).toContain(sitOutId);
  });

  it('has no sit-out with an even roster', () => {
    const h = new EngineHarness();
    const room = h.lobby(4, { postsPerPlayer: 1, roundCount: 1 });
    h.start(room);
    h.advanceUntil(room, 'ROUND_INTRO');
    const intro = h.hostView(room);
    if (intro.screen.kind !== 'ROUND_INTRO') throw new Error('expected ROUND_INTRO');
    expect(intro.screen.sitOutIds).toEqual([]);
    expect(intro.duelsInRound).toBe(2);
  });

  it('writes for secondsPerPost times postsPerPlayer', () => {
    for (const [postsPerPlayer, secondsPerPost, expected] of [
      [1, 60, 60_000],
      [2, 60, 120_000],
      [1, 45, 45_000],
      [2, 90, 180_000],
    ] as const) {
      const h = new EngineHarness();
      const room = h.lobby(4, { postsPerPlayer, secondsPerPost });
      h.start(room);
      h.advanceUntil(room, 'WRITING');
      expect(h.hostView(room).phase.durationMs).toBe(expected);
    }
  });

  it('puts a different player out in round 2 even with three players', () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const h = new EngineHarness();
      const room = h.lobby(3, { postsPerPlayer: 1 });
      h.start(room);
      const game = h.entry(room).room.game;
      if (!game) throw new Error('no game');
      const [first, second] = game.rounds;
      expect(first?.sitOutIds).toHaveLength(1);
      expect(second?.sitOutIds).toHaveLength(1);
      expect(second?.sitOutIds[0]).not.toBe(first?.sitOutIds[0]);
    }
  });
});

describe('picks at the deadline', () => {
  function inGuess(n = 5) {
    const h = new EngineHarness();
    const room = h.lobby(n);
    h.start(room);
    h.advanceUntil(room, 'WRITING');
    h.lockAllPosts(room);
    h.advanceUntil(room, 'DUEL_GUESS');
    return { h, room };
  }

  it('locks an unlocked guess pick when time runs out; the pick is private until then', () => {
    const { h, room } = inGuess();
    const [picker, silent] = h.readersOfCurrentDuel(room);
    if (!picker || !silent) throw new Error('need two readers');
    const view = h.playerView(room, picker);
    if (view.screen.kind !== 'DUEL_GUESS') throw new Error('expected guess');
    const correct = currentDuel(h.entry(room).room.game!).correctOptionId;
    const wrong = view.screen.options.find((option) => option.id !== correct)!.id;
    h.expectOk(h.send(room, picker, 'duel.pickGuess', { duelId: view.screen.duelId, optionId: wrong }));
    h.expectOk(h.send(room, picker, 'duel.pickGuess', { duelId: view.screen.duelId, optionId: correct }));

    const mine = h.playerView(room, picker);
    if (mine.screen.kind !== 'DUEL_GUESS') throw new Error('expected guess');
    expect(mine.screen.me).toMatchObject({ guessPick: correct, guessOptionId: null });
    expect(mine.screen.lockedCount).toBe(0);
    const theirs = h.playerView(room, silent);
    if (theirs.screen.kind !== 'DUEL_GUESS') throw new Error('expected guess');
    expect(theirs.screen.me.guessPick).toBeNull();
    expect(JSON.stringify(h.hostView(room))).not.toContain('guessPick');

    h.clock.advance(20_000);
    expect(h.phase(room)).toBe('DUEL_ENDORSE');
    const after = h.playerView(room, picker);
    if (after.screen.kind !== 'DUEL_ENDORSE') throw new Error('expected endorse');
    expect(after.screen.me).toMatchObject({ guessOptionId: correct, guessCorrect: true });
    const other = h.playerView(room, silent);
    if (other.screen.kind !== 'DUEL_ENDORSE') throw new Error('expected endorse');
    expect(other.screen.me.guessOptionId).toBeNull();

    h.advanceUntil(room, 'DUEL_RESULT');
    const result = h.hostView(room);
    if (result.screen.kind !== 'DUEL_RESULT') throw new Error('expected result');
    expect(result.screen.result.correctGuesserIds).toEqual([picker.id]);
  });

  it('keeps a locked guess over an earlier pick and refuses picks after locking', () => {
    const { h, room } = inGuess();
    const reader = h.readersOfCurrentDuel(room)[0]!;
    const view = h.playerView(room, reader);
    if (view.screen.kind !== 'DUEL_GUESS') throw new Error('expected guess');
    const [first, second] = view.screen.options;
    h.expectOk(h.send(room, reader, 'duel.pickGuess', { duelId: view.screen.duelId, optionId: first!.id }));
    h.expectOk(h.send(room, reader, 'duel.lockGuess', { duelId: view.screen.duelId, optionId: second!.id }));
    const late = h.send(room, reader, 'duel.pickGuess', { duelId: view.screen.duelId, optionId: first!.id });
    expect(late.ok ? null : late.code).toBe('ALREADY_LOCKED');
    h.clock.advance(20_000);
    const after = h.playerView(room, reader);
    if (after.screen.kind !== 'DUEL_ENDORSE') throw new Error('expected endorse');
    expect(after.screen.me.guessOptionId).toBe(second!.id);
  });

  it('locks endorsement picks, counts silent connected readers as Neither, and skips offline readers', () => {
    const { h, room } = inGuess(6);
    h.advanceUntil(room, 'DUEL_ENDORSE');
    const [picker, silent, offline] = h.readersOfCurrentDuel(room);
    if (!picker || !silent || !offline) throw new Error('need three readers');
    const readers = h.readersOfCurrentDuel(room);
    const view = h.playerView(room, picker);
    if (view.screen.kind !== 'DUEL_ENDORSE') throw new Error('expected endorse');
    h.expectOk(h.send(room, picker, 'duel.pickEndorsement', { duelId: view.screen.duelId, choice: 'B' }));
    h.expectOk(h.send(room, picker, 'duel.pickEndorsement', { duelId: view.screen.duelId, choice: 'A' }));
    const mine = h.playerView(room, picker);
    if (mine.screen.kind !== 'DUEL_ENDORSE') throw new Error('expected endorse');
    expect(mine.screen.me).toMatchObject({ endorsementPick: 'A', endorsement: null });
    h.disconnectPlayer(room, offline);

    h.clock.advance(20_000);
    const result = h.hostView(room);
    if (result.screen.kind !== 'DUEL_RESULT') throw new Error('expected result');
    // One A, then Neither for every other connected reader; the offline reader casts nothing.
    const neither = readers.length - 2;
    expect(result.screen.result).toMatchObject({ ballotsCast: readers.length - 1, votesNeither: neither });
    expect(result.screen.result.sides.A.votes).toBe(1);
    expect(result.screen.result.sides.A.points).toBe(Math.floor(1000 / (readers.length - 1)));
  });

  it('refuses picks from writers, for unavailable choices, in the wrong phase and while paused', () => {
    const { h, room } = inGuess();
    const writers = h.writersOfCurrentDuel(room);
    const reader = h.readersOfCurrentDuel(room)[0]!;
    const view = h.playerView(room, reader);
    if (view.screen.kind !== 'DUEL_GUESS') throw new Error('expected guess');
    const optionId = view.screen.options[0]!.id;
    const writer = h.send(room, writers.A, 'duel.pickGuess', { duelId: view.screen.duelId, optionId });
    expect(writer.ok ? null : writer.code).toBe('FORBIDDEN');
    const unknown = h.send(room, reader, 'duel.pickGuess', { duelId: view.screen.duelId, optionId: randomUUID() });
    expect(unknown.ok ? null : unknown.code).toBe('CHOICE_UNAVAILABLE');
    const wrongPhase = h.send(room, reader, 'duel.pickEndorsement', { duelId: view.screen.duelId, choice: 'A' });
    expect(wrongPhase.ok ? null : wrongPhase.code).toBe('FORBIDDEN');
    h.expectOk(h.send(room, 'host', 'host.pause', {}));
    const paused = h.send(room, reader, 'duel.pickGuess', { duelId: view.screen.duelId, optionId });
    expect(paused.ok ? null : paused.code).toBe('GAME_PAUSED');
  });
});
