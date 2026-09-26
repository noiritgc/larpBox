import {
  HostViewSchema,
  PROTOCOL_VERSION,
  PlayerViewSchema,
  type Ack,
  type AckFailure,
  type ClientToServerEvents,
  type ClockPong,
  type CommandPayload,
  type CommandType,
  type ConnectErrorData,
  type RoomClosedPayload,
  type RoomView,
  type ServerToClientEvents,
  type StateResponse,
} from '@larpbox/shared';
import { io, type Socket } from 'socket.io-client';
import { serverClock } from './clock';
import { CLIENT_INSTANCE_ID, uuid } from './ids';

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'in-use'
  | 'replaced'
  | 'closed'
  | 'unauthorized'
  | 'outdated'
  | 'error';

export interface StatusDetail {
  code: string;
  message: string;
  retryAfterMs?: number;
}

/** A command that never reached the server or never got an answer. */
export interface LocalFailure {
  ok: false;
  requestId: string;
  code: 'OFFLINE' | 'TIMEOUT' | 'PHASE_CHANGED';
  message: string;
  retryable: true;
}

export type CommandResult = Ack | LocalFailure;
export type CommandFailure = AckFailure | LocalFailure;

export interface ConnectionCallbacks {
  onView(view: RoomView): void;
  onStatus(status: ConnectionStatus, detail?: StatusDetail): void;
  onClosed(payload: RoomClosedPayload): void;
}

const ACK_TIMEOUT_MS = 3_000;
const MAX_RETRIES = 2;
const CLOCK_INTERVAL_MS = 15_000;

/**
 * One Socket.IO connection for one mounted room screen. Recovery is always token + fresh snapshot;
 * gameplay commands are never queued while offline (the default send buffer is cleared).
 */
export class RoomConnection {
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  private takeover = false;
  private destroyed = false;
  private hasConnected = false;
  private terminal = false;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private clockInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly options: {
      role: 'host' | 'player';
      roomCode: string;
      token: string;
      getView: () => RoomView | null;
      callbacks: ConnectionCallbacks;
    },
  ) {
    this.socket = io({
      path: '/socket.io',
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4_000,
      randomizationFactor: 0.3,
      timeout: 10_000,
      auth: (cb) =>
        cb({
          protocolVersion: PROTOCOL_VERSION,
          roomCode: options.roomCode,
          role: options.role,
          token: options.token,
          clientInstanceId: CLIENT_INSTANCE_ID,
          takeover: this.takeover,
        }),
    });
    this.bind();
  }

  private get callbacks(): ConnectionCallbacks {
    return this.options.callbacks;
  }

  private bind(): void {
    const socket = this.socket;
    socket.on('connect', () => {
      this.hasConnected = true;
      this.takeover = false;
      this.callbacks.onStatus('connected');
      this.startClockSync();
    });
    socket.on('disconnect', (reason) => {
      // Never let a gameplay command sit in the buffer and fire after reconnecting.
      socket.sendBuffer = [];
      this.stopClockSync();
      if (this.destroyed || this.terminal) return;
      if (reason === 'io client disconnect') return;
      if (reason === 'io server disconnect') {
        this.callbacks.onStatus('error', { code: 'DISCONNECTED', message: 'The server closed the connection.' });
        return;
      }
      this.callbacks.onStatus('reconnecting');
    });
    socket.on('connect_error', (error: Error & { data?: ConnectErrorData }) => {
      if (this.destroyed) return;
      if (socket.active) {
        this.callbacks.onStatus(this.hasConnected ? 'reconnecting' : 'connecting');
        return;
      }
      const data = error.data;
      const code = data?.code ?? 'INTERNAL_ERROR';
      const message = data?.message ?? 'Could not connect.';
      switch (code) {
        case 'SESSION_IN_USE':
          this.callbacks.onStatus('in-use', { code, message });
          return;
        case 'UNAUTHORIZED':
        case 'FORBIDDEN':
          this.terminal = true;
          this.callbacks.onStatus('unauthorized', { code, message });
          return;
        case 'ROOM_NOT_FOUND':
        case 'ROOM_ENDED':
          this.terminal = true;
          this.callbacks.onClosed({ reason: 'EXPIRED', message: 'This room has ended. Ask the host for a new code.' });
          return;
        case 'PROTOCOL_MISMATCH':
          this.terminal = true;
          this.callbacks.onStatus('outdated', { code, message });
          return;
        default: {
          const retryAfterMs = Math.max(1_000, data?.retryAfterMs ?? 3_000);
          this.callbacks.onStatus('error', { code, message, retryAfterMs });
          this.later(retryAfterMs, () => this.connect());
        }
      }
    });
    socket.on('room:state', (raw) => {
      const schema = this.options.role === 'host' ? HostViewSchema : PlayerViewSchema;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        console.error('Ignoring a snapshot that does not match the protocol', parsed.error.issues.slice(0, 3));
        return;
      }
      serverClock.observeSnapshot(parsed.data.serverNow);
      this.callbacks.onView(parsed.data);
    });
    socket.on('room:closed', (payload) => {
      this.terminal = true;
      this.callbacks.onClosed(payload);
    });
    socket.on('session:replaced', () => {
      this.terminal = true;
      socket.disconnect();
      this.callbacks.onStatus('replaced', { code: 'SESSION_REPLACED', message: 'This player is active in another tab.' });
    });
    socket.on('protocol:error', (payload) => {
      if (payload.code === 'SESSION_IN_USE') {
        this.callbacks.onStatus('in-use', { code: payload.code, message: payload.message });
      }
    });
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }

  start(): void {
    this.callbacks.onStatus('connecting');
    this.connect();
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.onPageHide);
      window.addEventListener('pageshow', this.onPageShow);
      document.addEventListener('visibilitychange', this.onVisibility);
    }
  }

  private connect(): void {
    if (this.destroyed || this.socket.connected) return;
    this.socket.connect();
  }

  /** Deliberate "Use this tab": take the session over from another tab. */
  takeOver(): void {
    this.terminal = false;
    this.takeover = true;
    this.callbacks.onStatus('connecting');
    this.connect();
  }

  retry(): void {
    this.terminal = false;
    this.callbacks.onStatus('connecting');
    this.connect();
  }

  private readonly onPageHide = () => {
    // Free the session immediately so a refresh does not look like a second tab.
    this.socket.disconnect();
  };

  private readonly onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted && !this.terminal) this.retry();
  };

  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible' && this.socket.connected) void this.ping();
  };

  destroy(): void {
    this.destroyed = true;
    this.stopClockSync();
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onPageHide);
      window.removeEventListener('pageshow', this.onPageShow);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
    this.socket.removeAllListeners();
    this.socket.disconnect();
  }

  get connected(): boolean {
    return this.socket.connected;
  }

  /** Builds an envelope for the current phase with a new request ID (a new user decision). */
  command<T extends CommandType>(
    type: T,
    payload: CommandPayload<T>,
    options: { requestId?: string } = {},
  ): Promise<CommandResult> {
    const view = this.options.getView();
    const requestId = options.requestId ?? uuid();
    if (!view) {
      return Promise.resolve(this.localFailure(requestId, 'OFFLINE', 'Still connecting. Try again in a moment.'));
    }
    return this.sendEnvelope({ requestId, phaseId: view.phase.id, gameId: view.gameId, type, payload });
  }

  /** Sends one logical action; retries reuse the same request ID, only while connected and relevant. */
  async sendEnvelope(envelope: {
    requestId: string;
    phaseId: string;
    gameId: string | null;
    type: CommandType;
    payload: unknown;
  }): Promise<CommandResult> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      if (!this.socket.connected) {
        return this.localFailure(envelope.requestId, 'OFFLINE', 'Reconnecting… your work is saved on this phone.');
      }
      const current = this.options.getView();
      if (attempt > 0 && current && current.phase.id !== envelope.phaseId) {
        return this.localFailure(envelope.requestId, 'PHASE_CHANGED', 'The game moved on.');
      }
      try {
        const ack = await this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck('command', envelope as never);
        return ack;
      } catch {
        // Ack timeout: retry with the same request ID.
      }
    }
    return this.localFailure(envelope.requestId, 'TIMEOUT', "The server didn't answer. Try again.");
  }

  async requestState(): Promise<void> {
    if (!this.socket.connected) return;
    try {
      const response: StateResponse = await this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck('state:request', {});
      if (response.ok) {
        const schema = this.options.role === 'host' ? HostViewSchema : PlayerViewSchema;
        const parsed = schema.safeParse(response.view);
        if (parsed.success) this.callbacks.onView(parsed.data);
      }
    } catch {
      // A later snapshot will arrive anyway.
    }
  }

  private localFailure(requestId: string, code: LocalFailure['code'], message: string): LocalFailure {
    return { ok: false, requestId, code, message, retryable: true };
  }

  private async ping(): Promise<void> {
    const sentAt = Date.now();
    try {
      const pong: ClockPong = await this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck('clock:ping', { clientSentAt: sentAt });
      if (pong.ok) serverClock.observePing(sentAt, pong.serverNow, Date.now());
    } catch {
      // Keep the previous estimate.
    }
  }

  private startClockSync(): void {
    this.stopClockSync();
    void this.ping();
    this.later(350, () => void this.ping());
    this.later(700, () => void this.ping());
    this.clockInterval = setInterval(() => void this.ping(), CLOCK_INTERVAL_MS);
  }

  private stopClockSync(): void {
    if (this.clockInterval) clearInterval(this.clockInterval);
    this.clockInterval = null;
  }
}
