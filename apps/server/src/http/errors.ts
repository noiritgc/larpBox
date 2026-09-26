import type { ApiError, ErrorCode } from '@larpbox/shared';
import type { ErrorRequestHandler, Response } from 'express';
import type { Logger } from '../logger.js';

export const HTTP_STATUS: Record<ErrorCode, number> = {
  BAD_INPUT: 400,
  NOT_FOUND: 404,
  ROOM_NOT_FOUND: 404,
  ROOM_ENDED: 410,
  ROOM_FULL: 409,
  ROOM_CAPACITY: 503,
  GAME_STARTED: 409,
  NAME_TAKEN: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  PROTOCOL_MISMATCH: 400,
  SESSION_IN_USE: 409,
  SESSION_REPLACED: 409,
  PHASE_CHANGED: 409,
  GAME_PAUSED: 409,
  DEADLINE_PASSED: 409,
  ALREADY_LOCKED: 409,
  REVISION_CONFLICT: 409,
  REQUEST_CONFLICT: 409,
  REQUEST_EXPIRED: 410,
  CHOICE_UNAVAILABLE: 409,
  CONFIG_INVALID: 400,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

const RETRYABLE = new Set<ErrorCode>(['RATE_LIMITED', 'ROOM_CAPACITY', 'INTERNAL_ERROR']);

export class HttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly options: { fieldErrors?: Record<string, string>; retryAfterMs?: number } = {},
  ) {
    super(message);
  }
}

export function requestIdOf(res: Response): string {
  const id: unknown = res.locals['requestId'];
  return typeof id === 'string' ? id : 'unknown';
}

export function sendApiError(
  res: Response,
  code: ErrorCode,
  message: string,
  options: { fieldErrors?: Record<string, string>; retryAfterMs?: number; status?: number } = {},
): void {
  const body: ApiError = {
    error: { code, message, retryable: RETRYABLE.has(code) },
    requestId: requestIdOf(res),
  };
  if (options.fieldErrors) body.error.fieldErrors = options.fieldErrors;
  if (options.retryAfterMs !== undefined) {
    body.error.retryAfterMs = options.retryAfterMs;
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(options.retryAfterMs / 1000))));
  }
  res
    .status(options.status ?? HTTP_STATUS[code])
    .setHeader('Cache-Control', 'no-store')
    .json(body);
}

/** Final API error handler: structured errors, never stack traces. */
export function apiErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof HttpError) {
      sendApiError(res, error.code, error.message, error.options);
      return;
    }
    const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : 500;
    const type = typeof error === 'object' && error !== null && 'type' in error ? error.type : null;
    if (type === 'entity.too.large' || status === 413) {
      sendApiError(res, 'BAD_INPUT', 'That request is too large.', { status: 413 });
      return;
    }
    if (type === 'entity.parse.failed' || status === 400) {
      sendApiError(res, 'BAD_INPUT', 'The request body must be valid JSON.');
      return;
    }
    logger.error({ err: error, requestId: requestIdOf(res) }, 'http.unhandled_error');
    sendApiError(res, 'INTERNAL_ERROR', 'Something went wrong on our side. Try again.');
  };
}
