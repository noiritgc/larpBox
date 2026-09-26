import { ChevronsDown } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * On very short displays the host content may scroll. When it overflows, an explicit cue appears
 * instead of silently clipping posts.
 */
export function ScrollArea({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      setOverflowing(el.scrollHeight > el.clientHeight + 4);
      setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    for (const child of Array.from(el.children)) observer?.observe(child);
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer?.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`host-scroll flex-1 ${className}`}
      tabIndex={overflowing ? 0 : -1}
      {...(overflowing ? { role: 'region', 'aria-label': 'Scrollable content' } : {})}
    >
      {children}
      {overflowing && !atEnd ? (
        <div className="host-scroll-cue" aria-hidden="true">
          <ChevronsDown size={20} /> Scroll for more
        </div>
      ) : null}
    </div>
  );
}
