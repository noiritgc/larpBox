import { describe, expect, it } from 'vitest';
import { playerView } from '../dev/fixtures';
import { useGameStore } from './gameStore';

describe('game store', () => {
  it('replaces the view as one unit and never goes back to an older revision', () => {
    const store = useGameStore.getState();
    store.reset('player');
    const newer = { ...playerView({ kind: 'LOBBY', readyCount: 2, settingsChanged: false }), revision: 10 };
    const older = { ...newer, revision: 9, screen: { kind: 'LOBBY' as const, readyCount: 0, settingsChanged: false } };
    expect(useGameStore.getState().acceptView(newer)).toBe(true);
    expect(useGameStore.getState().acceptView(older)).toBe(false);
    expect(useGameStore.getState().view?.revision).toBe(10);
    // Equal revisions may refresh timing metadata.
    expect(useGameStore.getState().acceptView({ ...newer, serverNow: newer.serverNow + 5 })).toBe(true);
  });

  it('accepts a lower revision from a new server process (new boot ID)', () => {
    useGameStore.getState().reset('player');
    const before = { ...playerView({ kind: 'LOBBY', readyCount: 0, settingsChanged: false }), revision: 50 };
    const rebooted = { ...before, revision: 2, bootId: '00000000-0000-4000-8000-00000000beef' };
    useGameStore.getState().acceptView(before);
    expect(useGameStore.getState().acceptView(rebooted)).toBe(true);
  });
});
