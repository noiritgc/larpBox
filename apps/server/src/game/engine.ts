import { randomUUID } from 'node:crypto';
import {
  HOST_COMMANDS,
  MAX_PLAYERS,
  NAME_ISSUE_MESSAGES,
  PACK_LABELS,
  PHASE_TIMINGS_MS,
  POST_ISSUE_MESSAGES,
  PROTOCOL_VERSION,
  SIDES,
  checkName,
  checkPost,
  type Ack,
  type AckFailure,
  type AckSuccess,
  type AvatarId,
  type CloseReason,
  type CommandEnvelope,
  type CommandPayload,
  type CreateRoomResponse,
  type DraftAckData,
  type ErrorCode,
  type JoinRoomResponse,
  type PauseReason,
  type Phase,
  type RoomClosedPayload,
  type RoomPreview,
  type RoomSettings,
  type SocketAuth,
} from '@larpbox/shared';
import { headlineForSeat } from '../content/headlines.js';
import { promptsForPack, type PromptPack } from '../content/loadPrompts.js';
import type { Logger } from '../logger.js';
import { canonicalHash, generateToken, hashToken, tokenHashesEqual } from '../security/tokens.js';
import type { Clock, Scheduler, TimerHandle } from './clock.js';
import { createSeed, createSeededRandom } from './random.js';
import { RoomStore, randomRoomCode } from './roomStore.js';
import { buildSchedule, drawPrompts, planRounds } from './schedule.js';
import { countEndorsements, guessPoints, resultStamp, writerPoints } from './scoring.js';
import {
  activeElapsedMs,
  availableChoices,
  currentDuel,
  currentRound,
  duelAssignments,
  playersBySeat,
  requireGame,
  roundAssignments,
  startBlocker,
} from './state.js';
import type {
  Assignment,
  CachedAck,
  Duel,
  DuelResult,
  PhaseState,
  PlayerRecord,
  Room,
  RoomEntry,
  RoomRuntime,
  SessionRecord,
} from './types.js';

export const RESERVATION_MS = 60_000;
export const HTTP_RESPONSE_CACHE_MS = 2 * 60_000;
export const EXPIRED_REQUEST_MARKER_MS = 2 * 60_000;
export const REQUEST_CACHE_TTL_MS = 10 * 60_000;
export const REQUEST_CACHE_MAX = 256;
export const SWEEP_INTERVAL_MS = 5_000;

const HOST_COMMAND_SET = new Set<string>(HOST_COMMANDS);

export const CLOSE_MESSAGES: Record<CloseReason, string> = {
  HOST_ENDED: 'The host ended this room.',
  EXPIRED: 'This room has ended. Ask the host for a new code.',
  REMOVED: "You've been removed from this room.",
  LEFT: 'You left the room.',
  SERVER_SHUTDOWN: 'The server restarted, so this room has ended. Ask the host for a new code.',
};

export class GameError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extras: {
      fieldErrors?: Record<string, string>;
      retryAfterMs?: number;
      /** Send the caller a fresh private snapshot (e.g. after a revision conflict). */
      syncSession?: boolean;
    } = {},
  ) {
    super(message);
  }
}

export type Audience =
  | { kind: 'all' }
  | { kind: 'player'; playerId: string }
  | { kind: 'session'; sessionId: string };

const ALL: Audience = { kind: 'all' };

/** Transport hooks. The engine decides what changed; the transport projects and delivers. */
export interface Publisher {
  publish(entry: RoomEntry, audience: Audience): void;
  /** The room is ending: notify every connected session, then disconnect them. */
  roomClosed(entry: RoomEntry, payload: RoomClosedPayload): void;
  /** One session was revoked (kicked, left, dropped at rematch): notify and disconnect it. */
  sessionRevoked(entry: RoomEntry, session: SessionRecord, payload: RoomClosedPayload): void;
}

export const NULL_PUBLISHER: Publisher = {
  publish() {},
  roomClosed() {},
  sessionRevoked() {},
};

export interface EngineConfig {
  publicOrigin: string;
  maxRooms: number;
  roomMaxAgeMs: number;
  roomIdleMs: number;
  roomAbandonedMs: number;
  gameTimeScale: number;
}

export interface EngineOptions {
  config: EngineConfig;
  promptPack: PromptPack;
  clock: Clock;
  scheduler: Scheduler;
  logger: Logger;
  bootId: string;
  newId?: () => string;
  newSeed?: () => string;
  newToken?: () => string;
  randomCode?: () => string;
}

export interface CommandOutcome {
  ack: Ack;
  /** Runs after the transport delivered the ack (e.g. disconnecting a player who left). */
  after: (() => void) | null;
}

interface HandlerResult {
  audience: Audience | null;
  data?: unknown;
  after?: () => void;
}

interface CachedResponse<T> {
  bodyHash: string;
  response: T;
  expiresAt: number;
  roomId: string;
  playerId: string | null;
}

export interface AttachResult {
  generation: number;
  /** Socket that previously held this session and must now be disconnected. */
  replacedSocketId: string | null;
  /** The replaced socket belonged to the same live tab (transport reconnect), not a takeover. */
  replacedSameInstance: boolean;
}

/**
 * Authoritative game engine. Every mutation runs synchronously: validation and commit happen with
 * no await in between, so one room's commands, timers and connection events are serialized by the
 * event loop. Timer callbacks capture (roomId, gameId, phaseId) and become no-ops when stale.
 */
export class GameEngine {
  readonly store: RoomStore;
  readonly bootId: string;
  private publisher: Publisher = NULL_PUBLISHER;
  private readonly createCache = new Map<string, CachedResponse<CreateRoomResponse>>();
  private readonly joinCache = new Map<string, CachedResponse<JoinRoomResponse>>();
  private readonly expiredRequestIds = new Map<string, number>();
  private sweepTimer: TimerHandle | null = null;
  private readonly newId: () => string;
  private readonly newSeed: () => string;
  private readonly newToken: () => string;
  private readonly clock: Clock;
  private readonly scheduler: Scheduler;
  private readonly logger: Logger;
  private readonly config: EngineConfig;
  private readonly promptPack: PromptPack;

  constructor(options: EngineOptions) {
    this.clock = options.clock;
    this.scheduler = options.scheduler;
    this.logger = options.logger;
    this.config = options.config;
    this.promptPack = options.promptPack;
    this.bootId = options.bootId;
    this.newId = options.newId ?? randomUUID;
    this.newSeed = options.newSeed ?? createSeed;
    this.newToken = options.newToken ?? generateToken;
    this.store = new RoomStore(options.clock, options.randomCode ?? randomRoomCode);
  }

  setPublisher(publisher: Publisher): void {
    this.publisher = publisher;
  }

  get timeScale(): number {
    return this.config.gameTimeScale;
  }

  /** Scales a spec duration by GAME_TIME_SCALE (1 outside tests). */
  scaled(ms: number): number {
    return Math.max(1, Math.round(ms * this.config.gameTimeScale));
  }

  joinUrl(code: string): string {
    return `${this.config.publicOrigin}/join/${code}`;
  }

  // -------------------------------------------------------------------------------------------
  // HTTP bootstrap: create, preview, join

  createRoom(requestId: string, settings: RoomSettings): CreateRoomResponse {
    const now = this.clock.nowMonotonicMs();
    this.purgeHttpCaches(now);
    const bodyHash = canonicalHash({ settings });
    const cached = this.createCache.get(requestId);
    if (cached) {
      if (cached.bodyHash !== bodyHash) {
        throw new GameError('REQUEST_CONFLICT', 'That request was already used with different settings.');
      }
      return cached.response;
    }
    if (this.expiredRequestIds.has(requestId)) {
      throw new GameError('REQUEST_EXPIRED', 'That request expired. Create the room again.');
    }
    if (this.store.size >= this.config.maxRooms) {
      throw new GameError('ROOM_CAPACITY', 'Every room is busy right now. Try again in a few minutes.');
    }
    const code = this.store.generateCode();
    if (!code) throw new GameError('ROOM_CAPACITY', 'No room codes are free right now. Try again shortly.');

    const hostToken = this.newToken();
    const room: Room = {
      id: this.newId(),
      code,
      revision: 1,
      createdAt: now,
      lastHumanActivityAt: now,
      allDisconnectedSince: now,
      hostDisconnectedSince: null,
      settings: { ...settings },
      settingsChanged: false,
      phase: this.newPhaseState('LOBBY', null),
      players: new Map(),
      sessions: new Map(),
      game: null,
      usedPromptIds: new Set(),
    };
    const hostSession = this.newSession('host', null, hostToken);
    room.sessions.set(hostSession.id, hostSession);
    this.store.add({ room, runtime: this.newRuntime(now) });

    const response: CreateRoomResponse = {
      roomId: room.id,
      roomCode: code,
      hostToken,
      joinUrl: this.joinUrl(code),
      bootId: this.bootId,
    };
    this.createCache.set(requestId, {
      bodyHash,
      response,
      expiresAt: now + HTTP_RESPONSE_CACHE_MS,
      roomId: room.id,
      playerId: null,
    });
    this.logger.info({ roomId: room.id, rooms: this.store.size }, 'room.created');
    return response;
  }

  previewRoom(code: string): RoomPreview {
    const entry = this.requireRoomByCode(code);
    const phase = entry.room.phase.name;
    const state = phase === 'LOBBY' ? 'LOBBY' : phase === 'FINAL' ? 'FINAL' : 'PLAYING';
    const playerCount = entry.room.players.size;
    return {
      roomCode: entry.room.code,
      state,
      playerCount,
      maxPlayers: MAX_PLAYERS,
      canJoin: state === 'LOBBY' && playerCount < MAX_PLAYERS,
    };
  }

  joinRoom(
    code: string,
    input: { requestId: string; name: string; avatarId: AvatarId },
  ): JoinRoomResponse {
    const now = this.clock.nowMonotonicMs();
    this.purgeHttpCaches(now);
    const bodyHash = canonicalHash({ code, name: input.name, avatarId: input.avatarId });
    const cached = this.joinCache.get(input.requestId);
    if (cached) {
      if (cached.bodyHash !== bodyHash) {
        throw new GameError('REQUEST_CONFLICT', 'That request was already used with different details.');
      }
      return cached.response;
    }
    if (this.expiredRequestIds.has(input.requestId)) {
      throw new GameError('REQUEST_EXPIRED', 'That join attempt expired. Join again.');
    }
    const entry = this.requireRoomByCode(code);
    const { room } = entry;
    if (room.phase.name !== 'LOBBY') {
      throw new GameError('GAME_STARTED', 'This game has already started. Join the next one.');
    }
    if (room.players.size >= MAX_PLAYERS) {
      throw new GameError('ROOM_FULL', 'This room is full. Games have up to eight players.');
    }
    const name = checkName(input.name);
    const nameIssue = name.issues[0];
    if (nameIssue) {
      const message = NAME_ISSUE_MESSAGES[nameIssue];
      throw new GameError('BAD_INPUT', message, { fieldErrors: { name: message } });
    }
    for (const other of room.players.values()) {
      if (other.normalizedName === name.key) {
        const message = "That name's taken in this room. Try another.";
        throw new GameError('NAME_TAKEN', message, { fieldErrors: { name: message } });
      }
    }
    const taken = new Set([...room.players.values()].map((player) => player.seat));
    let seat = 0;
    while (taken.has(seat)) seat += 1;

    const epoch = this.clock.nowEpochMs();
    const player: PlayerRecord = {
      id: this.newId(),
      name: name.name,
      normalizedName: name.key,
      avatarId: input.avatarId,
      seat,
      headline: headlineForSeat(seat),
      ready: false,
      connected: false,
      everConnected: false,
      lastSeenAt: epoch,
      joinedAt: epoch,
      score: 0,
    };
    const token = this.newToken();
    const session = this.newSession('player', player.id, token);
    room.players.set(player.id, player);
    room.sessions.set(session.id, session);
    const roomId = room.id;
    entry.runtime.reservationTimers.set(
      player.id,
      this.scheduler.schedule(RESERVATION_MS, () => this.expireReservation(roomId, player.id)),
    );
    room.lastHumanActivityAt = now;
    room.revision += 1;

    const response: JoinRoomResponse = {
      roomId: room.id,
      roomCode: room.code,
      playerId: player.id,
      playerToken: token,
      bootId: this.bootId,
    };
    this.joinCache.set(input.requestId, {
      bodyHash,
      response,
      expiresAt: now + HTTP_RESPONSE_CACHE_MS,
      roomId: room.id,
      playerId: player.id,
    });
    this.logger.info({ roomId: room.id, seat, players: room.players.size }, 'player.joined');
    this.publisher.publish(entry, ALL);
    return response;
  }

  private expireReservation(roomId: string, playerId: string): void {
    const entry = this.store.get(roomId);
    const player = entry?.room.players.get(playerId);
    if (!entry || !player || player.everConnected) return;
    this.removePlayerRecord(entry, playerId, null);
    entry.room.revision += 1;
    this.logger.info({ roomId }, 'player.reservation_expired');
    this.publisher.publish(entry, ALL);
  }

  // -------------------------------------------------------------------------------------------
  // Socket sessions

  /** The live session behind a socket, or null once the room ended or the session was revoked. */
  sessionFor(roomId: string, sessionId: string): { entry: RoomEntry; session: SessionRecord } | null {
    const entry = this.store.get(roomId);
    const session = entry?.room.sessions.get(sessionId);
    if (!entry || !session || session.revoked) return null;
    return { entry, session };
  }

  authenticate(auth: SocketAuth): { entry: RoomEntry; session: SessionRecord } {
    if (auth.protocolVersion !== PROTOCOL_VERSION) {
      throw new GameError('PROTOCOL_MISMATCH', 'This page is out of date. Reload to continue.');
    }
    const entry = this.requireRoomByCode(auth.roomCode);
    const candidate = hashToken(auth.token);
    let found: SessionRecord | null = null;
    for (const session of entry.room.sessions.values()) {
      if (tokenHashesEqual(session.tokenHash, candidate)) found = session;
    }
    if (!found || found.revoked) {
      throw new GameError('UNAUTHORIZED', 'This browser is not part of that room.');
    }
    if (found.role !== auth.role) {
      throw new GameError('FORBIDDEN', 'That credential cannot be used here.');
    }
    return { entry, session: found };
  }

  /** Read-only check used before a socket finishes connecting. */
  checkSessionAvailable(
    session: SessionRecord,
    clientInstanceId: string,
    takeover: boolean,
    isSocketLive: (socketId: string) => boolean,
  ): void {
    if (
      session.activeSocketId &&
      isSocketLive(session.activeSocketId) &&
      session.activeClientInstanceId !== clientInstanceId &&
      !takeover
    ) {
      throw new GameError('SESSION_IN_USE', 'This player is active in another tab.');
    }
  }

  /**
   * One active socket per session. The same live tab may replace its own stale transport; a
   * different tab needs an explicit takeover. Every attach bumps the connection generation so a
   * late disconnect from a replaced socket cannot mark the new connection offline.
   */
  attach(input: {
    roomId: string;
    sessionId: string;
    socketId: string;
    clientInstanceId: string;
    takeover: boolean;
    isSocketLive: (socketId: string) => boolean;
  }): AttachResult {
    const entry = this.store.get(input.roomId);
    if (!entry) throw new GameError('ROOM_ENDED', CLOSE_MESSAGES.EXPIRED);
    const { room } = entry;
    const session = room.sessions.get(input.sessionId);
    if (!session || session.revoked) throw new GameError('UNAUTHORIZED', 'This browser is not part of that room.');
    this.checkSessionAvailable(session, input.clientInstanceId, input.takeover, input.isSocketLive);

    let replacedSocketId: string | null = null;
    let replacedSameInstance = false;
    if (session.activeSocketId && session.activeSocketId !== input.socketId && input.isSocketLive(session.activeSocketId)) {
      replacedSocketId = session.activeSocketId;
      replacedSameInstance = session.activeClientInstanceId === input.clientInstanceId;
    }
    session.connectionGeneration += 1;
    session.activeSocketId = input.socketId;
    session.activeClientInstanceId = input.clientInstanceId;

    if (session.role === 'player' && session.playerId) {
      const player = room.players.get(session.playerId);
      if (player) {
        player.connected = true;
        player.everConnected = true;
        player.lastSeenAt = this.clock.nowEpochMs();
      }
      entry.runtime.reservationTimers.get(session.playerId)?.cancel();
      entry.runtime.reservationTimers.delete(session.playerId);
    } else {
      room.hostDisconnectedSince = null;
      // The host is back, but play stays paused until the operator presses Resume.
      if (room.phase.pause?.reason === 'HOST_DISCONNECTED') room.phase.pause.reason = 'HOST_PAUSED';
    }
    room.allDisconnectedSince = null;
    room.revision += 1;
    this.logger.info(
      {
        roomId: room.id,
        role: session.role,
        generation: session.connectionGeneration,
        takeover: replacedSocketId !== null && !replacedSameInstance,
      },
      session.connectionGeneration > 1 ? 'session.reconnected' : 'session.connected',
    );
    this.publisher.publish(entry, ALL);
    return { generation: session.connectionGeneration, replacedSocketId, replacedSameInstance };
  }

  detach(roomId: string, sessionId: string, socketId: string, generation: number): void {
    const entry = this.store.get(roomId);
    const session = entry?.room.sessions.get(sessionId);
    if (!entry || !session) return;
    // A replaced socket's late disconnect must not mark the current connection offline.
    if (session.activeSocketId !== socketId || session.connectionGeneration !== generation) return;
    session.activeSocketId = null;
    session.activeClientInstanceId = null;
    const { room } = entry;
    const now = this.clock.nowMonotonicMs();
    if (session.role === 'player' && session.playerId) {
      const player = room.players.get(session.playerId);
      if (player) {
        player.connected = false;
        player.lastSeenAt = this.clock.nowEpochMs();
      }
    } else {
      room.hostDisconnectedSince = now;
      this.advanceIfOverdue(entry);
      this.pauseInternal(entry, 'HOST_DISCONNECTED');
    }
    if (![...room.sessions.values()].some((s) => s.activeSocketId !== null)) {
      room.allDisconnectedSince = now;
    }
    room.revision += 1;
    this.logger.info({ roomId: room.id, role: session.role }, 'session.disconnected');
    this.publisher.publish(entry, ALL);
  }

  // -------------------------------------------------------------------------------------------
  // Commands

  executeCommand(roomId: string, sessionId: string, envelope: CommandEnvelope): CommandOutcome {
    const { requestId } = envelope;
    const entry = this.store.get(roomId);
    if (!entry) return { ack: failure(requestId, 'ROOM_ENDED', CLOSE_MESSAGES.EXPIRED), after: null };
    const { room } = entry;
    const session = room.sessions.get(sessionId);
    if (!session || session.revoked) {
      return { ack: failure(requestId, 'UNAUTHORIZED', 'This browser is not part of that room.'), after: null };
    }

    const now = this.clock.nowMonotonicMs();
    this.purgeRequestCache(session, now);
    const hash = canonicalHash({
      type: envelope.type,
      phaseId: envelope.phaseId,
      gameId: envelope.gameId,
      payload: envelope.payload,
    });
    const cached = session.requests.get(requestId);
    if (cached) {
      if (cached.hash === hash) return { ack: cached.ack, after: null };
      this.logger.warn({ roomId, type: envelope.type }, 'command.request_conflict');
      return {
        ack: failure(requestId, 'REQUEST_CONFLICT', 'That request ID was already used for a different action.'),
        after: null,
      };
    }

    const hostCommand = HOST_COMMAND_SET.has(envelope.type);
    if (hostCommand !== (session.role === 'host')) {
      this.logger.info({ roomId, type: envelope.type, code: 'FORBIDDEN' }, 'command.rejected');
      return {
        ack: failure(
          requestId,
          'FORBIDDEN',
          hostCommand ? 'Only the host display can do that.' : 'The host display cannot play. Join on a phone.',
        ),
        after: null,
      };
    }

    const advancedFrom = this.advanceIfOverdue(entry);
    if (envelope.gameId !== (room.game?.id ?? null) || envelope.phaseId !== room.phase.id) {
      if (!advancedFrom) this.publisher.publish(entry, { kind: 'session', sessionId });
      const code: ErrorCode = advancedFrom === envelope.phaseId ? 'DEADLINE_PASSED' : 'PHASE_CHANGED';
      this.logger.info({ roomId, type: envelope.type, code }, 'command.rejected');
      return {
        ack: failure(
          requestId,
          code,
          code === 'DEADLINE_PASSED' ? 'Time ran out for that.' : 'The game moved on. Refreshing.',
        ),
        after: null,
      };
    }

    let result: HandlerResult;
    try {
      result = this.dispatch(entry, session, envelope);
    } catch (error) {
      if (!(error instanceof GameError)) throw error;
      if (error.extras.syncSession) this.publisher.publish(entry, { kind: 'session', sessionId });
      this.logger.info({ roomId, type: envelope.type, code: error.code }, 'command.rejected');
      return { ack: failure(requestId, error.code, error.message, error.extras), after: null };
    }

    room.revision += 1;
    room.lastHumanActivityAt = now;
    const ack: AckSuccess = {
      ok: true,
      requestId,
      revision: room.revision,
      serverNow: this.clock.nowEpochMs(),
    };
    if (result.data !== undefined) ack.data = result.data;
    this.cacheAck(session, requestId, hash, ack, now);
    if (result.audience && this.store.get(roomId)) this.publisher.publish(entry, result.audience);
    return { ack, after: result.after ?? null };
  }

  private dispatch(entry: RoomEntry, session: SessionRecord, envelope: CommandEnvelope): HandlerResult {
    switch (envelope.type) {
      case 'player.setReady':
        return this.cmdSetReady(entry, session, envelope.payload);
      case 'player.leave':
        return this.cmdLeave(entry, session);
      case 'host.updateSettings':
        return this.cmdUpdateSettings(entry, envelope.payload);
      case 'host.removePlayer':
        return this.cmdRemovePlayer(entry, envelope.payload);
      case 'host.startGame':
        return this.cmdStartGame(entry);
      case 'host.skipRules':
        return this.cmdSkipRules(entry);
      case 'writing.saveDraft':
        return this.cmdSaveDraft(entry, session, envelope.payload);
      case 'writing.lockPost':
        return this.cmdLockPost(entry, session, envelope.payload);
      case 'duel.lockGuess':
        return this.cmdLockGuess(entry, session, envelope.payload);
      case 'duel.lockEndorsement':
        return this.cmdLockEndorsement(entry, session, envelope.payload);
      case 'host.pause':
        return this.cmdPause(entry);
      case 'host.resume':
        return this.cmdResume(entry);
      case 'host.extendWriting':
        return this.cmdExtendWriting(entry);
      case 'host.returnToLobby':
        return this.cmdReturnToLobby(entry);
      case 'host.closeRoom':
        return this.cmdCloseRoom(entry);
    }
  }

  private cmdSetReady(
    entry: RoomEntry,
    session: SessionRecord,
    payload: CommandPayload<'player.setReady'>,
  ): HandlerResult {
    this.requirePhase(entry.room, 'LOBBY');
    const player = this.requirePlayer(entry.room, session);
    player.ready = payload.ready;
    return { audience: ALL };
  }

  private cmdLeave(entry: RoomEntry, session: SessionRecord): HandlerResult {
    this.requirePhase(entry.room, 'LOBBY');
    const player = this.requirePlayer(entry.room, session);
    this.removePlayerRecord(entry, player.id, null);
    this.logger.info({ roomId: entry.room.id }, 'player.left');
    return {
      audience: ALL,
      after: () =>
        this.publisher.sessionRevoked(entry, session, { reason: 'LEFT', message: CLOSE_MESSAGES.LEFT }),
    };
  }

  private cmdUpdateSettings(
    entry: RoomEntry,
    payload: CommandPayload<'host.updateSettings'>,
  ): HandlerResult {
    const { room } = entry;
    this.requirePhase(room, 'LOBBY');
    room.settings = { ...payload.settings };
    for (const player of room.players.values()) player.ready = false;
    room.settingsChanged = true;
    return { audience: ALL };
  }

  private cmdRemovePlayer(
    entry: RoomEntry,
    payload: CommandPayload<'host.removePlayer'>,
  ): HandlerResult {
    this.requirePhase(entry.room, 'LOBBY');
    if (!entry.room.players.has(payload.playerId)) {
      throw new GameError('BAD_INPUT', 'That player is not in this room.');
    }
    this.removePlayerRecord(entry, payload.playerId, {
      reason: 'REMOVED',
      message: CLOSE_MESSAGES.REMOVED,
    });
    this.logger.info({ roomId: entry.room.id }, 'player.removed');
    return { audience: ALL };
  }

  private cmdStartGame(entry: RoomEntry): HandlerResult {
    const { room } = entry;
    this.requirePhase(room, 'LOBBY');
    const blocker = startBlocker(room);
    if (blocker) throw new GameError('FORBIDDEN', blocker.message);

    const rosterIds = playersBySeat(room).map((player) => player.id);
    const needed = rosterIds.length * room.settings.roundCount;
    const packPrompts = promptsForPack(this.promptPack, room.settings.pack);
    if (packPrompts.length < needed) {
      throw new GameError(
        'CONFIG_INVALID',
        `The ${PACK_LABELS[room.settings.pack]} pack has ${packPrompts.length} events; this game needs ${needed}. Choose Mixed or Quick.`,
      );
    }

    const seed = this.newSeed();
    const rng = createSeededRandom(seed);
    const plans = planRounds(rosterIds, room.settings.roundCount, rng);
    const drawn = drawPrompts({ packPrompts, usedPromptIds: room.usedPromptIds, needed, rng });
    if (!drawn) throw new Error('unreachable: prompt count was checked above');
    const built = buildSchedule({ rosterIds, plans, prompts: drawn.prompts, rng, newId: this.newId });

    room.game = {
      id: this.newId(),
      seed,
      rosterIds,
      rounds: built.rounds,
      assignments: built.assignments,
      duels: built.duels,
      roundIndex: 0,
      duelIndex: 0,
    };
    room.settingsChanged = false;
    this.enterPhase(entry, 'RULES', this.scaled(PHASE_TIMINGS_MS.rules));
    this.logger.info(
      {
        roomId: room.id,
        players: rosterIds.length,
        rounds: room.settings.roundCount,
        repeatedPairings: built.rounds.map((round) => round.repeatedPairings),
        promptsReset: drawn.resetUsed,
      },
      'game.started',
    );
    return { audience: ALL };
  }

  private cmdSkipRules(entry: RoomEntry): HandlerResult {
    this.requirePhase(entry.room, 'RULES');
    this.requireUnpaused(entry.room);
    const elapsed = activeElapsedMs(entry, this.clock.nowMonotonicMs());
    if (elapsed < this.scaled(PHASE_TIMINGS_MS.rulesSkipAfter)) {
      throw new GameError('FORBIDDEN', 'Skipping unlocks after five seconds.');
    }
    this.completePhase(entry);
    return { audience: ALL };
  }

  private cmdSaveDraft(
    entry: RoomEntry,
    session: SessionRecord,
    payload: CommandPayload<'writing.saveDraft'>,
  ): HandlerResult {
    const { room } = entry;
    this.requirePhase(room, 'WRITING');
    this.requireUnpaused(room);
    const player = this.requirePlayer(room, session);
    const assignment = this.requireOwnAssignment(room, player.id, payload.assignmentId);
    if (assignment.status !== 'DRAFT') {
      throw new GameError('ALREADY_LOCKED', 'This post is already locked.', { syncSession: true });
    }
    if (payload.expectedDraftRevision !== assignment.draftRevision) {
      throw new GameError('REVISION_CONFLICT', 'Your draft changed on the server. Syncing.', {
        syncSession: true,
      });
    }
    const check = checkPost(payload.text);
    if (!check.okForDraft) {
      const message = POST_ISSUE_MESSAGES[check.issues[0] ?? 'TOO_LONG'];
      throw new GameError('BAD_INPUT', message, { fieldErrors: { text: message } });
    }
    assignment.draftText = check.text;
    assignment.draftRevision += 1;
    const data: DraftAckData = {
      assignmentId: assignment.id,
      draftRevision: assignment.draftRevision,
      status: 'DRAFT',
    };
    return { audience: { kind: 'player', playerId: player.id }, data };
  }

  private cmdLockPost(
    entry: RoomEntry,
    session: SessionRecord,
    payload: CommandPayload<'writing.lockPost'>,
  ): HandlerResult {
    const { room } = entry;
    this.requirePhase(room, 'WRITING');
    this.requireUnpaused(room);
    const player = this.requirePlayer(room, session);
    const assignment = this.requireOwnAssignment(room, player.id, payload.assignmentId);
    if (assignment.status !== 'DRAFT') {
      throw new GameError('ALREADY_LOCKED', 'This post is already locked.', { syncSession: true });
    }
    if (payload.expectedDraftRevision !== assignment.draftRevision) {
      throw new GameError('REVISION_CONFLICT', 'Your draft changed on the server. Syncing.', {
        syncSession: true,
      });
    }
    const check = checkPost(payload.text);
    if (!check.okForLock) {
      const message = POST_ISSUE_MESSAGES[check.issues[0] ?? 'TOO_SHORT'];
      throw new GameError('BAD_INPUT', message, { fieldErrors: { text: message } });
    }
    assignment.draftText = check.text;
    assignment.finalText = check.text;
    assignment.draftRevision += 1;
    assignment.status = 'LOCKED';
    assignment.lockedAt = this.clock.nowEpochMs();
    const data: DraftAckData = {
      assignmentId: assignment.id,
      draftRevision: assignment.draftRevision,
      status: 'LOCKED',
    };
    this.checkEarlyCompletion(entry);
    return { audience: ALL, data };
  }

  private cmdLockGuess(
    entry: RoomEntry,
    session: SessionRecord,
    payload: CommandPayload<'duel.lockGuess'>,
  ): HandlerResult {
    const { room } = entry;
    this.requirePhase(room, 'DUEL_GUESS');
    this.requireUnpaused(room);
    const player = this.requirePlayer(room, session);
    const duel = this.requireCurrentDuel(room, payload.duelId);
    if (!duel.readerIds.includes(player.id)) {
      throw new GameError('FORBIDDEN', 'You already know this one. Writers sit it out.');
    }
    if (duel.guesses.has(player.id)) {
      throw new GameError('ALREADY_LOCKED', 'Your guess is already locked.', { syncSession: true });
    }
    if (!duel.options.some((option) => option.id === payload.optionId)) {
      throw new GameError('CHOICE_UNAVAILABLE', 'That choice is not available.', { syncSession: true });
    }
    duel.guesses.set(player.id, payload.optionId);
    this.checkEarlyCompletion(entry);
    return { audience: ALL };
  }

  private cmdLockEndorsement(
    entry: RoomEntry,
    session: SessionRecord,
    payload: CommandPayload<'duel.lockEndorsement'>,
  ): HandlerResult {
    const { room } = entry;
    this.requirePhase(room, 'DUEL_ENDORSE');
    this.requireUnpaused(room);
    const player = this.requirePlayer(room, session);
    const duel = this.requireCurrentDuel(room, payload.duelId);
    if (!duel.readerIds.includes(player.id)) {
      throw new GameError('FORBIDDEN', 'Writers cannot endorse their own post-off.');
    }
    if (duel.endorsements.has(player.id)) {
      throw new GameError('ALREADY_LOCKED', 'Your endorsement is already recorded.', { syncSession: true });
    }
    if (!availableChoices(requireGame(room), duel).includes(payload.choice)) {
      throw new GameError('CHOICE_UNAVAILABLE', 'That post was not submitted, so it cannot be endorsed.', {
        syncSession: true,
      });
    }
    duel.endorsements.set(player.id, payload.choice);
    this.checkEarlyCompletion(entry);
    return { audience: ALL };
  }

  private cmdPause(entry: RoomEntry): HandlerResult {
    if (entry.room.phase.durationMs === null) {
      throw new GameError('FORBIDDEN', 'Nothing is running to pause.');
    }
    this.pauseInternal(entry, 'HOST_PAUSED');
    return { audience: ALL };
  }

  private cmdResume(entry: RoomEntry): HandlerResult {
    this.resumeInternal(entry);
    return { audience: ALL };
  }

  private cmdExtendWriting(entry: RoomEntry): HandlerResult {
    const { room, runtime } = entry;
    this.requirePhase(room, 'WRITING');
    this.requireUnpaused(room);
    if (room.phase.writeExtensionUsed) {
      throw new GameError('FORBIDDEN', 'Writing time was already extended once this round.');
    }
    if (runtime.deadlineMono === null || room.phase.durationMs === null || room.phase.deadlineAt === null) {
      throw new Error('unreachable: writing phase without a deadline');
    }
    const extension = this.scaled(PHASE_TIMINGS_MS.writingExtension);
    runtime.deadlineMono += extension;
    room.phase.durationMs += extension;
    room.phase.deadlineAt += extension;
    room.phase.writeExtensionUsed = true;
    this.scheduleDeadline(entry);
    return { audience: ALL };
  }

  private cmdReturnToLobby(entry: RoomEntry): HandlerResult {
    const { room } = entry;
    this.requirePhase(room, 'FINAL');
    for (const player of [...room.players.values()]) {
      if (!player.connected) {
        this.removePlayerRecord(entry, player.id, {
          reason: 'REMOVED',
          message: 'The host started a new game while you were away.',
        });
      } else {
        player.score = 0;
        player.ready = false;
      }
    }
    room.game = null;
    room.settingsChanged = false;
    this.enterPhase(entry, 'LOBBY', null);
    this.logger.info({ roomId: room.id, players: room.players.size }, 'room.rematch');
    return { audience: ALL };
  }

  private cmdCloseRoom(entry: RoomEntry): HandlerResult {
    const roomId = entry.room.id;
    return { audience: null, after: () => this.closeRoom(roomId, 'HOST_ENDED') };
  }

  // -------------------------------------------------------------------------------------------
  // Phase machine and timers

  private newPhaseState(name: Phase, durationMs: number | null): PhaseState {
    const epoch = this.clock.nowEpochMs();
    return {
      name,
      id: this.newId(),
      startedAt: epoch,
      deadlineAt: durationMs === null ? null : epoch + durationMs,
      durationMs,
      elapsedBeforePauseMs: 0,
      pause: null,
      writeExtensionUsed: false,
    };
  }

  private newRuntime(nowMono: number): RoomRuntime {
    return {
      phaseTimer: null,
      earlyTimer: null,
      segmentStartMono: nowMono,
      deadlineMono: null,
      pausedAtMono: null,
      reservationTimers: new Map(),
    };
  }

  private newSession(role: 'host' | 'player', playerId: string | null, token: string): SessionRecord {
    return {
      id: this.newId(),
      role,
      playerId,
      tokenHash: hashToken(token),
      revoked: false,
      activeSocketId: null,
      activeClientInstanceId: null,
      connectionGeneration: 0,
      requests: new Map(),
    };
  }

  private enterPhase(entry: RoomEntry, name: Phase, durationMs: number | null): void {
    const { room, runtime } = entry;
    this.clearPhaseTimers(entry);
    room.phase = this.newPhaseState(name, durationMs);
    const now = this.clock.nowMonotonicMs();
    runtime.segmentStartMono = now;
    runtime.deadlineMono = durationMs === null ? null : now + durationMs;
    runtime.pausedAtMono = null;
    if (durationMs !== null) this.scheduleDeadline(entry);
    this.logger.info(
      {
        roomId: room.id,
        phase: name,
        round: room.game ? room.game.roundIndex + 1 : null,
        duel: room.game && name.startsWith('DUEL_') ? room.game.duelIndex + 1 : null,
      },
      'phase.changed',
    );
  }

  private clearPhaseTimers(entry: RoomEntry): void {
    entry.runtime.phaseTimer?.cancel();
    entry.runtime.phaseTimer = null;
    entry.runtime.earlyTimer?.cancel();
    entry.runtime.earlyTimer = null;
  }

  private scheduleDeadline(entry: RoomEntry): void {
    const { room, runtime } = entry;
    runtime.phaseTimer?.cancel();
    runtime.phaseTimer = null;
    if (runtime.deadlineMono === null) return;
    const roomId = room.id;
    const gameId = room.game?.id ?? null;
    const phaseId = room.phase.id;
    const delay = runtime.deadlineMono - this.clock.nowMonotonicMs();
    runtime.phaseTimer = this.scheduler.schedule(Math.max(0, delay), () =>
      this.onPhaseTimer(roomId, gameId, phaseId),
    );
  }

  private isCurrent(entry: RoomEntry, gameId: string | null, phaseId: string): boolean {
    return (entry.room.game?.id ?? null) === gameId && entry.room.phase.id === phaseId;
  }

  private onPhaseTimer(roomId: string, gameId: string | null, phaseId: string): void {
    const entry = this.store.get(roomId);
    if (!entry || !this.isCurrent(entry, gameId, phaseId) || entry.room.phase.pause) return;
    const deadline = entry.runtime.deadlineMono;
    if (deadline === null) return;
    if (this.clock.nowMonotonicMs() < deadline) {
      this.scheduleDeadline(entry);
      return;
    }
    this.completePhase(entry);
    entry.room.revision += 1;
    this.publisher.publish(entry, ALL);
  }

  private onEarlyTimer(roomId: string, gameId: string | null, phaseId: string): void {
    const entry = this.store.get(roomId);
    if (!entry || !this.isCurrent(entry, gameId, phaseId) || entry.room.phase.pause) return;
    entry.runtime.earlyTimer = null;
    if (this.checkEarlyCompletion(entry)) {
      entry.room.revision += 1;
      this.publisher.publish(entry, ALL);
    }
  }

  /**
   * Called before any input: if the unpaused phase's deadline has passed (at equality too), finish
   * it now. Returns the ID of the phase that ended, or null.
   */
  advanceIfOverdue(entry: RoomEntry): string | null {
    const { room, runtime } = entry;
    if (room.phase.pause || runtime.deadlineMono === null) return null;
    if (this.clock.nowMonotonicMs() < runtime.deadlineMono) return null;
    const previous = room.phase.id;
    this.completePhase(entry);
    room.revision += 1;
    this.publisher.publish(entry, ALL);
    return previous;
  }

  /**
   * Ends GUESS/ENDORSE early once every eligible reader locked, but never before the minimum
   * active display time (5s / 8s); WRITING ends as soon as all 2N assignments are locked.
   * Returns true when the phase changed.
   */
  private checkEarlyCompletion(entry: RoomEntry): boolean {
    const { room, runtime } = entry;
    if (room.phase.pause || !room.game) return false;
    const game = room.game;
    if (room.phase.name === 'WRITING') {
      if (roundAssignments(game, game.roundIndex).every((a) => a.status === 'LOCKED')) {
        this.completePhase(entry);
        return true;
      }
      return false;
    }
    if (room.phase.name !== 'DUEL_GUESS' && room.phase.name !== 'DUEL_ENDORSE') return false;
    const duel = currentDuel(game);
    const locked = room.phase.name === 'DUEL_GUESS' ? duel.guesses : duel.endorsements;
    if (!duel.readerIds.every((id) => locked.has(id))) return false;
    const minimum = this.scaled(
      room.phase.name === 'DUEL_GUESS' ? PHASE_TIMINGS_MS.guessMinimum : PHASE_TIMINGS_MS.endorseMinimum,
    );
    const elapsed = activeElapsedMs(entry, this.clock.nowMonotonicMs());
    if (elapsed >= minimum) {
      this.completePhase(entry);
      return true;
    }
    runtime.earlyTimer?.cancel();
    const roomId = room.id;
    const gameId = game.id;
    const phaseId = room.phase.id;
    runtime.earlyTimer = this.scheduler.schedule(minimum - elapsed, () =>
      this.onEarlyTimer(roomId, gameId, phaseId),
    );
    return false;
  }

  private completePhase(entry: RoomEntry): void {
    const { room } = entry;
    const name = room.phase.name;
    if (name === 'LOBBY' || name === 'FINAL' || name === 'CLOSED') {
      throw new Error(`completePhase called in untimed phase ${name}`);
    }
    const game = requireGame(room);
    switch (name) {
      case 'RULES':
        this.enterRoundIntro(entry, 0);
        return;
      case 'ROUND_INTRO':
        this.enterPhase(entry, 'WRITING', this.scaled(room.settings.writingSeconds * 1000));
        return;
      case 'WRITING':
        this.finalizeWriting(entry);
        this.startDuel(entry, 0);
        return;
      case 'DUEL_READ':
        this.enterPhase(entry, 'DUEL_GUESS', this.scaled(room.settings.guessSeconds * 1000));
        return;
      case 'DUEL_GUESS':
        this.enterPhase(entry, 'DUEL_ENDORSE', this.scaled(room.settings.endorseSeconds * 1000));
        return;
      case 'DUEL_ENDORSE':
        this.settleDuel(entry, currentDuel(game));
        this.enterPhase(entry, 'DUEL_RESULT', this.scaled(PHASE_TIMINGS_MS.duelResult));
        return;
      case 'DUEL_RESULT': {
        const round = currentRound(game);
        if (game.duelIndex + 1 < round.duelIds.length) {
          this.startDuel(entry, game.duelIndex + 1);
        } else if (game.roundIndex + 1 < game.rounds.length) {
          this.enterPhase(entry, 'ROUND_SCOREBOARD', this.scaled(PHASE_TIMINGS_MS.roundScoreboard));
        } else {
          this.enterPhase(entry, 'FINAL', null);
          this.logger.info({ roomId: room.id }, 'game.finished');
        }
        return;
      }
      case 'ROUND_SCOREBOARD':
        this.enterRoundIntro(entry, game.roundIndex + 1);
        return;
    }
  }

  private enterRoundIntro(entry: RoomEntry, roundIndex: number): void {
    const { room } = entry;
    const game = requireGame(room);
    game.roundIndex = roundIndex;
    game.duelIndex = 0;
    const round = currentRound(game);
    round.scoreAtStart = {};
    for (const id of game.rosterIds) round.scoreAtStart[id] = room.players.get(id)?.score ?? 0;
    this.enterPhase(entry, 'ROUND_INTRO', this.scaled(PHASE_TIMINGS_MS.roundIntro));
  }

  /** Deadline finalization: saved valid drafts are submitted; empty/invalid drafts forfeit. */
  private finalizeWriting(entry: RoomEntry): void {
    const game = requireGame(entry.room);
    const now = this.clock.nowEpochMs();
    for (const assignment of roundAssignments(game, game.roundIndex)) {
      if (assignment.status !== 'DRAFT') continue;
      const check = checkPost(assignment.draftText);
      if (check.okForLock) {
        assignment.finalText = check.text;
        assignment.status = 'LOCKED';
        assignment.autoSubmitted = true;
        assignment.lockedAt = now;
      } else {
        assignment.status = 'FORFEIT';
        assignment.finalText = null;
      }
    }
  }

  private startDuel(entry: RoomEntry, duelIndex: number): void {
    const game = requireGame(entry.room);
    game.duelIndex = duelIndex;
    const duel = currentDuel(game);
    const { A, B } = duelAssignments(game, duel);
    if (A.status === 'FORFEIT' && B.status === 'FORFEIT') {
      // Both positions unfilled: skip read/guess/endorse and show a short, pointless result.
      this.settleDuel(entry, duel);
      this.enterPhase(entry, 'DUEL_RESULT', this.scaled(PHASE_TIMINGS_MS.duelResultUnfilled));
    } else {
      this.enterPhase(entry, 'DUEL_READ', this.scaled(PHASE_TIMINGS_MS.duelRead));
    }
  }

  /** Scores exactly once, on entry to DUEL_RESULT. Repeated calls return the stored result. */
  settleDuel(entry: RoomEntry, duel: Duel): DuelResult {
    if (duel.settled) {
      if (!duel.result) throw new Error('corrupt duel: settled without a result');
      return duel.result;
    }
    const { room } = entry;
    const game = requireGame(room);
    const round = game.rounds[duel.roundIndex];
    if (!round) throw new Error('corrupt duel: unknown round');
    const multiplier = round.multiplier;
    const assignments = duelAssignments(game, duel);
    const forfeit = { A: assignments.A.status === 'FORFEIT', B: assignments.B.status === 'FORFEIT' };
    const counts = countEndorsements(duel.endorsements.values());
    if (forfeit.A && forfeit.B && (duel.guesses.size > 0 || duel.endorsements.size > 0)) {
      throw new Error('corrupt duel: ballots recorded for a double forfeit');
    }
    if ((forfeit.A && counts.A > 0) || (forfeit.B && counts.B > 0)) {
      throw new Error('corrupt duel: endorsement for a forfeited side');
    }
    const ballots = counts.A + counts.B + counts.NEITHER;
    const deltas: Record<string, number> = {};
    for (const id of game.rosterIds) deltas[id] = 0;

    const sidePoints = {
      A: forfeit.A ? 0 : writerPoints(counts.A, ballots, multiplier),
      B: forfeit.B ? 0 : writerPoints(counts.B, ballots, multiplier),
    };
    for (const side of SIDES) {
      const writerId = duel.writerBySide[side];
      deltas[writerId] = (deltas[writerId] ?? 0) + sidePoints[side];
    }
    const correctGuesserIds = duel.readerIds.filter(
      (id) => duel.guesses.get(id) === duel.correctOptionId,
    );
    const perGuess = guessPoints(multiplier);
    for (const id of correctGuesserIds) deltas[id] = (deltas[id] ?? 0) + perGuess;

    const totalsAfter: Record<string, number> = {};
    for (const id of game.rosterIds) {
      const player = room.players.get(id);
      if (!player) throw new Error('corrupt game: roster player missing');
      player.score += deltas[id] ?? 0;
      totalsAfter[id] = player.score;
    }

    const outcome = (side: 'A' | 'B') => {
      const assignment = assignments[side];
      return {
        playerId: duel.writerBySide[side],
        text: assignment.status === 'FORFEIT' ? null : assignment.finalText,
        forfeit: forfeit[side],
        autoSubmitted: assignment.autoSubmitted,
        votes: counts[side],
        points: sidePoints[side],
      };
    };
    const result: DuelResult = {
      duelId: duel.id,
      roundNumber: duel.roundIndex + 1,
      multiplier,
      truth: duel.prompt.truth,
      facts: [...duel.prompt.facts],
      boundaries: [...duel.prompt.boundaries],
      correctOptionId: duel.correctOptionId,
      sides: { A: outcome('A'), B: outcome('B') },
      votesNeither: counts.NEITHER,
      ballotsCast: ballots,
      eligibleReaders: duel.readerIds.length,
      correctGuesserIds,
      guessPoints: perGuess,
      stamp: resultStamp({ forfeitA: forfeit.A, forfeitB: forfeit.B, votesA: counts.A, votesB: counts.B }),
      deltas,
      totalsAfter,
    };
    duel.result = deepFreeze(result);
    duel.settled = true;
    return duel.result;
  }

  private pauseInternal(entry: RoomEntry, reason: PauseReason): boolean {
    const { room, runtime } = entry;
    const phase = room.phase;
    if (phase.durationMs === null) return false;
    if (phase.pause) {
      // Already paused: keep the frozen remaining time; only the reason may change.
      if (reason === 'HOST_DISCONNECTED') phase.pause.reason = reason;
      return false;
    }
    const now = this.clock.nowMonotonicMs();
    const remaining = Math.max(0, (runtime.deadlineMono ?? now) - now);
    phase.elapsedBeforePauseMs += Math.max(0, now - runtime.segmentStartMono);
    phase.pause = { reason, pausedAt: this.clock.nowEpochMs(), remainingMs: remaining };
    phase.deadlineAt = null;
    runtime.deadlineMono = null;
    runtime.pausedAtMono = now;
    this.clearPhaseTimers(entry);
    this.logger.info({ roomId: room.id, phase: phase.name, reason }, 'phase.paused');
    return true;
  }

  private resumeInternal(entry: RoomEntry): boolean {
    const { room, runtime } = entry;
    const phase = room.phase;
    if (!phase.pause) return false;
    const now = this.clock.nowMonotonicMs();
    const remaining = phase.pause.remainingMs;
    phase.pause = null;
    runtime.pausedAtMono = null;
    runtime.segmentStartMono = now;
    runtime.deadlineMono = now + remaining;
    phase.deadlineAt = this.clock.nowEpochMs() + remaining;
    this.scheduleDeadline(entry);
    this.logger.info({ roomId: room.id, phase: phase.name }, 'phase.resumed');
    this.checkEarlyCompletion(entry);
    return true;
  }

  // -------------------------------------------------------------------------------------------
  // Room lifetime

  /** Ends a room: notify everyone, revoke credentials, clear timers and caches, keep a tombstone. */
  closeRoom(roomId: string, reason: 'HOST_ENDED' | 'EXPIRED' | 'SERVER_SHUTDOWN'): boolean {
    const entry = this.store.get(roomId);
    if (!entry) return false;
    const { room, runtime } = entry;
    this.clearPhaseTimers(entry);
    for (const timer of runtime.reservationTimers.values()) timer.cancel();
    runtime.reservationTimers.clear();
    this.publisher.roomClosed(entry, { reason, message: CLOSE_MESSAGES[reason] });
    for (const session of room.sessions.values()) {
      session.revoked = true;
      session.requests.clear();
    }
    room.sessions.clear();
    this.store.remove(roomId);
    this.dropHttpCachesForRoom(roomId);
    this.logger.info({ roomId, reason }, 'room.closed');
    return true;
  }

  /** Applies lifetime rules. Heartbeats never count as human activity. */
  sweep(): void {
    const now = this.clock.nowMonotonicMs();
    for (const entry of this.store.entries()) {
      const { room, runtime } = entry;
      const phase = room.phase.name;
      const untimed = phase === 'LOBBY' || phase === 'FINAL';
      let reason: string | null = null;
      if (now - room.createdAt >= this.config.roomMaxAgeMs) reason = 'max_age';
      else if (untimed && now - room.lastHumanActivityAt >= this.config.roomIdleMs) reason = 'idle';
      else if (room.allDisconnectedSince !== null && now - room.allDisconnectedSince >= this.config.roomAbandonedMs) {
        reason = 'abandoned';
      } else if (
        !untimed &&
        room.hostDisconnectedSince !== null &&
        now - room.hostDisconnectedSince >= this.config.roomAbandonedMs
      ) {
        reason = 'host_absent';
      } else if (
        room.phase.pause?.reason === 'HOST_PAUSED' &&
        now - Math.max(room.lastHumanActivityAt, runtime.pausedAtMono ?? 0) >= this.config.roomIdleMs
      ) {
        reason = 'paused_idle';
      }
      if (reason) {
        this.logger.info({ roomId: room.id, why: reason }, 'room.expiring');
        this.closeRoom(room.id, 'EXPIRED');
      }
    }
    this.store.purgeTombstones();
    this.purgeHttpCaches(now);
    for (const entry of this.store.entries()) {
      for (const session of entry.room.sessions.values()) this.purgeRequestCache(session, now);
    }
  }

  startSweeper(intervalMs = SWEEP_INTERVAL_MS): void {
    this.stopSweeper();
    const tick = () => {
      this.sweep();
      this.sweepTimer = this.scheduler.schedule(intervalMs, tick);
    };
    this.sweepTimer = this.scheduler.schedule(intervalMs, tick);
  }

  stopSweeper(): void {
    this.sweepTimer?.cancel();
    this.sweepTimer = null;
  }

  /** Graceful shutdown: every room ends honestly; nothing is persisted. */
  shutdown(): void {
    this.stopSweeper();
    for (const entry of this.store.entries()) this.closeRoom(entry.room.id, 'SERVER_SHUTDOWN');
  }

  // -------------------------------------------------------------------------------------------
  // Helpers

  private requireRoomByCode(code: string): RoomEntry {
    const entry = this.store.getByCode(code);
    if (entry) return entry;
    if (this.store.isTombstoned(code)) throw new GameError('ROOM_ENDED', CLOSE_MESSAGES.EXPIRED);
    throw new GameError('ROOM_NOT_FOUND', 'No room with that code. Check the code on the big screen.');
  }

  private requirePhase(room: Room, phase: Phase): void {
    if (room.phase.name !== phase) {
      throw new GameError('FORBIDDEN', "That action isn't available right now.");
    }
  }

  private requireUnpaused(room: Room): void {
    if (room.phase.pause) throw new GameError('GAME_PAUSED', 'The game is paused. Your time is safe.');
  }

  private requirePlayer(room: Room, session: SessionRecord): PlayerRecord {
    const player = session.playerId ? room.players.get(session.playerId) : undefined;
    if (!player) throw new GameError('UNAUTHORIZED', 'This browser is not part of that room.');
    return player;
  }

  private requireOwnAssignment(room: Room, playerId: string, assignmentId: string): Assignment {
    const game = requireGame(room);
    const assignment = game.assignments.get(assignmentId);
    if (!assignment) throw new GameError('BAD_INPUT', 'Unknown assignment.');
    if (assignment.playerId !== playerId) throw new GameError('FORBIDDEN', 'That post belongs to someone else.');
    const duel = game.duels.get(assignment.duelId);
    if (!duel || duel.roundIndex !== game.roundIndex) {
      throw new GameError('FORBIDDEN', 'That post is not part of this round.');
    }
    return assignment;
  }

  private requireCurrentDuel(room: Room, duelId: string): Duel {
    const duel = currentDuel(requireGame(room));
    if (duel.id !== duelId) throw new GameError('BAD_INPUT', 'That post-off is not active.');
    return duel;
  }

  private removePlayerRecord(entry: RoomEntry, playerId: string, notify: RoomClosedPayload | null): void {
    const { room, runtime } = entry;
    if (!room.players.delete(playerId)) return;
    runtime.reservationTimers.get(playerId)?.cancel();
    runtime.reservationTimers.delete(playerId);
    for (const [sessionId, session] of room.sessions) {
      if (session.playerId !== playerId) continue;
      session.revoked = true;
      room.sessions.delete(sessionId);
      if (notify) this.publisher.sessionRevoked(entry, session, notify);
    }
    const now = this.clock.nowMonotonicMs();
    for (const [requestId, cached] of this.joinCache) {
      if (cached.playerId === playerId) {
        this.joinCache.delete(requestId);
        this.expiredRequestIds.set(requestId, now + EXPIRED_REQUEST_MARKER_MS);
      }
    }
  }

  private cacheAck(session: SessionRecord, requestId: string, hash: string, ack: AckSuccess, now: number): void {
    session.requests.set(requestId, { hash, at: now, ack } satisfies CachedAck);
    while (session.requests.size > REQUEST_CACHE_MAX) {
      const oldest = session.requests.keys().next().value;
      if (oldest === undefined) break;
      session.requests.delete(oldest);
    }
  }

  private purgeRequestCache(session: SessionRecord, now: number): void {
    for (const [requestId, cached] of session.requests) {
      if (now - cached.at >= REQUEST_CACHE_TTL_MS) session.requests.delete(requestId);
    }
  }

  private purgeHttpCaches(now: number): void {
    for (const cache of [this.createCache, this.joinCache] as Map<string, CachedResponse<unknown>>[]) {
      for (const [requestId, cached] of cache) {
        if (cached.expiresAt <= now) {
          cache.delete(requestId);
          this.expiredRequestIds.set(requestId, now + EXPIRED_REQUEST_MARKER_MS);
        }
      }
    }
    for (const [requestId, expiresAt] of this.expiredRequestIds) {
      if (expiresAt <= now) this.expiredRequestIds.delete(requestId);
    }
  }

  private dropHttpCachesForRoom(roomId: string): void {
    const now = this.clock.nowMonotonicMs();
    for (const cache of [this.createCache, this.joinCache] as Map<string, CachedResponse<unknown>>[]) {
      for (const [requestId, cached] of cache) {
        if (cached.roomId === roomId) {
          cache.delete(requestId);
          this.expiredRequestIds.set(requestId, now + EXPIRED_REQUEST_MARKER_MS);
        }
      }
    }
  }
}

function failure(
  requestId: string,
  code: ErrorCode,
  message: string,
  extras: { fieldErrors?: Record<string, string>; retryAfterMs?: number } = {},
): AckFailure {
  const ack: AckFailure = { ok: false, requestId, code, message, retryable: RETRYABLE_CODES.has(code) };
  if (extras.fieldErrors) ack.fieldErrors = extras.fieldErrors;
  if (extras.retryAfterMs !== undefined) ack.retryAfterMs = extras.retryAfterMs;
  return ack;
}

const RETRYABLE_CODES = new Set<ErrorCode>(['RATE_LIMITED', 'INTERNAL_ERROR', 'REVISION_CONFLICT', 'GAME_PAUSED']);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
