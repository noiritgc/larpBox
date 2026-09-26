import type { PhaseView } from '@larpbox/shared';
import { Pause, Timer as TimerIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { formatClock, usePhaseTimer } from '../../hooks/usePhaseTimer';
import { useAnnounce } from './Announcer';

/**
 * Server-deadline countdown. At local zero it shows "Finishing…" but never advances anything;
 * the server decides. Announces "10 seconds left" once per phase.
 */
export function Timer({ phase, variant, urgentBelow = 10 }: { phase: PhaseView | null; variant: 'host' | 'phone'; urgentBelow?: number }) {
  const timer = usePhaseTimer(phase);
  const announce = useAnnounce();
  const announcedFor = useRef<string | null>(null);

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
  const urgent = !timer.paused && timer.seconds <= urgentBelow;
  const base = variant === 'host' ? 'host-timer' : 'phone-timer';
  const urgentClass = urgent ? (variant === 'host' ? 'host-timer-urgent' : 'phone-timer-urgent') : '';
  const iconSize = variant === 'host' ? 28 : 18;
  let text = formatClock(timer.seconds);
  if (timer.paused) text = 'Paused';
  else if (timer.expired) text = 'Finishing…';
  return (
    <span className={`${base} ${urgentClass}`} role="timer" aria-label={timer.paused ? 'Timer paused' : `${timer.seconds} seconds left`}>
      {timer.paused ? <Pause size={iconSize} aria-hidden="true" /> : <TimerIcon size={iconSize} aria-hidden="true" />}
      <span aria-hidden="true">{text}</span>
    </span>
  );
}
