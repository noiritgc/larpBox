import { afterEach, describe, expect, it, vi } from 'vitest';

describe('host audio', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('plays a cue once per phase entry and never replays it on reconnect', async () => {
    const started: number[] = [];
    class FakeContext {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume = vi.fn(() => Promise.resolve());
      createGain() {
        return { gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
      }
      createOscillator() {
        return { type: 'sine', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(() => started.push(1)), stop: vi.fn() };
      }
    }
    vi.stubGlobal('AudioContext', FakeContext);
    const { hostAudio } = await import('./audio');
    hostAudio.unlock();
    hostAudio.playForPhase('phase-1', 'phase');
    const afterFirst = started.length;
    expect(afterFirst).toBeGreaterThan(0);
    hostAudio.playForPhase('phase-1', 'phase');
    expect(started.length).toBe(afterFirst);
    hostAudio.playForPhase('phase-2', 'results');
    expect(started.length).toBeGreaterThan(afterFirst);
  });

  it('never throws when audio is unavailable', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const { hostAudio } = await import('./audio');
    expect(() => {
      hostAudio.unlock();
      hostAudio.play('final');
    }).not.toThrow();
  });
});
