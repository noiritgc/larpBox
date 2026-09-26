import type { PhaseView } from '@larpbox/shared';
import { Pause, Timer as TimerIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatClock, usePhaseTimer } from '../../hooks/usePhaseTimer';
import { useAnnounce } from './Announcer';

/**
 * Buzzes the phone (where the Vibration API exists; iOS Safari has none) when time is running out
 * and the player still has something to do: once on entering the urgent window, twice at 5
 * seconds, then a short tick for each of the last three seconds.
 */
function useUrgencyBuzz(phaseId: string | null, seconds: number | null, threshold: number): void {
  const fired = useRef<{ phaseId: string | null; marks: Set<number> }>({ phaseId: null, marks: new Set() });
  useEffect(() => {
    if (phaseId === null || seconds === null || seconds <= 0) return;
    if (fired.current.phaseId !== phaseId) fired.current = { phaseId, marks: new Set() };
    const { marks } = fired.current;
    let pattern: number | number[] | null = null;
    if (seconds <= 3) {
      if (!marks.has(seconds)) pattern = 60;
      marks.add(seconds);
    } else if (seconds <= 5) {
      if (!marks.has(5)) pattern = [140, 90, 140];
      marks.add(5);
    } else if (seconds <= threshold) {
      if (!marks.has(threshold)) pattern = 220;
      marks.add(threshold);
    }
    if (pattern !== null && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Some browsers refuse vibration without a recent tap; the red timer still shows.
      }
    }
  }, [phaseId, seconds, threshold]);
}

/**
 * Server-deadline countdown. At local zero it shows "Finishing…" but never advances anything;
 * the server decides. Announces "10 seconds left" once per phase. Below `urgentBelow` seconds it
 * turns red; on a phone whose player still has to act (`pending`) it also pulses, outlines the
 * screen in red and buzzes.
 */
export function Timer({
  phase,
  variant,
  urgentBelow = 10,
  pending = false,
}: {
  phase: PhaseView | null;
  variant: 'host' | 'phone';
  urgentBelow?: number;
  pending?: boolean;
}) {
  const timer = usePhaseTimer(phase);
  const announce = useAnnounce();
  const announcedFor = useRef<string | null>(null);
  const urgent = !timer.paused && timer.seconds !== null && timer.seconds <= urgentBelow;
  const alarm = variant === 'phone' && pending && urgent && !timer.expired;
  useUrgencyBuzz(phase?.id ?? null, alarm ? timer.seconds : null, urgentBelow);

  useEffect(() => {
    if (!phase || timer.paused || timer.seconds === null) return;
    if (timer.seconds <= 10 && timer.seconds > 0 && phase.durationMs !== null && phase.durationMs > 12_000) {
      if (announcedFor.current !== phase.id) {
        announcedFor.current = phase.id;
        announce('10 seconds left.');
      }
    }
  }, [announce, phase, timer.paused, timer.seconds]);

  if (!phase || timer.seconds === null) return null;
  const base = variant === 'host' ? 'host-timer' : 'phone-timer';
  const urgentClass = urgent ? (variant === 'host' ? 'host-timer-urgent' : 'phone-timer-urgent') : '';
  const iconSize = variant === 'host' ? 28 : 18;
  let text = formatClock(timer.seconds);
  if (timer.paused) text = 'Paused';
  else if (timer.expired) text = 'Finishing…';
  return (
    <>
      <span
        className={`${base} ${urgentClass} ${alarm ? 'phone-timer-alarm' : ''}`}
        role="timer"
        aria-label={timer.paused ? 'Timer paused' : `${timer.seconds} seconds left`}
        data-urgent={urgent || undefined}
      >
        {timer.paused ? <Pause size={iconSize} aria-hidden="true" /> : <TimerIcon size={iconSize} aria-hidden="true" />}
        <span aria-hidden="true">{text}</span>
      </span>
      {alarm ? createPortal(<span className="urgency-edge" aria-hidden="true" data-testid="urgency-edge" />, document.body) : null}
    </>
  );
}
