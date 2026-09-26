import { performance } from 'node:perf_hooks';

/**
 * Epoch time is for display (snapshot timestamps). Deadlines, elapsed time and pause arithmetic
 * use the monotonic clock, so a wall-clock jump never changes remaining time.
 */
export interface Clock {
  nowEpochMs(): number;
  nowMonotonicMs(): number;
}

export interface TimerHandle {
  cancel(): void;
}

export interface Scheduler {
  schedule(delayMs: number, callback: () => void): TimerHandle;
}

export const systemClock: Clock = {
  nowEpochMs: () => Date.now(),
  nowMonotonicMs: () => performance.now(),
};

export const systemScheduler: Scheduler = {
  schedule(delayMs, callback) {
    const timer = setTimeout(callback, Math.max(0, delayMs));
    return { cancel: () => clearTimeout(timer) };
  },
};

interface FakeTimer {
  at: number;
  seq: number;
  callback: () => void;
  cancelled: boolean;
}

/** Deterministic clock and scheduler for tests. Timers fire in (due time, creation order) order. */
export class FakeClock implements Clock, Scheduler {
  private mono: number;
  private epoch: number;
  private seq = 0;
  private timers: FakeTimer[] = [];
  /**
   * When true, cancel() is ignored so every scheduled callback still runs. Tests use this to prove
   * stale callbacks (old phase, old game, closed room) are harmless no-ops.
   */
  ignoreCancellation = false;

  constructor(options: { epochMs?: number; monotonicMs?: number } = {}) {
    this.epoch = options.epochMs ?? Date.UTC(2026, 8, 26, 18, 0, 0);
    this.mono = options.monotonicMs ?? 10_000;
  }

  nowEpochMs(): number {
    return this.epoch;
  }

  nowMonotonicMs(): number {
    return this.mono;
  }

  schedule(delayMs: number, callback: () => void): TimerHandle {
    const timer: FakeTimer = {
      at: this.mono + Math.max(0, delayMs),
      seq: this.seq++,
      callback,
      cancelled: false,
    };
    this.timers.push(timer);
    return {
      cancel: () => {
        if (!this.ignoreCancellation) timer.cancelled = true;
      },
    };
  }

  /** Moves time without firing timers, as if the event loop were busy when the deadline passed. */
  advanceSilently(ms: number): void {
    this.mono += ms;
    this.epoch += ms;
  }

  /** Advances both clocks, firing due timers in order (including timers they schedule). */
  advance(ms: number): void {
    const target = this.mono + ms;
    for (;;) {
      this.timers = this.timers.filter((timer) => !timer.cancelled);
      let next: FakeTimer | undefined;
      for (const timer of this.timers) {
        if (timer.at <= target && (!next || timer.at < next.at || (timer.at === next.at && timer.seq < next.seq))) {
          next = timer;
        }
      }
      if (!next) break;
      this.epoch += next.at - this.mono;
      this.mono = next.at;
      next.cancelled = true;
      next.callback();
    }
    this.epoch += target - this.mono;
    this.mono = target;
  }

  /** Fires every timer due at the current instant without moving time. */
  flush(): void {
    this.advance(0);
  }

  /** Simulates a wall-clock change (NTP step, manual change) that monotonic time ignores. */
  jumpWallClock(ms: number): void {
    this.epoch += ms;
  }

  pendingTimerCount(): number {
    return this.timers.filter((timer) => !timer.cancelled).length;
  }
}
