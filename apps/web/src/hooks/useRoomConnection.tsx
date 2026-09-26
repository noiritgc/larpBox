import type { RoomClosedPayload } from '@larpbox/shared';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { forgetRoom } from '../lib/session';
import { RoomConnection } from '../lib/socket';
import { useGameStore } from '../store/gameStore';

const ConnectionContext = createContext<RoomConnection | null>(null);

export function ConnectionProvider({ connection, children }: { connection: RoomConnection | null; children: ReactNode }) {
  return <ConnectionContext.Provider value={connection}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): RoomConnection | null {
  return useContext(ConnectionContext);
}

/**
 * Owns the single socket for a mounted room screen. StrictMode's double effect creates and
 * destroys one extra connection; listeners are bound per instance, so nothing is duplicated.
 */
export function useRoomConnection(options: {
  role: 'host' | 'player';
  roomCode: string;
  roomId: string | null;
  token: string | null;
  onClosed?: (payload: RoomClosedPayload) => void;
}): RoomConnection | null {
  const { role, roomCode, roomId, token, onClosed } = options;
  const [connection, setConnection] = useState<RoomConnection | null>(null);

  useEffect(() => {
    if (!token || !roomId) return undefined;
    const store = useGameStore.getState();
    store.reset(role);
    const next = new RoomConnection({
      role,
      roomCode,
      token,
      getView: () => useGameStore.getState().view,
      callbacks: {
        onView: (view) => useGameStore.getState().acceptView(view),
        onStatus: (status, detail) => {
          if (status === 'unauthorized') forgetRoom(roomId, role);
          useGameStore.getState().setStatus(status, detail);
        },
        onClosed: (payload) => {
          forgetRoom(roomId, role);
          useGameStore.getState().setClosed(payload);
          onClosed?.(payload);
        },
      },
    });
    setConnection(next);
    next.start();
    return () => {
      next.destroy();
      setConnection((current) => (current === next ? null : current));
    };
    // onClosed is intentionally excluded: a new callback identity must not reconnect the socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, roomCode, roomId, token]);

  return connection;
}
