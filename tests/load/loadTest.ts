/**
 * Synthetic load run (spec section 15.4): 10 rooms × 8 players + 10 hosts over real Socket.IO
 * connections on loopback, full Standard games with autosaves, guesses and endorsements.
 *
 * The server runs in this same process so its room store and timers can be inspected afterwards,
 * which also makes latency numbers conservative (clients and server share one event loop).
 *
 *   npx tsx tests/load/loadTest.ts            # defaults: 10 rooms, 8 players, time scale 0.2
 *   ROOMS=4 PLAYERS=5 npx tsx tests/load/loadTest.ts
 */
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import {
  DEFAULT_SETTINGS,
  type Ack,
  type CommandPayload,
  type CommandType,
  type CreateRoomResponse,
  type JoinRoomResponse,
  type PublicDuelResult,
  type RoomView,
} from '@larpbox/shared';
import { io, type Socket } from 'socket.io-client';
import { createService } from '../../apps/server/src/app.js';
import { loadConfig } from '../../apps/server/src/config.js';
import { loadPromptPack } from '../../apps/server/src/content/loadPrompts.js';
import type { Scheduler, TimerHandle } from '../../apps/server/src/game/clock.js';
import { createSilentLogger } from '../../apps/server/src/logger.js';

const ROOMS = Number(process.env.ROOMS ?? 10);
const PLAYERS = Number(process.env.PLAYERS ?? 8);
const SCALE = Number(process.env.SCALE ?? 0.2);

/** Scheduler that knows how many game timers are still pending. */
class CountingScheduler implements Scheduler {
  readonly active = new Set<object>();
  schedule(delayMs: number, callback: () => void): TimerHandle {
    const token = {};
    const handle = setTimeout(() => {
      this.active.delete(token);
      callback();
    }, Math.max(0, delayMs));
    this.active.add(token);
    return {
      cancel: () => {
        clearTimeout(handle);
        this.active.delete(token);
      },
    };
  }
}

const latencies: number[] = [];
let failures = 0;

class Bot {
  view: RoomView | null = null;
  readonly views: RoomView[] = [];
  private acted = new Set<string>();
  constructor(
    readonly socket: Socket,
    readonly roomId: string,
    readonly name: string,
  ) {
    socket.on('room:state', (view: RoomView) => {
      this.views.push(view);
      if (this.view && view.revision < this.view.revision && view.bootId === this.view.bootId) return;
      this.view = view;
      void this.act();
    });
  }

  async command<T extends CommandType>(type: T, payload: CommandPayload<T>): Promise<Ack | null> {
    const view = this.view;
    if (!view || !this.socket.connected) return null;
    const started = performance.now();
    try {
      const ack = (await this.socket.timeout(5_000).emitWithAck('command', {
        requestId: randomUUID(),
        phaseId: view.phase.id,
        gameId: view.gameId,
        type,
        payload,
      })) as Ack;
      latencies.push(performance.now() - started);
      if (!ack.ok && ack.code !== 'PHASE_CHANGED' && ack.code !== 'DEADLINE_PASSED' && ack.code !== 'ALREADY_LOCKED') {
        failures += 1;
        console.error(`${this.name} ${type} -> ${ack.code}: ${ack.message}`);
      }
      return ack;
    } catch (error) {
      failures += 1;
      console.error(`${this.name} ${type} timed out`, error);
      return null;
    }
  }

  private async act(): Promise<void> {
    const view = this.view;
    if (!view || view.role !== 'player' || view.phase.paused) return;
    const key = view.phase.id;
    if (this.acted.has(key)) return;
    const screen = view.screen;
    if (screen.kind === 'WRITING') {
      this.acted.add(key);
      for (const assignment of screen.assignments) {
        let revision = assignment.draftRevision;
        for (const draft of ['Humbled to', 'Humbled to announce a']) {
          const ack = await this.command('writing.saveDraft', { assignmentId: assignment.id, text: draft, expectedDraftRevision: revision });
          if (ack?.ok) revision = (ack.data as { draftRevision: number }).draftRevision;
        }
        await this.command('writing.lockPost', {
          assignmentId: assignment.id,
          text: `${this.name} is humbled to announce milestone ${assignment.presentationNumber}.`,
          expectedDraftRevision: revision,
        });
      }
    } else if (screen.kind === 'DUEL_GUESS' && screen.me.role === 'READER' && !screen.me.guessOptionId) {
      this.acted.add(key);
      const option = screen.options[Math.floor(Math.random() * screen.options.length)];
      if (option) await this.command('duel.lockGuess', { duelId: screen.duelId, optionId: option.id });
    } else if (screen.kind === 'DUEL_ENDORSE' && screen.me.role === 'READER' && !screen.me.endorsement) {
      this.acted.add(key);
      const choice = screen.availableChoices[Math.floor(Math.random() * screen.availableChoices.length)];
      if (choice) await this.command('duel.lockEndorsement', { duelId: screen.duelId, choice });
    }
  }
}

/**
 * Creates the bot (and its listeners) before the socket connects: the server sends the first
 * snapshot in the same tick as the connection, so late listeners would miss it.
 */
function connectBot(baseUrl: string, roomCode: string, role: 'host' | 'player', token: string, roomId: string, name: string): Promise<Bot> {
  const socket = io(baseUrl, {
    auth: { protocolVersion: 1, roomCode, role, token, clientInstanceId: randomUUID(), takeover: false },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    autoConnect: false,
  });
  const bot = new Bot(socket, roomId, name);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(bot));
    socket.once('connect_error', reject);
    socket.connect();
  });
}

async function post<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

/** Recomputes every duel from its public result and checks the room's final totals. */
function verifyScores(hostViews: RoomView[]): string[] {
  const problems: string[] = [];
  const results = new Map<string, PublicDuelResult>();
  for (const view of hostViews) if (view.screen.kind === 'DUEL_RESULT') results.set(view.screen.result.duelId, view.screen.result);
  const expected = new Map<string, number>();
  for (const result of results.values()) {
    const ballots = result.sides.A.votes + result.sides.B.votes + result.votesNeither;
    if (ballots !== result.ballotsCast || ballots > result.eligibleReaders) problems.push(`duel ${result.duelId}: bad ballot count`);
    for (const side of ['A', 'B'] as const) {
      const outcome = result.sides[side];
      const points = outcome.forfeit || ballots === 0 ? 0 : Math.floor((1000 * result.multiplier * outcome.votes) / ballots);
      if (points !== outcome.points) problems.push(`duel ${result.duelId}: ${side} scored ${outcome.points}, expected ${points}`);
      expected.set(outcome.playerId, (expected.get(outcome.playerId) ?? 0) + outcome.points);
    }
    if (result.guessPoints !== 250 * result.multiplier) problems.push(`duel ${result.duelId}: wrong guess points`);
    for (const id of result.correctGuesserIds) expected.set(id, (expected.get(id) ?? 0) + result.guessPoints);
  }
  const final = hostViews.at(-1);
  if (!final || final.screen.kind !== 'FINAL') return [...problems, 'room did not finish'];
  for (const row of final.screen.rows) {
    if (row.total !== (expected.get(row.playerId) ?? 0)) problems.push(`player ${row.playerId}: total ${row.total}, expected ${expected.get(row.playerId) ?? 0}`);
  }
  return problems;
}

async function main(): Promise<void> {
  const scheduler = new CountingScheduler();
  const config = {
    ...loadConfig({ NODE_ENV: 'test', HOST: '127.0.0.1', PUBLIC_ORIGIN: 'http://127.0.0.1', GAME_TIME_SCALE: String(SCALE) }),
    rateLimitMultiplier: 50,
  };
  const service = createService({ config, promptPack: loadPromptPack(), logger: createSilentLogger(), scheduler, webDistDir: null });
  const address = await service.listen(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Load run: ${ROOMS} rooms x ${PLAYERS} players (+${ROOMS} hosts), Standard game, time scale ${SCALE}`);
  console.log(`Machine: ${os.cpus()[0]?.model ?? 'unknown CPU'} x${os.cpus().length}, ${Math.round(os.totalmem() / 2 ** 30)} GiB, Node ${process.version}, ${os.platform()} ${os.release()}`);

  const started = performance.now();
  const rooms: { room: CreateRoomResponse; host: Bot; players: Bot[] }[] = [];
  for (let r = 0; r < ROOMS; r += 1) {
    const room = await post<CreateRoomResponse>(baseUrl, '/api/rooms', { createRequestId: randomUUID(), settings: DEFAULT_SETTINGS });
    const host = await connectBot(baseUrl, room.roomCode, 'host', room.hostToken, room.roomId, `host${r}`);
    const players: Bot[] = [];
    for (let p = 0; p < PLAYERS; p += 1) {
      const join = await post<JoinRoomResponse>(baseUrl, `/api/rooms/${room.roomCode}/players`, {
        joinRequestId: randomUUID(),
        name: `R${r}P${p}`,
        avatarId: 'coffee',
      });
      players.push(await connectBot(baseUrl, room.roomCode, 'player', join.playerToken, room.roomId, `R${r}P${p}`));
    }
    rooms.push({ room, host, players });
  }
  // Every client must have its first snapshot before acting on it.
  const everyone = rooms.flatMap(({ host, players }) => [host, ...players]);
  console.log(`Connected ${everyone.length} sockets; waiting for first snapshots`);
  while (everyone.some((bot) => bot.view === null)) await new Promise((resolve) => setTimeout(resolve, 50));
  console.log('All clients have snapshots; readying up');
  for (const { players } of rooms) {
    const acks = await Promise.all(players.map((bot) => bot.command('player.setReady', { ready: true })));
    if (acks.some((ack) => !ack?.ok)) throw new Error('a player could not ready up');
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  for (const { host } of rooms) {
    const ack = await host.command('host.startGame', {});
    if (!ack?.ok) throw new Error(`start failed: ${ack && !ack.ok ? ack.code : 'no ack'}`);
  }

  const deadline = Date.now() + 15 * 60_000;
  let lastReport = 0;
  while (rooms.some(({ host }) => host.view?.screen.kind !== 'FINAL')) {
    if (Date.now() > deadline) throw new Error('games did not finish in time');
    if (Date.now() - lastReport > 10_000) {
      lastReport = Date.now();
      const phases = rooms.map(({ host }) => `${host.view?.phase.name ?? '?'}${host.view?.duelNumber ? `#${host.view.duelNumber}` : ''}`);
      console.log(`[${((performance.now() - started) / 1000).toFixed(0)}s] ${phases.join(' ')} acks=${latencies.length}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const elapsed = (performance.now() - started) / 1000;

  const problems: string[] = [];
  for (const { room, host, players } of rooms) {
    for (const bot of [host, ...players]) {
      if (bot.views.some((view) => view.roomId !== room.roomId)) problems.push(`${bot.name} received another room's snapshot`);
    }
    problems.push(...verifyScores(host.views).map((problem) => `${room.roomCode}: ${problem}`));
    const hostFinal = host.view;
    for (const bot of players) {
      if (JSON.stringify(bot.view?.players.map((p) => p.score)) !== JSON.stringify(hostFinal?.players.map((p) => p.score))) {
        problems.push(`${bot.name} disagrees with the host on final scores`);
      }
    }
  }

  // End every room, then confirm nothing is left behind.
  for (const { host } of rooms) await host.command('host.closeRoom', {});
  await new Promise((resolve) => setTimeout(resolve, 500));
  const roomsLeft = service.engine.store.size;
  await service.close();
  const timersLeft = scheduler.active.size;
  for (const { host, players } of rooms) for (const bot of [host, ...players]) bot.socket.close();

  console.log(`Finished ${ROOMS} games in ${elapsed.toFixed(1)}s`);
  console.log(
    `Command acks: n=${latencies.length} p50=${percentile(latencies, 50).toFixed(1)}ms p95=${percentile(latencies, 95).toFixed(1)}ms p99=${percentile(latencies, 99).toFixed(1)}ms max=${Math.max(...latencies).toFixed(1)}ms`,
  );
  console.log(`Unexpected command failures: ${failures}`);
  console.log(`Rooms left after closing: ${roomsLeft}; game timers left after shutdown: ${timersLeft}`);
  console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'Scores verified for every duel, no cross-room snapshots, all devices agree on totals.');
  const ok = problems.length === 0 && failures === 0 && roomsLeft === 0 && timersLeft === 0 && percentile(latencies, 95) < 250;
  console.log(ok ? 'LOAD RUN PASSED' : 'LOAD RUN FAILED');
  process.exit(ok ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
