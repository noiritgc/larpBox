import type { IncomingMessage } from 'node:http';
import { PROTOCOL_VERSION, SocketAuthSchema, type ConnectErrorData, type ErrorCode } from '@larpbox/shared';
import { GameError, type GameEngine } from '../game/engine.js';
import type { Logger } from '../logger.js';
import type { RateLimiters } from '../security/rateLimits.js';
import type { LarpboxSocket } from './types.js';

const RETRYABLE = new Set<ErrorCode>(['RATE_LIMITED', 'ROOM_CAPACITY', 'INTERNAL_ERROR']);

function connectError(code: ErrorCode, message: string, retryAfterMs?: number): Error {
  const error = new Error(message) as Error & { data: ConnectErrorData };
  error.data = { code, message, retryable: RETRYABLE.has(code) };
  if (retryAfterMs !== undefined) error.data.retryAfterMs = retryAfterMs;
  return error;
}

/**
 * Handshake authentication: protocol, room, token hash, role and revocation. The acting player is
 * derived from the token, never from anything the client claims. Errors surface to the client as
 * `connect_error` with structured `data`.
 */
export function createAuthMiddleware(deps: {
  engine: GameEngine;
  limiters: RateLimiters;
  logger: Logger;
  clientIp: (req: IncomingMessage) => string;
  maxSockets: number;
  activeSocketCount: () => number;
  isSocketLive: (socketId: string) => boolean;
}) {
  return (socket: LarpboxSocket, next: (error?: Error) => void): void => {
    if (deps.activeSocketCount() >= deps.maxSockets) {
      next(connectError('ROOM_CAPACITY', 'The server is at capacity. Try again shortly.', 5_000));
      return;
    }
    const limit = deps.limiters.auth.take(deps.clientIp(socket.request));
    if (!limit.ok) {
      next(connectError('RATE_LIMITED', 'Too many connection attempts. Wait a moment.', limit.retryAfterMs));
      return;
    }
    const auth: unknown = socket.handshake.auth;
    const parsed = SocketAuthSchema.safeParse(auth);
    if (!parsed.success) {
      const version =
        typeof auth === 'object' && auth !== null && 'protocolVersion' in auth ? auth.protocolVersion : undefined;
      if (version !== undefined && version !== PROTOCOL_VERSION) {
        next(connectError('PROTOCOL_MISMATCH', 'This page is out of date. Reload to continue.'));
      } else {
        next(connectError('BAD_INPUT', 'Missing or malformed connection details.'));
      }
      return;
    }
    try {
      const { entry, session } = deps.engine.authenticate(parsed.data);
      deps.engine.checkSessionAvailable(session, parsed.data.clientInstanceId, parsed.data.takeover, deps.isSocketLive);
      socket.data = {
        roomId: entry.room.id,
        sessionId: session.id,
        role: session.role,
        playerId: session.playerId,
        clientInstanceId: parsed.data.clientInstanceId,
        takeover: parsed.data.takeover,
        generation: -1,
      };
      next();
    } catch (error) {
      if (error instanceof GameError) {
        next(connectError(error.code, error.message));
        return;
      }
      deps.logger.error({ err: error }, 'socket.auth_failed');
      next(connectError('INTERNAL_ERROR', 'Something went wrong on our side. Try again.'));
    }
  };
}
