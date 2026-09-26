import { randomUUID } from 'node:crypto';
import { DEFAULT_SETTINGS, PROTOCOL_VERSION, type CreateRoomResponse, type JoinRoomResponse, type RoomPreview } from '@larpbox/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { api, createRoom, joinRoom, startServer, type TestServer } from './helpers.js';

let server: TestServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

describe('HTTP bootstrap API', () => {
  it('reports health with the boot ID and protocol', async () => {
    server = await startServer();
    const { status, body } = await api<{ ok: boolean; bootId: string; protocolVersion: number }>(server, 'GET', '/api/health');
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, protocolVersion: PROTOCOL_VERSION, bootId: server.service.bootId });
  });

  it('creates a room with a real join URL and host credential, idempotently', async () => {
    server = await startServer();
    const createRequestId = randomUUID();
    const request = { createRequestId, settings: DEFAULT_SETTINGS };
    const first = await api<CreateRoomResponse>(server, 'POST', '/api/rooms', request);
    expect(first.status).toBe(201);
    expect(first.body.roomCode).toMatch(/^[A-HJ-NP-Z]{4}$/);
    expect(first.body.joinUrl).toBe(`http://larpbox.test/join/${first.body.roomCode}`);
    expect(first.body.hostToken.length).toBeGreaterThanOrEqual(43);
    const again = await api<CreateRoomResponse>(server, 'POST', '/api/rooms', request);
    expect(again.body).toEqual(first.body);
    const conflict = await api(server, 'POST', '/api/rooms', { createRequestId, settings: { ...DEFAULT_SETTINGS, roundCount: 1 } });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error?.code).toBe('REQUEST_CONFLICT');
    expect(server.service.engine.store.size).toBe(1);
  });

  it('validates settings strictly', async () => {
    server = await startServer();
    const bad = await api(server, 'POST', '/api/rooms', { createRequestId: randomUUID(), settings: { ...DEFAULT_SETTINGS, secondsPerPost: 30 } });
    expect(bad.status).toBe(400);
    expect(bad.body.error?.code).toBe('BAD_INPUT');
    expect(bad.body.error?.fieldErrors).toBeDefined();
    // The retired per-round writing setting is an unknown key now, and settings are strict.
    const stale = await api(server, 'POST', '/api/rooms', { createRequestId: randomUUID(), settings: { ...DEFAULT_SETTINGS, writingSeconds: 90 } });
    expect(stale.status).toBe(400);
    const extra = await api(server, 'POST', '/api/rooms', { createRequestId: randomUUID(), settings: DEFAULT_SETTINGS, admin: true });
    expect(extra.status).toBe(400);
  });

  it('previews rooms without names or secrets', async () => {
    server = await startServer();
    const room = await createRoom(server);
    await joinRoom(server, room.roomCode, 'Alex');
    const preview = await api<RoomPreview>(server, 'GET', `/api/rooms/${room.roomCode.toLowerCase()}`);
    expect(preview.status).toBe(200);
    expect(preview.body).toEqual({ roomCode: room.roomCode, state: 'LOBBY', playerCount: 1, maxPlayers: 8, canJoin: true });
    const missing = await api(server, 'GET', '/api/rooms/ZZZZ');
    expect(missing.status).toBe(404);
    expect(missing.body.error?.code).toBe('ROOM_NOT_FOUND');
  });

  it('joins idempotently and rejects duplicate names atomically under concurrency', async () => {
    server = await startServer();
    const room = await createRoom(server);
    const joinRequestId = randomUUID();
    const body = { joinRequestId, name: 'Alex', avatarId: 'coffee' };
    const [a, b] = await Promise.all([
      api<JoinRoomResponse>(server, 'POST', `/api/rooms/${room.roomCode}/players`, body),
      api<JoinRoomResponse>(server, 'POST', `/api/rooms/${room.roomCode}/players`, body),
    ]);
    expect(a.status).toBe(201);
    expect(b.body).toEqual(a.body);
    const results = await Promise.all(
      ['sam', 'SAM', ' Sam '].map((name) =>
        api(server!, 'POST', `/api/rooms/${room.roomCode}/players`, { joinRequestId: randomUUID(), name, avatarId: 'plant' }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.body.error?.code === 'NAME_TAKEN')).toHaveLength(2);
  });

  it('fills exactly eight seats when nine people join at once', async () => {
    server = await startServer();
    const room = await createRoom(server);
    const results = await Promise.all(
      Array.from({ length: 9 }, (_, i) =>
        api(server!, 'POST', `/api/rooms/${room.roomCode}/players`, { joinRequestId: randomUUID(), name: `Player ${i}`, avatarId: 'ladder' }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(8);
    const full = results.filter((r) => r.status === 409);
    expect(full).toHaveLength(1);
    expect(full[0]?.body.error?.code).toBe('ROOM_FULL');
  });

  it('rejects cross-origin browser mutations but allows the configured origin', async () => {
    server = await startServer({ allowedOrigins: ['http://larpbox.test'] });
    const body = { createRequestId: randomUUID(), settings: DEFAULT_SETTINGS };
    const evil = await api(server, 'POST', '/api/rooms', body, { origin: 'https://evil.example' });
    expect(evil.status).toBe(403);
    expect(evil.body.error?.code).toBe('FORBIDDEN');
    const good = await api(server, 'POST', '/api/rooms', body, { origin: 'http://larpbox.test' });
    expect(good.status).toBe(201);
  });

  it('accepts local-network origins in development with an actionable error for others', async () => {
    server = await startServer({ nodeEnv: 'development', allowedOrigins: ['http://localhost:5173'] });
    const body = () => ({ createRequestId: randomUUID(), settings: DEFAULT_SETTINGS });
    const lan = await api(server, 'POST', '/api/rooms', body(), { origin: 'http://10.104.218.84:5173' });
    expect(lan.status).toBe(201);
    const foreign = await api(server, 'POST', '/api/rooms', body(), { origin: 'https://evil.example' });
    expect(foreign.status).toBe(403);
    expect(foreign.body.error?.message).toContain('https://evil.example');
    expect(foreign.body.error?.message).toContain('ALLOWED_ORIGINS');
    await server.close();
    server = await startServer({ nodeEnv: 'production', allowedOrigins: ['http://larpbox.test'] });
    const strict = await api(server, 'POST', '/api/rooms', body(), { origin: 'http://10.104.218.84:5173' });
    expect(strict.status).toBe(403);
    expect(strict.body.error?.message).not.toContain('10.104.218.84');
  });

  it('returns structured errors for malformed and oversized bodies and unknown routes', async () => {
    server = await startServer();
    const malformed = await api(server, 'POST', '/api/rooms', '{"createRequestId":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error?.code).toBe('BAD_INPUT');
    expect(typeof malformed.body.requestId).toBe('string');
    const huge = await api(server, 'POST', '/api/rooms', { createRequestId: randomUUID(), settings: DEFAULT_SETTINGS, pad: 'x'.repeat(9000) });
    expect(huge.status).toBe(413);
    expect(huge.body.error?.code).toBe('BAD_INPUT');
    const unknown = await api(server, 'GET', '/api/nope');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error?.code).toBe('NOT_FOUND');
    // Never a stack trace.
    expect(JSON.stringify(malformed.body)).not.toContain(' at ');
  });

  it('rate-limits room creation per IP with a retry hint', async () => {
    server = await startServer();
    const statuses: number[] = [];
    let retryAfter: number | undefined;
    for (let i = 0; i < 7; i += 1) {
      const response = await api(server, 'POST', '/api/rooms', { createRequestId: randomUUID(), settings: DEFAULT_SETTINGS });
      statuses.push(response.status);
      if (response.status === 429) retryAfter = response.body.error?.retryAfterMs;
    }
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses.slice(5)).toEqual([429, 429]);
    expect(retryAfter).toBeGreaterThan(0);
  });

  it('marks every API response no-store', async () => {
    server = await startServer();
    const response = await fetch(`${server.baseUrl}/api/health`);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
