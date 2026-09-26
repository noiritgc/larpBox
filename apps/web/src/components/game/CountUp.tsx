import { useEffect, useRef, useState } from 'react';
import { formatClout } from '../../lib/format';
import { prefersReducedMotion } from '../../lib/prefs';

const DURATION_MS = 500;

/**
 * Counts up to the server-provided value over 500ms, once per mount. Purely cosmetic: the final
 * number is the authoritative one and nothing waits for the animation. Reduced motion shows the
 * value immediately.
 */
export function CountUp({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  const frame = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion() || value === 0) {
      setShown(value);
      return undefined;
    }
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / DURATION_MS);
      const eased = 1 - (1 - progress) ** 3;
      setShown(Math.round(value * eased));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value]);
  return (
    <span>
      <span className="sr-only">{`${prefix}${formatClout(value)}${suffix}`}</span>
      <span aria-hidden="true">
        {prefix}
        {formatClout(shown)}
        {suffix}
      </span>
    </span>
  );
}
