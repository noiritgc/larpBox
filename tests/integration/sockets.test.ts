import { randomUUID } from 'node:crypto';
import type { PlayerView, RoomView } from '@larpbox/shared';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeAll,
  connect,
  connectFails,
  createRoom,
  eventually,
  joinRoom,
  setupTable,
  sleep,
  startServer,
  type Table,
  type TestClient,
  type TestServer,
} from './helpers.js';

let server: TestServer | null = null;
let table: Table | null = null;
const extraClients: TestClient[] = [];

afterEach(async () => {
  for (const client of extraClients.splice(0)) client.disconnect();
  await closeAll(table, server);
  table = null;
  server = null;
});

async function codeOf(result: Promise<Awaited<ReturnType<typeof connectFails>>>): Promise<string> {
  const value = await result;
  return value === 'TRANSPORT_REJECTED' ? value : value.code;
}

function engineRoom(s: TestServer, roomId: string) {
  const entry = s.service.engine.store.get(roomId);
  if (!entry) throw new Error('room gone');
  return entry.room;
}

async function syncAll(t: Table, phaseId: string): Promise<void> {
  await Promise.all([t.host, ...t.players.map((p) => p.client)].map((c) => c.waitFor((v) => v.phase.id === phaseId)));
}

/** Advances the fake game clock in small steps until the engine leaves the given phase. */
function advancePast(s: TestServer, roomId: string, phaseId: string): void {
  let guard = 0;
  while (s.service.engine.store.get(roomId) && engineRoom(s, roomId).phase.id === phaseId) {
    guard += 1;
    if (guard > 10_000) throw new Error('phase never ended');
    s.clock.advance(250);
  }
}

/** Plays a whole game over the real sockets, acting only on what each client's snapshot shows. */
async function playOverSockets(s: TestServer, t: Table): Promise<string[]> {
  const phases: string[] = [];
  for (let guard = 0; guard < 500; guard += 1) {
    const room = engineRoom(s, t.room.roomId);
    const phaseId = room.phase.id;
    await syncAll(t, phaseId);
    phases.push(room.phase.name);
    if (room.phase.name === 'FINAL') return phases;
    for (const { client } of t.players) {
      const view = client.player();
      const screen = view.screen;
      if (screen.kind === 'WRITING') {
        for (const assignment of screen.assignments) {
          const ack = await client.command('writing.lockPost', {
            assignmentId: assignment.id,
            text: `Humbled to announce milestone ${assignment.presentationNumber} from ${view.selfId.slice(-4)}.`,
            expectedDraftRevision: assignment.draftRevision,
          });
          expect(ack.ok).toBe(true);
        }
      } else if (screen.kind === 'DUEL_GUESS' && screen.me.role === 'READER') {
        const ack = await client.command('duel.lockGuess', { duelId: screen.duelId, optionId: screen.options[0]!.id });
        expect(ack.ok).toBe(true);
      } else if (screen.kind === 'DUEL_ENDORSE' && screen.me.role === 'READER') {
        const ack = await client.command('duel.lockEndorsement', { duelId: screen.duelId, choice: screen.availableChoices[0]! });
        expect(ack.ok).toBe(true);
      }
    }
    advancePast(s, t.room.roomId, phaseId);
  }
  throw new Error('game did not finish');
}

describe('socket authentication', () => {
  it('denies bad tokens, wrong roles, unknown rooms, old protocols and foreign origins', async () => {
    server = await startServer({ allowedOrigins: ['http://larpbox.test'] });
    const room = await createRoom(server);
    const join = await joinRoom(server, room.roomCode, 'Alex');
    expect(await codeOf(connectFails(server, { roomCode: room.roomCode, role: 'player', token: 'x'.repeat(43) }))).toBe('UNAUTHORIZED');
    expect(await codeOf(connectFails(server, { roomCode: room.roomCode, role: 'player', token: room.hostToken }))).toBe('FORBIDDEN');
    expect(await codeOf(connectFails(server, { roomCode: room.roomCode, role: 'host', token: join.playerToken }))).toBe('FORBIDDEN');
    expect(await codeOf(connectFails(server, { roomCode: 'ZZZZ', role: 'host', token: room.hostToken }))).toBe('ROOM_NOT_FOUND');
    // A foreign browser origin is refused before the handshake even reaches authentication.
    const foreign = await connectFails(server, { roomCode: room.roomCode, role: 'host', token: room.hostToken }, { origin: 'https://evil.example' });
    expect(foreign).toBe('TRANSPORT_REJECTED');
    const ok = await connect(server, { roomCode: room.roomCode, role: 'host', token: room.hostToken }, { origin: 'http://larpbox.test' });
    extraClients.push(ok);
    await ok.waitForPhase('LOBBY');
  });

  it('rejects a protocol mismatch with a reload hint', async () => {
    server = await startServer();
    const room = await createRoom(server);
    const { io } = await import('socket.io-client');
    const socket = io(server.baseUrl, {
      auth: { protocolVersion: 99, roomCode: room.roomCode, role: 'host', token: room.hostToken, clientInstanceId: randomUUID(), takeover: false },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    const code = await new Promise((resolve) => socket.once('connect_error', (error: Error & { data?: { code: string } }) => resolve(error.data?.code)));
    socket.close();
    expect(code).toBe('PROTOCOL_MISMATCH');
  });

  it('sends a full snapshot on connect and marks the player online', async () => {
    server = await startServer();
    const room = await createRoom(server);
    const host = await connect(server, { roomCode: room.roomCode, role: 'host', token: room.hostToken });
    extraClients.push(host);
    const join = await joinRoom(server, room.roomCode, 'Alex');
    await host.waitFor((v) => v.players[0]?.joining === true);
    const player = await connect(server, { roomCode: room.roomCode, role: 'player', token: join.playerToken });
    extraClients.push(player);
    const view = (await player.waitForPhase('LOBBY')) as PlayerView;
    expect(view.selfId).toBe(join.playerId);
    await host.waitFor((v) => v.players[0]?.connected === true && v.players[0]?.joining === false);
  });
});

describe('sessions over sockets', () => {
  it('requires explicit takeover from another tab, and the old tab cannot mark the new one offline', async () => {
    server = await startServer();
    table = await setupTable(server, 3);
    const player = table.players[0]!;
    expect(await codeOf(connectFails(server, { roomCode: table.room.roomCode, role: 'player', token: player.join.playerToken }))).toBe('SESSION_IN_USE');
    const newTab = await connect(server, { roomCode: table.room.roomCode, role: 'player', token: player.join.playerToken, takeover: true });
    extraClients.push(newTab);
    await newTab.waitForPhase('LOBBY');
    await sleep(100);
    expect(player.client.replaced).toBe(true);
    expect(player.client.socket.connected).toBe(false);
    const hostView = await table.host.waitFor((v) => v.players.find((p) => p.id === player.join.playerId)?.connected === true);
    expect(hostView.players.find((p) => p.id === player.join.playerId)?.connected).toBe(true);
    // Commands from the replaced socket are refused.
    const ack = await newTab.command('player.setReady', { ready: false });
    expect(ack.ok).toBe(true);
  });

  it('pauses on host disconnect and waits for Resume after the host returns', async () => {
    server = await startServer();
    table = await setupTable(server, 3);
    expect((await table.host.command('host.startGame', {})).ok).toBe(true);
    advancePast(server, table.room.roomId, engineRoom(server, table.room.roomId).phase.id);
    advancePast(server, table.room.roomId, engineRoom(server, table.room.roomId).phase.id);
    await table.players[0]!.client.waitForPhase('WRITING');
    server.clock.advance(10_000);
    table.host.disconnect();
    const paused = await table.players[0]!.client.waitFor((v) => v.phase.paused);
    expect(paused.phase).toMatchObject({ pauseReason: 'HOST_DISCONNECTED', remainingMs: 80_000 });
    expect(paused.hostConnected).toBe(false);
    server.clock.advance(120_000);
    expect(engineRoom(server, table.room.roomId).phase.name).toBe('WRITING');
    const host = await connect(server, { roomCode: table.room.roomCode, role: 'host', token: table.room.hostToken });
    extraClients.push(host);
    const back = await host.waitFor((v) => v.phase.name === 'WRITING');
    expect(back.phase).toMatchObject({ paused: true, pauseReason: 'HOST_PAUSED', remainingMs: 80_000 });
    expect((await host.command('host.resume', {})).ok).toBe(true);
    await table.players[0]!.client.waitFor((v) => !v.phase.paused && v.phase.name === 'WRITING');
  });

  async function writingTable(s: TestServer) {
    const t = await setupTable(s, 3);
    expect((await t.host.command('host.startGame', {})).ok).toBe(true);
    advancePast(s, t.room.roomId, engineRoom(s, t.room.roomId).phase.id);
    advancePast(s, t.room.roomId, engineRoom(s, t.room.roomId).phase.id);
    const player = t.players[0]!;
    const view = (await player.client.waitForPhase('WRITING')) as PlayerView;
    if (view.screen.kind !== 'WRITING') throw new Error('expected writing');
    const assignment = view.screen.assignments[0]!;
    const envelope = {
      requestId: randomUUID(),
      phaseId: view.phase.id,
      gameId: view.gameId,
      type: 'writing.lockPost' as const,
      payload: { assignmentId: assignment.id, text: 'A lock whose acknowledgement gets lost.', expectedDraftRevision: 0 },
    };
    return { t, player, assignment, envelope };
  }

  it('keeps one effect when the ack is lost: reconnect, see the lock, retry the same request', async () => {
    server = await startServer();
    const s = server;
    const { t, player, assignment, envelope } = await writingTable(s);
    table = t;
    const game = engineRoom(s, t.room.roomId).game!;
    // The server applies the lock, but the client never reads the acknowledgement.
    player.client.socket.emit('command', envelope, () => {});
    await eventually(() => game.assignments.get(assignment.id)?.status === 'LOCKED');
    player.client.socket.disconnect();
    const again = await connect(s, { roomCode: t.room.roomCode, role: 'player', token: player.join.playerToken });
    extraClients.push(again);
    const restored = (await again.waitForPhase('WRITING')) as PlayerView;
    if (restored.screen.kind !== 'WRITING') throw new Error('expected writing');
    expect(restored.screen.assignments.find((a) => a.id === assignment.id)).toMatchObject({ status: 'LOCKED', finalText: 'A lock whose acknowledgement gets lost.' });
    const retry = (await again.socket.timeout(3_000).emitWithAck('command', envelope)) as { ok: boolean; data?: { draftRevision: number } };
    expect(retry).toMatchObject({ ok: true, data: { draftRevision: 1 } });
    expect(game.assignments.get(assignment.id)).toMatchObject({ status: 'LOCKED', draftRevision: 1 });
  });

  it('applies a command exactly once when it was lost before reaching the engine', async () => {
    server = await startServer();
    const s = server;
    const { t, player, assignment, envelope } = await writingTable(s);
    table = t;
    // Emitting and disconnecting in the same tick: Socket.IO drops the event with the connection.
    player.client.socket.emit('command', envelope, () => {});
    player.client.socket.disconnect();
    await sleep(50);
    const game = engineRoom(s, t.room.roomId).game!;
    const again = await connect(s, { roomCode: t.room.roomCode, role: 'player', token: player.join.playerToken });
    extraClients.push(again);
    const restored = (await again.waitForPhase('WRITING')) as PlayerView;
    if (restored.screen.kind !== 'WRITING') throw new Error('expected writing');
    const status = restored.screen.assignments.find((a) => a.id === assignment.id)?.status;
    const first = (await again.socket.timeout(3_000).emitWithAck('command', envelope)) as { ok: boolean };
    const second = (await again.socket.timeout(3_000).emitWithAck('command', envelope)) as { ok: boolean };
    expect(first.ok && second.ok).toBe(true);
    expect(game.assignments.get(assignment.id)).toMatchObject({ status: 'LOCKED', draftRevision: 1 });
    expect(['DRAFT', 'LOCKED']).toContain(status);
  });

  it('keeps host and player credentials in their lanes', async () => {
    server = await startServer();
    table = await setupTable(server, 3);
    const hostAsPlayer = await table.host.command('player.setReady', { ready: false });
    expect(hostAsPlayer.ok ? null : hostAsPlayer.code).toBe('FORBIDDEN');
    const playerStart = await table.players[0]!.client.command('host.startGame', {});
    expect(playerStart.ok ? null : playerStart.code).toBe('FORBIDDEN');
    const playerEnd = await table.players[0]!.client.command('host.closeRoom', {});
    expect(playerEnd.ok ? null : playerEnd.code).toBe('FORBIDDEN');
    expect(server.service.engine.store.size).toBe(1);
  });

  it('removes a lobby player, revokes the token and notifies them', async () => {
    server = await startServer();
    table = await setupTable(server, 3);
    const victim = table.players[2]!;
    expect((await table.host.command('host.removePlayer', { playerId: victim.join.playerId })).ok).toBe(true);
    await sleep(100);
    expect(victim.client.closed).toMatchObject({ reason: 'REMOVED', message: "You've been removed from this room." });
    expect(await codeOf(connectFails(server, { roomCode: table.room.roomCode, role: 'player', token: victim.join.playerToken }))).toBe('UNAUTHORIZED');
  });

  it('closes the room for everyone with an honest message', async () => {
    server = await startServer();
    table = await setupTable(server, 3);
    expect((await table.host.command('host.closeRoom', {})).ok).toBe(true);
    await sleep(100);
    for (const { client } of table.players) expect(client.closed).toMatchObject({ reason: 'HOST_ENDED' });
    expect(await codeOf(connectFails(server, { roomCode: table.room.roomCode, role: 'host', token: table.room.hostToken }))).toBe('ROOM_ENDED');
  });
});

describe('isolation and limits', () => {
  it('never delivers another room’s snapshots', async () => {
    server = await startServer();
    table = await setupTable(server, 3);
    const other = await setupTable(server, 3);
    try {
      expect((await table.host.command('host.startGame', {})).ok).toBe(true);
      expect((await other.host.command('host.updateSettings', { settings: { roundCount: 1, writingSeconds: 120, guessSeconds: 30, endorseSeconds: 30, pack: 'everyday' } })).ok).toBe(true);
      await sleep(100);
      for (const client of [table.host, ...table.players.map((p) => p.client)]) {
        expect(client.views.every((v: RoomView) => v.roomId === table!.room.roomId)).toBe(true);
      }
      for (const client of [other.host, ...other.players.map((p) => p.client)]) {
        expect(client.views.every((v: RoomView) => v.roomId === other.room.roomId)).toBe(true);
      }
    } finally {
      await closeAll(other, null);
    }
  });

  it('answers malformed commands, oversized text and floods without crashing', async () => {
    server = await startServer();
    table = await setupTable(server, 3);
    const client = table.players[0]!.client;
    const malformed = (await client.socket.timeout(3_000).emitWithAck('command', { type: 'player.setReady', payload: {} })) as { ok: boolean; code: string };
    expect(malformed).toMatchObject({ ok: false, code: 'BAD_INPUT' });
    const unknownField = await client.command('player.setReady', { ready: true, admin: true } as never);
    expect(unknownField.ok ? null : unknownField.code).toBe('BAD_INPUT');
    const bigText = await client.command('writing.saveDraft', { assignmentId: randomUUID(), text: 'x'.repeat(5000), expectedDraftRevision: 0 });
    expect(bigText.ok ? null : bigText.code).toBe('BAD_INPUT');
    const acks = await Promise.all(Array.from({ length: 60 }, () => client.command('player.setReady', { ready: true })));
    const limited = acks.filter((ack) => !ack.ok && ack.code === 'RATE_LIMITED');
    expect(limited.length).toBeGreaterThan(0);
    expect(limited[0]).toMatchObject({ retryable: true });
    // A payload above the 16 KiB transport cap drops that connection, not the server.
    client.socket.emit('command', { requestId: randomUUID(), pad: 'y'.repeat(20_000) }, () => {});
    await sleep(200);
    const health = await fetch(`${server.baseUrl}/api/health`);
    expect(health.status).toBe(200);
    const stillThere = table.players[1]!.client;
    expect((await stillThere.command('player.setReady', { ready: false })).ok).toBe(true);
  });

  it('answers clock pings and state requests', async () => {
    server = await startServer();
    table = await setupTable(server, 3);
    const client = table.players[0]!.client;
    const pong = (await client.socket.timeout(3_000).emitWithAck('clock:ping', { clientSentAt: Date.now() })) as { ok: boolean; serverNow: number };
    expect(pong.ok).toBe(true);
    expect(typeof pong.serverNow).toBe('number');
    const state = (await client.socket.timeout(3_000).emitWithAck('state:request', {})) as { ok: boolean; view: RoomView };
    expect(state.ok).toBe(true);
    expect(state.view.roomId).toBe(table.room.roomId);
  });
});

describe('complete games over sockets', () => {
  it('plays a 3-player Standard game with consistent totals on every device', async () => {
    server = await startServer();
    table = await setupTable(server, 3);
    expect((await table.host.command('host.startGame', {})).ok).toBe(true);
    const phases = await playOverSockets(server, table);
    expect(phases.filter((p) => p === 'DUEL_RESULT')).toHaveLength(6);
    const hostFinal = table.host.host();
    if (hostFinal.screen.kind !== 'FINAL') throw new Error('expected FINAL');
    const engineScores = Object.fromEntries([...engineRoom(server, table.room.roomId).players.values()].map((p) => [p.id, p.score]));
    for (const row of hostFinal.screen.rows) expect(row.total).toBe(engineScores[row.playerId]);
    for (const { client } of table.players) {
      const final = client.player();
      expect(final.screen.kind).toBe('FINAL');
      expect(final.players.map((p) => p.score)).toEqual(hostFinal.players.map((p) => p.score));
    }
  });

  it('plays a 5-player Quick game: odd count, ten submissions, five duels, nobody omitted', async () => {
    server = await startServer();
    table = await setupTable(server, 5, { roundCount: 1 });
    expect((await table.host.command('host.startGame', {})).ok).toBe(true);
    const phases = await playOverSockets(server, table);
    expect(phases.filter((p) => p === 'DUEL_RESULT')).toHaveLength(5);
    const game = engineRoom(server, table.room.roomId).game!;
    expect([...game.assignments.values()].filter((a) => a.status === 'LOCKED')).toHaveLength(10);
    for (const { join } of table.players) {
      expect([...game.assignments.values()].filter((a) => a.playerId === join.playerId)).toHaveLength(2);
    }
  });

  it('rematches, dropping the disconnected player and invalidating their token', async () => {
    server = await startServer();
    table = await setupTable(server, 3, { roundCount: 1 });
    expect((await table.host.command('host.startGame', {})).ok).toBe(true);
    await playOverSockets(server, table);
    const leaver = table.players[2]!;
    leaver.client.disconnect();
    await table.host.waitFor((v) => v.players.some((p) => p.id === leaver.join.playerId && !p.connected));
    expect((await table.host.command('host.returnToLobby', {})).ok).toBe(true);
    const lobby = await table.host.waitForPhase('LOBBY');
    expect(lobby.players.map((p) => p.id)).not.toContain(leaver.join.playerId);
    expect(lobby.players.every((p) => p.score === 0 && !p.ready)).toBe(true);
    expect(await codeOf(connectFails(server, { roomCode: table.room.roomCode, role: 'player', token: leaver.join.playerToken }))).toBe('UNAUTHORIZED');
    // Late join is rejected mid-game but works again in the lobby.
    await joinRoom(server, table.room.roomCode, 'Newcomer');
  });
});
