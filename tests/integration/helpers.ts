import { randomUUID } from 'node:crypto';
import {
  DEFAULT_SETTINGS,
  HostViewSchema,
  PlayerViewSchema,
  PROTOCOL_VERSION,
  type Ack,
  type ApiError,
  type AvatarId,
  type CommandPayload,
  type CommandType,
  type ConnectErrorData,
  type CreateRoomResponse,
  type HostView,
  type JoinRoomResponse,
  type PlayerView,
  type RoomClosedPayload,
  type RoomSettings,
  type RoomView,
} from '@larpbox/shared';
import { io, type Socket } from 'socket.io-client';
import { createService, type LarpboxService } from '../../apps/server/src/app.js';
import { loadConfig, type AppConfig } from '../../apps/server/src/config.js';
import { loadPromptPack } from '../../apps/server/src/content/loadPrompts.js';
import { FakeClock } from '../../apps/server/src/game/clock.js';
import { createSilentLogger } from '../../apps/server/src/logger.js';

export interface TestServer {
  service: LarpboxService;
  baseUrl: string;
  clock: FakeClock;
  close(): Promise<void>;
}

/** In-process service on an ephemeral loopback port with an injected fake game clock. */
export async function startServer(overrides: Partial<AppConfig> = {}): Promise<TestServer> {
  const clock = new FakeClock({ epochMs: Date.now() });
  const config: AppConfig = {
    ...loadConfig({ NODE_ENV: 'test', HOST: '127.0.0.1', PUBLIC_ORIGIN: 'http://larpbox.test' }),
    ...overrides,
  };
  const service = createService({
    config,
    promptPack: loadPromptPack(),
    logger: createSilentLogger(),
    clock,
    scheduler: clock,
    webDistDir: null,
  });
  const address = await service.listen(0, '127.0.0.1');
  return { service, baseUrl: `http://127.0.0.1:${address.port}`, clock, close: () => service.close() };
}

export async function api<T>(
  server: TestServer,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: T & Partial<ApiError> }> {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } };
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  const response = await fetch(`${server.baseUrl}${path}`, init);
  return { status: response.status, body: (await response.json()) as T & Partial<ApiError> };
}

/**
 * Integration tests default to two posts each with 90 seconds of writing, the rules they were
 * written against. Tests of the one-post default pass `postsPerPlayer: 1` explicitly.
 */
export const INTEGRATION_SETTINGS: RoomSettings = { ...DEFAULT_SETTINGS, postsPerPlayer: 2, secondsPerPost: 45 };

export async function createRoom(server: TestServer, settings: Partial<RoomSettings> = {}): Promise<CreateRoomResponse> {
  const { status, body } = await api<CreateRoomResponse>(server, 'POST', '/api/rooms', {
    createRequestId: randomUUID(),
    settings: { ...INTEGRATION_SETTINGS, ...settings },
  });
  if (status !== 201) throw new Error(`create failed: ${status} ${JSON.stringify(body)}`);
  return body;
}

export async function joinRoom(
  server: TestServer,
  code: string,
  name: string,
  avatarId: AvatarId = 'coffee',
): Promise<JoinRoomResponse> {
  const { status, body } = await api<JoinRoomResponse>(server, 'POST', `/api/rooms/${code}/players`, {
    joinRequestId: randomUUID(),
    name,
    avatarId,
  });
  if (status !== 201) throw new Error(`join failed: ${status} ${JSON.stringify(body)}`);
  return body;
}

export class ConnectFailure extends Error {
  constructor(readonly data: ConnectErrorData | undefined) {
    super(data?.message ?? 'connect failed');
  }
}

export class TestClient {
  readonly views: RoomView[] = [];
  closed: RoomClosedPayload | null = null;
  replaced = false;
  protocolErrors: unknown[] = [];
  private waiters: { predicate: (view: RoomView) => boolean; resolve: (view: RoomView) => void }[] = [];

  constructor(
    readonly socket: Socket,
    readonly role: 'host' | 'player',
  ) {
    socket.on('room:state', (view: RoomView) => {
      // Every snapshot must satisfy the strict schema for its role.
      const parsed = role === 'host' ? HostViewSchema.parse(view) : PlayerViewSchema.parse(view);
      this.views.push(parsed);
      this.waiters = this.waiters.filter((waiter) => {
        if (!waiter.predicate(parsed)) return true;
        waiter.resolve(parsed);
        return false;
      });
    });
    socket.on('room:closed', (payload: RoomClosedPayload) => {
      this.closed = payload;
    });
    socket.on('session:replaced', () => {
      this.replaced = true;
    });
    socket.on('protocol:error', (payload: unknown) => this.protocolErrors.push(payload));
  }

  latest(): RoomView {
    const view = this.views.at(-1);
    if (!view) throw new Error('no snapshot yet');
    return view;
  }

  host(): HostView {
    const view = this.latest();
    if (view.role !== 'host') throw new Error('not a host view');
    return view;
  }

  player(): PlayerView {
    const view = this.latest();
    if (view.role !== 'player') throw new Error('not a player view');
    return view;
  }

  waitFor(predicate: (view: RoomView) => boolean, timeoutMs = 5_000): Promise<RoomView> {
    const existing = this.views.at(-1);
    if (existing && predicate(existing)) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for snapshot')), timeoutMs);
      this.waiters.push({
        predicate,
        resolve: (view) => {
          clearTimeout(timer);
          resolve(view);
        },
      });
    });
  }

  waitForPhase(phase: string, timeoutMs?: number): Promise<RoomView> {
    return this.waitFor((view) => view.phase.name === phase, timeoutMs);
  }

  async command<T extends CommandType>(
    type: T,
    payload: CommandPayload<T>,
    overrides: { requestId?: string; phaseId?: string; gameId?: string | null } = {},
  ): Promise<Ack> {
    const view = this.latest();
    const envelope = {
      requestId: overrides.requestId ?? randomUUID(),
      phaseId: overrides.phaseId ?? view.phase.id,
      gameId: overrides.gameId === undefined ? view.gameId : overrides.gameId,
      type,
      payload,
    };
    return (await this.socket.timeout(3_000).emitWithAck('command', envelope)) as Ack;
  }

  disconnect(): void {
    this.socket.disconnect();
  }
}

export function connect(
  server: TestServer,
  auth: { roomCode: string; role: 'host' | 'player'; token: string; clientInstanceId?: string; takeover?: boolean },
  options: { origin?: string } = {},
): Promise<TestClient> {
  const socket = io(server.baseUrl, {
    auth: {
      protocolVersion: PROTOCOL_VERSION,
      roomCode: auth.roomCode,
      role: auth.role,
      token: auth.token,
      clientInstanceId: auth.clientInstanceId ?? randomUUID(),
      takeover: auth.takeover ?? false,
    },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    ...(options.origin ? { extraHeaders: { origin: options.origin } } : {}),
  });
  const client = new TestClient(socket, auth.role);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(client));
    socket.once('connect_error', (error: Error & { data?: ConnectErrorData }) => {
      socket.close();
      reject(new ConnectFailure(error.data));
    });
  });
}

/**
 * Expects the connection to be refused. Returns the structured handshake error, or
 * 'TRANSPORT_REJECTED' when the server refused the transport itself (e.g. origin check).
 */
export async function connectFails(
  server: TestServer,
  auth: Parameters<typeof connect>[1],
  options: Parameters<typeof connect>[2] = {},
): Promise<ConnectErrorData | 'TRANSPORT_REJECTED'> {
  try {
    const client = await connect(server, auth, options);
    client.disconnect();
  } catch (error) {
    if (error instanceof ConnectFailure) return error.data ?? 'TRANSPORT_REJECTED';
    throw error;
  }
  throw new Error('expected connection to fail');
}

/** Polls until the condition holds (for server-side state in in-process tests). */
export async function eventually(condition: () => boolean, timeoutMs = 3_000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('condition never became true');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export interface Table {
  room: CreateRoomResponse;
  host: TestClient;
  players: { join: JoinRoomResponse; client: TestClient; name: string }[];
}

/** A room with a connected host and `count` connected, ready players. */
export async function setupTable(server: TestServer, count: number, settings: Partial<RoomSettings> = {}): Promise<Table> {
  const room = await createRoom(server, settings);
  const host = await connect(server, { roomCode: room.roomCode, role: 'host', token: room.hostToken });
  const players: Table['players'] = [];
  for (let i = 1; i <= count; i += 1) {
    const name = `P${i}`;
    const join = await joinRoom(server, room.roomCode, name);
    const client = await connect(server, { roomCode: room.roomCode, role: 'player', token: join.playerToken });
    players.push({ join, client, name });
  }
  for (const player of players) {
    await player.client.waitForPhase('LOBBY');
    const ack = await player.client.command('player.setReady', { ready: true });
    if (!ack.ok) throw new Error(`ready failed: ${ack.code}`);
  }
  await host.waitFor((view) => view.screen.kind === 'LOBBY' && view.screen.readyCount === count);
  return { room, host, players };
}

export async function closeAll(table: Table | null, server: TestServer | null): Promise<void> {
  table?.host.disconnect();
  for (const player of table?.players ?? []) player.client.disconnect();
  await server?.close();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
