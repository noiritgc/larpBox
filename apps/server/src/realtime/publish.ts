import type { RoomClosedPayload, RoomView } from '@larpbox/shared';
import type { Clock } from '../game/clock.js';
import type { Audience, GameEngine, Publisher } from '../game/engine.js';
import { projectHost, projectPlayer, type ProjectionContext } from '../game/projections.js';
import type { RoomEntry, SessionRecord } from '../game/types.js';
import type { LarpboxServer, LarpboxSocket } from './types.js';

export function projectionContext(engine: GameEngine, clock: Clock, publicOrigin: string): ProjectionContext {
  return {
    bootId: engine.bootId,
    publicOrigin,
    nowEpochMs: clock.nowEpochMs(),
    nowMonotonicMs: clock.nowMonotonicMs(),
    timeScale: engine.timeScale,
  };
}

/** The one complete view a session may see right now. */
export function viewForSession(entry: RoomEntry, session: SessionRecord, ctx: ProjectionContext): RoomView {
  if (session.role === 'host') return projectHost(entry, ctx);
  if (!session.playerId) throw new Error('player session without a player');
  return projectPlayer(entry, session.playerId, ctx);
}

/**
 * Delivers individually projected snapshots to each active session. Private snapshots never go to
 * a shared room broadcast: Socket.IO rooms are routing tools, not authorization.
 */
export function createSocketPublisher(deps: {
  io: LarpboxServer;
  engine: GameEngine;
  clock: Clock;
  publicOrigin: string;
}): Publisher {
  const { io, engine, clock, publicOrigin } = deps;

  const socketOf = (session: SessionRecord): LarpboxSocket | undefined =>
    session.activeSocketId ? io.sockets.sockets.get(session.activeSocketId) : undefined;

  const endSocket = (socket: LarpboxSocket, payload: RoomClosedPayload) => {
    socket.data.ended = true;
    socket.emit('room:closed', payload);
    socket.disconnect(true);
  };

  return {
    publish(entry: RoomEntry, audience: Audience) {
      const ctx = projectionContext(engine, clock, publicOrigin);
      for (const session of entry.room.sessions.values()) {
        if (audience.kind === 'player' && session.playerId !== audience.playerId) continue;
        if (audience.kind === 'session' && session.id !== audience.sessionId) continue;
        const socket = socketOf(session);
        if (!socket) continue;
        socket.emit('room:state', viewForSession(entry, session, ctx));
      }
    },
    roomClosed(entry: RoomEntry, payload: RoomClosedPayload) {
      for (const session of entry.room.sessions.values()) {
        const socket = socketOf(session);
        if (socket) endSocket(socket, payload);
      }
    },
    sessionRevoked(_entry: RoomEntry, session: SessionRecord, payload: RoomClosedPayload) {
      const socket = socketOf(session);
      if (socket) endSocket(socket, payload);
    },
  };
}
