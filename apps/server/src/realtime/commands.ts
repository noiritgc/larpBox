import {
  ClockPingSchema,
  CommandEnvelopeSchema,
  fieldErrorsFrom,
  type Ack,
  type AckFailure,
  type ClockPong,
  type ErrorCode,
  type StateResponse,
} from '@larpbox/shared';
import type { Clock } from '../game/clock.js';
import type { GameEngine } from '../game/engine.js';
import type { Logger } from '../logger.js';
import type { RateLimiters } from '../security/rateLimits.js';
import { projectionContext, viewForSession } from './publish.js';
import type { LarpboxSocket } from './types.js';

function reject(requestId: string, code: ErrorCode, message: string, extra: Partial<AckFailure> = {}): AckFailure {
  return {
    ok: false,
    requestId,
    code,
    message,
    retryable: code === 'RATE_LIMITED' || code === 'INTERNAL_ERROR',
    ...extra,
  };
}

function requestIdOf(raw: unknown): string {
  if (typeof raw === 'object' && raw !== null && 'requestId' in raw && typeof raw.requestId === 'string') {
    return raw.requestId.slice(0, 64);
  }
  return 'unknown';
}

/**
 * Per-socket event handlers. Order for commands: current connection generation, rate limits, exact
 * schema, then the engine (idempotency cache, overdue phase, phase/game match, authorization,
 * synchronous mutation, publish), then the ack, then any post-ack effect.
 */
export function bindSocketHandlers(
  socket: LarpboxSocket,
  deps: {
    engine: GameEngine;
    limiters: RateLimiters;
    logger: Logger;
    clock: Clock;
    publicOrigin: string;
  },
): void {
  const { engine, limiters, logger } = deps;

  const currentSession = () => {
    const found = engine.sessionFor(socket.data.roomId, socket.data.sessionId);
    if (!found) return { found: null, code: 'UNAUTHORIZED' as const };
    const { session } = found;
    if (session.activeSocketId !== socket.id || session.connectionGeneration !== socket.data.generation) {
      return { found: null, code: 'SESSION_REPLACED' as const };
    }
    return { found, code: null };
  };

  socket.on('command', (raw: unknown, ack: unknown) => {
    if (typeof ack !== 'function') {
      socket.emit('protocol:error', { code: 'BAD_INPUT', message: 'Commands need an acknowledgement callback.' });
      return;
    }
    const respond = ack as (response: Ack) => void;
    const requestId = requestIdOf(raw);
    const { found, code } = currentSession();
    if (!found) {
      respond(
        reject(
          requestId,
          code,
          code === 'SESSION_REPLACED' ? 'This player is active in another tab.' : 'This browser is not part of that room.',
        ),
      );
      return;
    }
    const limit = limiters.command.take(socket.data.sessionId);
    if (!limit.ok) {
      respond(reject(requestId, 'RATE_LIMITED', 'Slow down a little.', { retryAfterMs: limit.retryAfterMs }));
      return;
    }
    const parsed = CommandEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      respond(
        reject(requestId, 'BAD_INPUT', 'That action was malformed.', { fieldErrors: fieldErrorsFrom(parsed.error) }),
      );
      return;
    }
    const envelope = parsed.data;
    if (envelope.type === 'writing.saveDraft') {
      const draftLimit = limiters.draft.take(`${socket.data.sessionId}:${envelope.payload.assignmentId}`);
      if (!draftLimit.ok) {
        respond(reject(requestId, 'RATE_LIMITED', 'Saving too often.', { retryAfterMs: draftLimit.retryAfterMs }));
        return;
      }
    }
    let outcome;
    try {
      outcome = engine.executeCommand(socket.data.roomId, socket.data.sessionId, envelope);
    } catch (error) {
      logger.error({ err: error, roomId: socket.data.roomId, type: envelope.type }, 'command.failed');
      respond(reject(requestId, 'INTERNAL_ERROR', 'Something went wrong on our side. Try again.'));
      return;
    }
    respond(outcome.ack);
    outcome.after?.();
  });

  socket.on('state:request', (_payload: unknown, ack: unknown) => {
    if (typeof ack !== 'function') return;
    const respond = ack as (response: StateResponse) => void;
    const limit = limiters.stateRequest.take(socket.data.sessionId);
    if (!limit.ok) {
      respond({ ok: false, code: 'RATE_LIMITED', message: 'Too many refreshes.', retryAfterMs: limit.retryAfterMs });
      return;
    }
    const { found, code } = currentSession();
    if (!found) {
      respond({ ok: false, code, message: 'This session is no longer active.' });
      return;
    }
    engine.advanceIfOverdue(found.entry);
    const ctx = projectionContext(engine, deps.clock, deps.publicOrigin);
    respond({ ok: true, view: viewForSession(found.entry, found.session, ctx) });
  });

  socket.on('clock:ping', (payload: unknown, ack: unknown) => {
    if (typeof ack !== 'function') return;
    const respond = ack as (response: ClockPong) => void;
    if (!ClockPingSchema.safeParse(payload).success) {
      respond({ ok: false, code: 'BAD_INPUT' });
      return;
    }
    const limit = limiters.clockPing.take(socket.data.sessionId);
    if (!limit.ok) {
      respond({ ok: false, code: 'RATE_LIMITED', retryAfterMs: limit.retryAfterMs });
      return;
    }
    respond({ ok: true, serverNow: deps.clock.nowEpochMs() });
  });
}
