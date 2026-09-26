import {
  ApiErrorSchema,
  CreateRoomResponseSchema,
  JoinRoomResponseSchema,
  RoomPreviewSchema,
  type AvatarId,
  type CreateRoomResponse,
  type ErrorCode,
  type JoinRoomResponse,
  type RoomPreview,
  type RoomSettings,
} from '@larpbox/shared';
import type { z } from 'zod';

/** Relative, same-origin requests only: never hardcode localhost. */

export type HttpFailureKind = 'api' | 'network' | 'timeout';

export class HttpFailure extends Error {
  constructor(
    readonly kind: HttpFailureKind,
    message: string,
    readonly code: ErrorCode | null = null,
    readonly details: { status?: number; fieldErrors?: Record<string, string>; retryAfterMs?: number; requestId?: string } = {},
  ) {
    super(message);
  }

  get retryable(): boolean {
    return this.kind !== 'api' || this.code === 'RATE_LIMITED' || this.code === 'INTERNAL_ERROR' || this.code === 'ROOM_CAPACITY';
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

async function request<S extends z.ZodType>(
  method: 'GET' | 'POST',
  path: string,
  schema: S,
  body?: unknown,
): Promise<z.infer<S>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    const init: RequestInit = { method, signal: controller.signal, headers: { accept: 'application/json' } };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers = { accept: 'application/json', 'content-type': 'application/json' };
    }
    response = await fetch(path, init);
  } catch {
    if (controller.signal.aborted) throw new HttpFailure('timeout', 'The server took too long to answer.');
    throw new HttpFailure('network', "Couldn't reach the game server. Check your connection.");
  } finally {
    clearTimeout(timer);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(payload);
    if (parsed.success) {
      const details: HttpFailure['details'] = { status: response.status, requestId: parsed.data.requestId };
      if (parsed.data.error.fieldErrors) details.fieldErrors = parsed.data.error.fieldErrors;
      if (parsed.data.error.retryAfterMs !== undefined) details.retryAfterMs = parsed.data.error.retryAfterMs;
      throw new HttpFailure('api', parsed.data.error.message, parsed.data.error.code, details);
    }
    throw new HttpFailure('api', `The server answered ${response.status}.`, 'INTERNAL_ERROR', { status: response.status });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new HttpFailure('api', 'The server sent something unexpected.', 'INTERNAL_ERROR');
  return parsed.data;
}

/** Retries network failures and timeouts with the same request ID (idempotent on the server). */
async function withRetries<T>(attempt: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i <= retries; i += 1) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      if (!(error instanceof HttpFailure) || error.kind === 'api') throw error;
      await new Promise((resolve) => setTimeout(resolve, 600 * (i + 1)));
    }
  }
  throw lastError;
}

export function createRoom(createRequestId: string, settings: RoomSettings): Promise<CreateRoomResponse> {
  return withRetries(() => request('POST', '/api/rooms', CreateRoomResponseSchema, { createRequestId, settings }));
}

export function previewRoom(code: string): Promise<RoomPreview> {
  return request('GET', `/api/rooms/${encodeURIComponent(code)}`, RoomPreviewSchema);
}

export function joinRoom(
  code: string,
  joinRequestId: string,
  name: string,
  avatarId: AvatarId,
): Promise<JoinRoomResponse> {
  return withRetries(() =>
    request('POST', `/api/rooms/${encodeURIComponent(code)}/players`, JoinRoomResponseSchema, {
      joinRequestId,
      name,
      avatarId,
    }),
  );
}
