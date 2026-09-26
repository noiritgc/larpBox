import {
  CreateRoomRequestSchema,
  JoinRoomRequestSchema,
  PROTOCOL_VERSION,
  fieldErrorsFrom,
  isRoomCode,
  normalizeRoomCode,
  type HealthResponse,
} from '@larpbox/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { GameError, type GameEngine } from '../game/engine.js';
import type { OriginPolicy } from '../security/origins.js';
import type { RateLimiters } from '../security/rateLimits.js';
import { sendApiError } from './errors.js';
import { rateLimit, requireAllowedOrigin } from './limits.js';

export interface RouteDeps {
  engine: GameEngine;
  limiters: RateLimiters;
  originPolicy: OriginPolicy;
  clientIp: (req: Request) => string;
  version: string;
  /** Development: origin errors name the origin and the setting to change. */
  verboseErrors: boolean;
  /** True once shutdown has begun: no new rooms. */
  isShuttingDown: () => boolean;
}

function handleGameError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof GameError) {
    const options: { fieldErrors?: Record<string, string>; retryAfterMs?: number } = {};
    if (error.extras.fieldErrors) options.fieldErrors = error.extras.fieldErrors;
    if (error.extras.retryAfterMs !== undefined) options.retryAfterMs = error.extras.retryAfterMs;
    sendApiError(res, error.code, error.message, options);
    return;
  }
  next(error);
}

/**
 * Bootstrap-only HTTP API: create, preview, join and health. There are deliberately no scoring or
 * voting endpoints; every game mutation goes through an authenticated socket.
 */
export function createApiRouter(deps: RouteDeps): Router {
  const { engine, limiters, originPolicy, clientIp } = deps;
  const router = Router();

  router.get('/health', (_req, res) => {
    const body: HealthResponse = {
      ok: true,
      protocolVersion: PROTOCOL_VERSION,
      bootId: engine.bootId,
      version: deps.version,
    };
    res.json(body);
  });

  router.post(
    '/rooms',
    requireAllowedOrigin(originPolicy, { verbose: deps.verboseErrors }),
    rateLimit(limiters.create, clientIp),
    (req, res, next) => {
      if (deps.isShuttingDown()) {
        sendApiError(res, 'ROOM_CAPACITY', 'The server is restarting. Try again in a minute.');
        return;
      }
      const parsed = CreateRoomRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 'BAD_INPUT', 'Those room settings are not valid.', {
          fieldErrors: fieldErrorsFrom(parsed.error),
        });
        return;
      }
      try {
        const response = engine.createRoom(parsed.data.createRequestId, parsed.data.settings);
        res.status(201).json(response);
      } catch (error) {
        handleGameError(error, res, next);
      }
    },
  );

  router.get('/rooms/:code', rateLimit(limiters.preview, clientIp), (req, res, next) => {
    const code = normalizeRoomCode(String(req.params.code));
    if (!isRoomCode(code)) {
      sendApiError(res, 'ROOM_NOT_FOUND', 'Room codes are four letters.');
      return;
    }
    try {
      res.json(engine.previewRoom(code));
    } catch (error) {
      handleGameError(error, res, next);
    }
  });

  router.post(
    '/rooms/:code/players',
    requireAllowedOrigin(originPolicy, { verbose: deps.verboseErrors }),
    rateLimit(limiters.join, clientIp),
    (req, res, next) => {
      const code = normalizeRoomCode(String(req.params.code));
      if (!isRoomCode(code)) {
        sendApiError(res, 'ROOM_NOT_FOUND', 'Room codes are four letters.');
        return;
      }
      const parsed = JoinRoomRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 'BAD_INPUT', 'Check your name and avatar.', {
          fieldErrors: fieldErrorsFrom(parsed.error),
        });
        return;
      }
      try {
        const response = engine.joinRoom(code, {
          requestId: parsed.data.joinRequestId,
          name: parsed.data.name,
          avatarId: parsed.data.avatarId,
        });
        res.status(201).json(response);
      } catch (error) {
        handleGameError(error, res, next);
      }
    },
  );

  return router;
}
