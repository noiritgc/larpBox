import { randomUUID } from 'node:crypto';
import {
  DEFAULT_SETTINGS,
  HostViewSchema,
  PlayerViewSchema,
  type Ack,
  type AssignmentView,
  type AvatarId,
  type CommandEnvelope,
  type CommandPayload,
  type CommandType,
  type Endorsement,
  type GuessOption,
  type HostView,
  type Phase,
  type PlayerView,
  type RoomClosedPayload,
  type RoomSettings,
} from '@larpbox/shared';
import { loadPromptPack, type PromptPack } from '../content/loadPrompts.js';
import { FakeClock } from '../game/clock.js';
import { GameEngine, type Audience, type EngineConfig, type Publisher } from '../game/engine.js';
import { projectHost, projectPlayer, type ProjectionContext } from '../game/projections.js';
import { remainingMs } from '../game/state.js';
import type { RoomEntry } from '../game/types.js';
import { createSilentLogger } from '../logger.js';

/** Test-only helpers for driving the engine without any transport. Never imported by src/index. */

export function sequentialIds(start = 0): () => string {
  let n = start;
  return () => {
    n += 1;
    return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
  };
}

export class RecordingPublisher implements Publisher {
  publishes: { roomId: string; audience: Audience }[] = [];
  closed: { roomId: string; payload: RoomClosedPayload }[] = [];
  revoked: { roomId: string; sessionId: string; payload: RoomClosedPayload }[] = [];

  publish(entry: RoomEntry, audience: Audience): void {
    this.publishes.push({ roomId: entry.room.id, audience });
  }

  roomClosed(entry: RoomEntry, payload: RoomClosedPayload): void {
    this.closed.push({ roomId: entry.room.id, payload });
  }

  sessionRevoked(entry: RoomEntry, session: { id: string }, payload: RoomClosedPayload): void {
    this.revoked.push({ roomId: entry.room.id, sessionId: session.id, payload });
  }
}

export interface TestPlayer {
  id: string;
  name: string;
  sessionId: string;
  token: string;
  socketId: string | null;
  clientInstanceId: string;
}

export interface TestRoom {
  roomId: string;
  code: string;
  hostToken: string;
  hostSessionId: string;
  hostSocketId: string | null;
  hostInstanceId: string;
  players: TestPlayer[];
}

export type Actor = 'host' | TestPlayer;

export interface HarnessOptions {
  timeScale?: number;
  config?: Partial<EngineConfig>;
  promptPack?: PromptPack;
  seed?: string;
}

export const TEST_AVATARS: AvatarId[] = [
  'briefcase',
  'coffee',
  'ladder',
  'trophy',
  'necktie',
  'spreadsheet',
  'plant',
  'stamp',
];

export class EngineHarness {
  readonly clock = new FakeClock();
  readonly publisher = new RecordingPublisher();
  readonly engine: GameEngine;
  readonly liveSockets = new Set<string>();
  private readonly socketGenerations = new Map<string, { sessionId: string; generation: number }>();
  private socketCounter = 0;
  private seedCounter = 0;
  readonly bootId = randomUUID();
  readonly publicOrigin = 'http://larpbox.test';

  constructor(options: HarnessOptions = {}) {
    this.engine = new GameEngine({
      config: {
        publicOrigin: this.publicOrigin,
        maxRooms: 100,
        roomMaxAgeMs: 6 * 60 * 60 * 1000,
        roomIdleMs: 30 * 60 * 1000,
        roomAbandonedMs: 10 * 60 * 1000,
        gameTimeScale: options.timeScale ?? 1,
        ...options.config,
      },
      promptPack: options.promptPack ?? loadPromptPack(),
      clock: this.clock,
      scheduler: this.clock,
      logger: createSilentLogger(),
      bootId: this.bootId,
      newId: sequentialIds(),
      newSeed: () => options.seed ?? `seed-${(this.seedCounter += 1)}`,
    });
    this.engine.setPublisher(this.publisher);
  }

  entry(room: TestRoom): RoomEntry {
    const entry = this.engine.store.get(room.roomId);
    if (!entry) throw new Error('room is gone');
    return entry;
  }

  phase(room: TestRoom): Phase {
    return this.entry(room).room.phase.name;
  }

  ctx(): ProjectionContext {
    return {
      bootId: this.bootId,
      publicOrigin: this.publicOrigin,
      nowEpochMs: this.clock.nowEpochMs(),
      nowMonotonicMs: this.clock.nowMonotonicMs(),
      timeScale: this.engine.timeScale,
    };
  }

  /** Projects and strictly validates the host view. */
  hostView(room: TestRoom): HostView {
    return HostViewSchema.parse(projectHost(this.entry(room), this.ctx()));
  }

  /** Projects and strictly validates a player's view. */
  playerView(room: TestRoom, player: TestPlayer): PlayerView {
    return PlayerViewSchema.parse(projectPlayer(this.entry(room), player.id, this.ctx()));
  }

  createRoom(settings: Partial<RoomSettings> = {}): TestRoom {
    const response = this.engine.createRoom(randomUUID(), { ...DEFAULT_SETTINGS, ...settings });
    const entry = this.engine.store.get(response.roomId);
    const hostSession = entry ? [...entry.room.sessions.values()].find((s) => s.role === 'host') : undefined;
    if (!hostSession) throw new Error('host session missing');
    const room: TestRoom = {
      roomId: response.roomId,
      code: response.roomCode,
      hostToken: response.hostToken,
      hostSessionId: hostSession.id,
      hostSocketId: null,
      hostInstanceId: randomUUID(),
      players: [],
    };
    this.connectHost(room);
    return room;
  }

  private attach(room: TestRoom, sessionId: string, clientInstanceId: string, takeover = false): string {
    this.socketCounter += 1;
    const socketId = `socket-${this.socketCounter}`;
    this.liveSockets.add(socketId);
    try {
      const result = this.engine.attach({
        roomId: room.roomId,
        sessionId,
        socketId,
        clientInstanceId,
        takeover,
        isSocketLive: (id) => this.liveSockets.has(id),
      });
      if (result.replacedSocketId) this.liveSockets.delete(result.replacedSocketId);
      this.socketGenerations.set(socketId, { sessionId, generation: result.generation });
      return socketId;
    } catch (error) {
      this.liveSockets.delete(socketId);
      throw error;
    }
  }

  connectHost(room: TestRoom, options: { newTab?: boolean; takeover?: boolean } = {}): string {
    if (options.newTab) room.hostInstanceId = randomUUID();
    room.hostSocketId = this.attach(room, room.hostSessionId, room.hostInstanceId, options.takeover);
    return room.hostSocketId;
  }

  connectPlayer(room: TestRoom, player: TestPlayer, options: { newTab?: boolean; takeover?: boolean } = {}): string {
    if (options.newTab) player.clientInstanceId = randomUUID();
    player.socketId = this.attach(room, player.sessionId, player.clientInstanceId, options.takeover);
    return player.socketId;
  }

  /** Simulates a transport drop: the socket dies, then its disconnect handler runs. */
  dropSocket(room: TestRoom, socketId: string | null): void {
    if (!socketId) throw new Error('no socket to drop');
    const info = this.socketGenerations.get(socketId);
    this.liveSockets.delete(socketId);
    if (info) this.engine.detach(room.roomId, info.sessionId, socketId, info.generation);
  }

  disconnectHost(room: TestRoom): void {
    this.dropSocket(room, room.hostSocketId);
    room.hostSocketId = null;
  }

  disconnectPlayer(room: TestRoom, player: TestPlayer): void {
    this.dropSocket(room, player.socketId);
    player.socketId = null;
  }

  join(room: TestRoom, name: string, options: { connect?: boolean; avatarId?: AvatarId } = {}): TestPlayer {
    const avatarId = options.avatarId ?? TEST_AVATARS[room.players.length % TEST_AVATARS.length] ?? 'briefcase';
    const response = this.engine.joinRoom(room.code, { requestId: randomUUID(), name, avatarId });
    const session = [...this.entry(room).room.sessions.values()].find((s) => s.playerId === response.playerId);
    if (!session) throw new Error('player session missing');
    const player: TestPlayer = {
      id: response.playerId,
      name,
      sessionId: session.id,
      token: response.playerToken,
      socketId: null,
      clientInstanceId: randomUUID(),
    };
    room.players.push(player);
    if (options.connect !== false) this.connectPlayer(room, player);
    return player;
  }

  /** Room with `count` connected, ready players named P1..Pn. */
  lobby(count: number, settings: Partial<RoomSettings> = {}): TestRoom {
    const room = this.createRoom(settings);
    for (let i = 1; i <= count; i += 1) this.join(room, `P${i}`);
    for (const player of room.players) this.expectOk(this.send(room, player, 'player.setReady', { ready: true }));
    return room;
  }

  send<T extends CommandType>(
    room: TestRoom,
    actor: Actor,
    type: T,
    payload: CommandPayload<T>,
    overrides: { requestId?: string; phaseId?: string; gameId?: string | null } = {},
  ): Ack {
    const entry = this.entry(room);
    const envelope = {
      requestId: overrides.requestId ?? randomUUID(),
      phaseId: overrides.phaseId ?? entry.room.phase.id,
      gameId: overrides.gameId === undefined ? (entry.room.game?.id ?? null) : overrides.gameId,
      type,
      payload,
    } as CommandEnvelope;
    const sessionId = actor === 'host' ? room.hostSessionId : actor.sessionId;
    const outcome = this.engine.executeCommand(room.roomId, sessionId, envelope);
    outcome.after?.();
    return outcome.ack;
  }

  expectOk(ack: Ack): Ack {
    if (!ack.ok) throw new Error(`Expected ok ack, got ${ack.code}: ${ack.message}`);
    return ack;
  }

  start(room: TestRoom): void {
    this.expectOk(this.send(room, 'host', 'host.startGame', {}));
  }

  /** Advances time in small steps until the phase ID changes (timers fire along the way). */
  advanceToNextPhase(room: TestRoom, maxMs = 10 * 60 * 1000): void {
    const entry = this.entry(room);
    const startId = entry.room.phase.id;
    let elapsed = 0;
    while (this.engine.store.get(room.roomId) && entry.room.phase.id === startId) {
      if (elapsed > maxMs) throw new Error(`Phase ${entry.room.phase.name} did not end within ${maxMs}ms`);
      const remaining = remainingMs(entry, this.clock.nowMonotonicMs());
      const step = remaining === null ? 1000 : Math.max(1, Math.min(remaining, 500));
      this.clock.advance(step);
      elapsed += step;
    }
  }

  advanceUntil(room: TestRoom, phase: Phase, maxMs = 30 * 60 * 1000): void {
    let spent = 0;
    while (this.phase(room) !== phase) {
      const before = this.clock.nowMonotonicMs();
      this.advanceToNextPhase(room, maxMs - spent);
      spent += this.clock.nowMonotonicMs() - before;
    }
  }

  /** Locks every current-round assignment for every player (or the given subset). */
  lockAllPosts(room: TestRoom, players: TestPlayer[] = room.players): void {
    for (const player of players) {
      const view = this.playerView(room, player);
      if (view.screen.kind !== 'WRITING') throw new Error(`not writing: ${view.screen.kind}`);
      for (const assignment of view.screen.assignments) {
        if (assignment.status !== 'DRAFT') continue;
        this.expectOk(
          this.send(room, player, 'writing.lockPost', {
            assignmentId: assignment.id,
            text: defaultPostText(player, assignment.presentationNumber),
            expectedDraftRevision: assignment.draftRevision,
          }),
        );
      }
    }
  }

  readersOfCurrentDuel(room: TestRoom): TestPlayer[] {
    const game = this.entry(room).room.game;
    if (!game) throw new Error('no game');
    const duelId = game.rounds[game.roundIndex]?.duelIds[game.duelIndex];
    const duel = duelId ? game.duels.get(duelId) : undefined;
    if (!duel) throw new Error('no duel');
    return room.players.filter((player) => duel.readerIds.includes(player.id));
  }

  writersOfCurrentDuel(room: TestRoom): { A: TestPlayer; B: TestPlayer } {
    const game = this.entry(room).room.game;
    const duelId = game?.rounds[game.roundIndex]?.duelIds[game.duelIndex];
    const duel = duelId ? game?.duels.get(duelId) : undefined;
    if (!duel) throw new Error('no duel');
    const find = (id: string) => {
      const player = room.players.find((p) => p.id === id);
      if (!player) throw new Error('writer not found');
      return player;
    };
    return { A: find(duel.writerBySide.A), B: find(duel.writerBySide.B) };
  }

  /** Validates host and every player view against the strict schemas. */
  validateAllViews(room: TestRoom): void {
    this.hostView(room);
    for (const player of room.players) {
      if (this.entry(room).room.players.has(player.id)) this.playerView(room, player);
    }
  }
}

export function defaultPostText(player: { name: string }, n: number): string {
  return `${player.name} is humbled to announce milestone number ${n}. Grateful for the journey.`;
}

export interface WriteDecision {
  /** Saved as an unlocked draft (autosave). */
  draft?: string;
  /** Locked as the final post. */
  lock?: string;
}

export interface GameStrategy {
  write?(player: TestPlayer, assignment: AssignmentView, roundNumber: number): WriteDecision | null;
  guess?(player: TestPlayer, options: GuessOption[], duelNumber: number, roundNumber: number): string | null;
  endorse?(
    player: TestPlayer,
    available: Endorsement[],
    duelNumber: number,
    roundNumber: number,
  ): Endorsement | null;
}

export interface DuelRecord {
  roundNumber: number;
  duelNumber: number;
  multiplier: 1 | 2;
  writerA: string;
  writerB: string;
  forfeitA: boolean;
  forfeitB: boolean;
  readers: string[];
  correctOptionId: string;
  guesses: Map<string, string>;
  endorsements: Map<string, Endorsement>;
}

export const DEFAULT_STRATEGY: Required<GameStrategy> = {
  write: (player, assignment) => ({ lock: defaultPostText(player, assignment.presentationNumber) }),
  guess: (player, options, duelNumber, roundNumber) =>
    options[(Number(player.name.slice(1)) + duelNumber + roundNumber) % options.length]?.id ?? null,
  endorse: (player, available, duelNumber) => {
    const preferred = (['A', 'B', 'NEITHER'] as const)[(Number(player.name.slice(1)) + duelNumber) % 3] ?? 'NEITHER';
    return available.includes(preferred) ? preferred : 'NEITHER';
  },
};

/**
 * Plays a whole game through the public command API, validating every view at every phase.
 * Returns what each duel's ballots were so tests can recompute scores independently.
 */
export function playGame(
  h: EngineHarness,
  room: TestRoom,
  strategy: GameStrategy = DEFAULT_STRATEGY,
): { duels: DuelRecord[]; phases: Phase[] } {
  const duels: DuelRecord[] = [];
  const phases: Phase[] = [];
  let lastPhaseId = '';
  let guard = 0;
  while (h.phase(room) !== 'FINAL') {
    guard += 1;
    if (guard > 1000) throw new Error('game did not finish');
    const entry = h.entry(room);
    if (entry.room.phase.id !== lastPhaseId) {
      phases.push(entry.room.phase.name);
      lastPhaseId = entry.room.phase.id;
    }
    h.validateAllViews(room);
    const game = entry.room.game;
    if (!game) throw new Error('no game');
    const roundNumber = game.roundIndex + 1;
    const duelNumber = game.duelIndex + 1;
    switch (entry.room.phase.name) {
      case 'WRITING':
        for (const player of room.players) {
          const view = h.playerView(room, player);
          if (view.screen.kind !== 'WRITING') throw new Error('expected writing');
          for (const assignment of view.screen.assignments) {
            const decision = strategy.write?.(player, assignment, roundNumber) ?? null;
            if (!decision || h.phase(room) !== 'WRITING') continue;
            let revision = assignment.draftRevision;
            if (decision.draft !== undefined) {
              const ack = h.expectOk(
                h.send(room, player, 'writing.saveDraft', {
                  assignmentId: assignment.id,
                  text: decision.draft,
                  expectedDraftRevision: revision,
                }),
              );
              revision = (ack.ok && (ack.data as { draftRevision: number }).draftRevision) || revision;
            }
            if (decision.lock !== undefined) {
              h.expectOk(
                h.send(room, player, 'writing.lockPost', {
                  assignmentId: assignment.id,
                  text: decision.lock,
                  expectedDraftRevision: revision,
                }),
              );
            }
          }
        }
        if (h.phase(room) === 'WRITING') h.advanceToNextPhase(room);
        break;
      case 'DUEL_READ': {
        const duelId = game.rounds[game.roundIndex]?.duelIds[game.duelIndex];
        const duel = duelId ? game.duels.get(duelId) : undefined;
        if (!duel) throw new Error('no duel');
        const a = game.assignments.get(duel.assignmentBySide.A);
        const b = game.assignments.get(duel.assignmentBySide.B);
        duels.push({
          roundNumber,
          duelNumber,
          multiplier: game.rounds[game.roundIndex]?.multiplier ?? 1,
          writerA: duel.writerBySide.A,
          writerB: duel.writerBySide.B,
          forfeitA: a?.status === 'FORFEIT',
          forfeitB: b?.status === 'FORFEIT',
          readers: [...duel.readerIds],
          correctOptionId: duel.correctOptionId,
          guesses: new Map(),
          endorsements: new Map(),
        });
        h.advanceToNextPhase(room);
        break;
      }
      case 'DUEL_GUESS': {
        const record = duels.at(-1);
        for (const player of h.readersOfCurrentDuel(room)) {
          const view = h.playerView(room, player);
          if (view.screen.kind !== 'DUEL_GUESS') break;
          const optionId = strategy.guess?.(player, view.screen.options, duelNumber, roundNumber) ?? null;
          if (optionId === null) continue;
          h.expectOk(h.send(room, player, 'duel.lockGuess', { duelId: view.screen.duelId, optionId }));
          record?.guesses.set(player.id, optionId);
        }
        if (h.phase(room) === 'DUEL_GUESS') h.advanceToNextPhase(room);
        break;
      }
      case 'DUEL_ENDORSE': {
        const record = duels.at(-1);
        for (const player of h.readersOfCurrentDuel(room)) {
          const view = h.playerView(room, player);
          if (view.screen.kind !== 'DUEL_ENDORSE') break;
          const choice = strategy.endorse?.(player, view.screen.availableChoices, duelNumber, roundNumber) ?? null;
          if (choice === null) continue;
          h.expectOk(h.send(room, player, 'duel.lockEndorsement', { duelId: view.screen.duelId, choice }));
          record?.endorsements.set(player.id, choice);
        }
        if (h.phase(room) === 'DUEL_ENDORSE') h.advanceToNextPhase(room);
        break;
      }
      case 'DUEL_RESULT': {
        const duelId = game.rounds[game.roundIndex]?.duelIds[game.duelIndex];
        const duel = duelId ? game.duels.get(duelId) : undefined;
        // A double forfeit jumps straight to RESULT without a READ phase: record it here.
        if (duel && duels.at(-1)?.correctOptionId !== duel.correctOptionId) {
          duels.push({
            roundNumber,
            duelNumber,
            multiplier: game.rounds[game.roundIndex]?.multiplier ?? 1,
            writerA: duel.writerBySide.A,
            writerB: duel.writerBySide.B,
            forfeitA: true,
            forfeitB: true,
            readers: [...duel.readerIds],
            correctOptionId: duel.correctOptionId,
            guesses: new Map(),
            endorsements: new Map(),
          });
        }
        h.advanceToNextPhase(room);
        break;
      }
      default:
        h.advanceToNextPhase(room);
    }
  }
  phases.push('FINAL');
  h.validateAllViews(room);
  return { duels, phases };
}

/** Independent re-implementation of the scoring formula for verification. */
export function expectedScores(rosterIds: string[], duels: DuelRecord[]): Record<string, number> {
  const scores: Record<string, number> = Object.fromEntries(rosterIds.map((id) => [id, 0]));
  for (const duel of duels) {
    const votes = { A: 0, B: 0, NEITHER: 0 };
    for (const choice of duel.endorsements.values()) votes[choice] += 1;
    const ballots = votes.A + votes.B + votes.NEITHER;
    if (ballots > 0) {
      if (!duel.forfeitA) scores[duel.writerA] = (scores[duel.writerA] ?? 0) + Math.floor((1000 * duel.multiplier * votes.A) / ballots);
      if (!duel.forfeitB) scores[duel.writerB] = (scores[duel.writerB] ?? 0) + Math.floor((1000 * duel.multiplier * votes.B) / ballots);
    }
    for (const [readerId, optionId] of duel.guesses) {
      if (optionId === duel.correctOptionId) scores[readerId] = (scores[readerId] ?? 0) + 250 * duel.multiplier;
    }
  }
  return scores;
}
