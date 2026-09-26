import type { ClientToServerEvents, ServerToClientEvents } from '@larpbox/shared';
import type { Server, Socket } from 'socket.io';

export interface SocketData {
  roomId: string;
  sessionId: string;
  role: 'host' | 'player';
  playerId: string | null;
  clientInstanceId: string;
  takeover: boolean;
  /** Connection generation assigned on attach; -1 until then. */
  generation: number;
  /** The room ended or this session was revoked; skip disconnect bookkeeping. */
  ended?: boolean;
}

export type LarpboxServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type LarpboxSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
