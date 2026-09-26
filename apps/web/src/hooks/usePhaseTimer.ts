import type { PhaseView } from '@larpbox/shared';
import { useEffect, useState } from 'react';
import { serverClock } from '../lib/clock';

export interface PhaseTimer {
  remainingMs: number | null;
  /** Whole seconds shown to people: ceil(remaining / 1000). */
  seconds: number | null;
  /** The local countdown reached zero; the server decides when the phase actually ends. */
  expired: boolean;
  paused: boolean;
}

function compute(phase: PhaseView | null): PhaseTimer {
  if (!phase || phase.remainingMs === null) return { remainingMs: null, seconds: null, expired: false, paused: false };
  if (phase.paused || phase.deadlineAt === null) {
    return { remainingMs: phase.remainingMs, seconds: Math.ceil(phase.remainingMs / 1000), expired: false, paused: phase.paused };
  }
  const remainingMs = Math.max(0, phase.deadlineAt - serverClock.now());
  return { remainingMs, seconds: Math.ceil(remainingMs / 1000), expired: remainingMs <= 0, paused: false };
}

/** Countdown from the server deadline and the estimated clock offset, refreshed every 250ms. */
export function usePhaseTimer(phase: PhaseView | null): PhaseTimer {
  const [timer, setTimer] = useState(() => compute(phase));
  useEffect(() => {
    setTimer(compute(phase));
    if (!phase || phase.remainingMs === null || phase.paused) return undefined;
    const id = window.setInterval(() => setTimer(compute(phase)), 250);
    return () => window.clearInterval(id);
  }, [phase]);
  return timer;
}

export function formatClock(seconds: number | null): string {
  if (seconds === null) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}`;
}
