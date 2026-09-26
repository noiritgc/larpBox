import type { HostView, PlayerView, RoomClosedPayload, RoomView } from '@larpbox/shared';
import { create } from 'zustand';
import type { ConnectionStatus, StatusDetail } from '../lib/socket';

/**
 * Authoritative client state: connection status and the latest valid snapshot, replaced as one
 * unit. Unsent text, unlocked selections and open dialogs live in component state instead.
 */
interface GameState {
  role: 'host' | 'player' | null;
  status: ConnectionStatus;
  detail: StatusDetail | null;
  view: RoomView | null;
  closed: RoomClosedPayload | null;
  reset(role: 'host' | 'player'): void;
  setStatus(status: ConnectionStatus, detail?: StatusDetail): void;
  acceptView(view: RoomView): boolean;
  setClosed(payload: RoomClosedPayload): void;
}

export const useGameStore = create<GameState>()((set, get) => ({
  role: null,
  status: 'connecting',
  detail: null,
  view: null,
  closed: null,
  reset(role) {
    set({ role, status: 'connecting', detail: null, view: null, closed: null });
  },
  setStatus(status, detail) {
    set({ status, detail: detail ?? null });
  },
  acceptView(view) {
    const current = get().view;
    // Same process and room: never go backwards. Equal revisions may refresh timing metadata.
    if (current && current.roomId === view.roomId && current.bootId === view.bootId && view.revision < current.revision) {
      return false;
    }
    set({ view });
    return true;
  },
  setClosed(payload) {
    set({ closed: payload, status: 'closed' });
  },
}));

export function useHostView(): HostView | null {
  return useGameStore((state) => (state.view?.role === 'host' ? state.view : null));
}

export function usePlayerView(): PlayerView | null {
  return useGameStore((state) => (state.view?.role === 'player' ? state.view : null));
}
