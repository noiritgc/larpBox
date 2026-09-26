import type { CloseReason, ErrorCode } from './constants.js';
import type { HostView, PlayerView, RoomView } from './dto.js';
import type { CommandEnvelope } from './schemas.js';

export interface AckSuccess<D = unknown> {
  ok: true;
  requestId: string;
  revision: number;
  serverNow: number;
  data?: D;
}

export interface AckFailure {
  ok: false;
  requestId: string;
  code: ErrorCode;
  message: string;
  retryable: boolean;
  fieldErrors?: Record<string, string>;
  retryAfterMs?: number;
}

export type Ack<D = unknown> = AckSuccess<D> | AckFailure;

/** `data` returned by successful writing commands. */
export interface DraftAckData {
  assignmentId: string;
  draftRevision: number;
  status: 'DRAFT' | 'LOCKED';
}

export interface RoomClosedPayload {
  reason: CloseReason;
  message: string;
}

export interface SessionReplacedPayload {
  message: string;
}

export interface ProtocolErrorPayload {
  code: ErrorCode;
  message: string;
}

export type StateResponse =
  | { ok: true; view: RoomView }
  | { ok: false; code: ErrorCode; message: string; retryAfterMs?: number };

export type ClockPong =
  | { ok: true; serverNow: number }
  | { ok: false; code: ErrorCode; retryAfterMs?: number };

/** Data attached to a Socket.IO `connect_error` produced by server-side authentication. */
export interface ConnectErrorData {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

export interface ServerToClientEvents {
  'room:state': (view: HostView | PlayerView) => void;
  'room:closed': (payload: RoomClosedPayload) => void;
  'session:replaced': (payload: SessionReplacedPayload) => void;
  'protocol:error': (payload: ProtocolErrorPayload) => void;
}

export interface ClientToServerEvents {
  command: (envelope: CommandEnvelope, ack: (ack: Ack) => void) => void;
  'state:request': (payload: Record<string, never>, ack: (response: StateResponse) => void) => void;
  'clock:ping': (payload: { clientSentAt: number }, ack: (response: ClockPong) => void) => void;
}
