import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Clock } from '../game/clock.js';
import { GameError, type GameEngine } from '../game/engine.js';
import type { Logger } from '../logger.js';
import type { OriginPolicy } from '../security/origins.js';
import type { RateLimiters } from '../security/rateLimits.js';
import { createAuthMiddleware } from './auth.js';
import { bindSocketHandlers } from './commands.js';
import { createSocketPublisher } from './publish.js';
import type { LarpboxServer, LarpboxSocket } from './types.js';

export const SOCKET_MAX_BUFFER_BYTES = 16 * 1024;

/**
 * One namespace at the default /socket.io path, attached to the same HTTP server as the API.
 * Connection-state recovery stays disabled: reconnection is always token + fresh snapshot.
 */
export function createRealtime(deps: {
  httpServer: HttpServer;
  engine: GameEngine;
  clock: Clock;
  logger: Logger;
  limiters: RateLimiters;
  originPolicy: OriginPolicy;
  clientIp: (req: IncomingMessage) => string;
  publicOrigin: string;
  maxSockets: number;
}): LarpboxServer {
  const { engine, logger } = deps;
  const io: LarpboxServer = new Server(deps.httpServer, {
    serveClient: false,
    maxHttpBufferSize: SOCKET_MAX_BUFFER_BYTES,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    // Browser origin check for both polling and websocket upgrades (CORS alone does not cover it).
    allowRequest: (req, callback) => {
      if (deps.originPolicy.isAllowed(req.headers.origin)) callback(null, true);
      else callback('Origin not allowed', false);
    },
  });

  const isSocketLive = (socketId: string) => io.sockets.sockets.get(socketId)?.connected === true;

  engine.setPublisher(
    createSocketPublisher({ io, engine, clock: deps.clock, publicOrigin: deps.publicOrigin }),
  );

  io.use(
    createAuthMiddleware({
      engine,
      limiters: deps.limiters,
      logger,
      clientIp: deps.clientIp,
      maxSockets: deps.maxSockets,
      activeSocketCount: () => io.sockets.sockets.size,
      isSocketLive,
    }),
  );

  io.on('connection', (socket: LarpboxSocket) => {
    let attached;
    try {
      attached = engine.attach({
        roomId: socket.data.roomId,
        sessionId: socket.data.sessionId,
        socketId: socket.id,
        clientInstanceId: socket.data.clientInstanceId,
        takeover: socket.data.takeover,
        isSocketLive: (id) => id !== socket.id && isSocketLive(id),
      });
    } catch (error) {
      const code = error instanceof GameError ? error.code : 'INTERNAL_ERROR';
      const message = error instanceof Error ? error.message : 'Connection failed.';
      if (!(error instanceof GameError)) logger.error({ err: error }, 'socket.attach_failed');
      socket.emit('protocol:error', { code, message });
      socket.data.ended = true;
      socket.disconnect(true);
      return;
    }
    socket.data.generation = attached.generation;

    if (attached.replacedSocketId) {
      const previous = io.sockets.sockets.get(attached.replacedSocketId);
      if (previous) {
        previous.data.ended = true;
        if (!attached.replacedSameInstance) {
          previous.emit('session:replaced', { message: 'This player is active in another tab.' });
        }
        previous.disconnect(true);
      }
    }

    bindSocketHandlers(socket, {
      engine,
      limiters: deps.limiters,
      logger,
      clock: deps.clock,
      publicOrigin: deps.publicOrigin,
    });

    socket.on('disconnect', () => {
      engine.detach(socket.data.roomId, socket.data.sessionId, socket.id, socket.data.generation);
    });
  });

  return io;
}
