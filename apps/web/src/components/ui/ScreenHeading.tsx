import { useEffect, useRef, type ReactNode } from 'react';

let firstScreenShown = false;

/**
 * The main heading of a game screen. When a new phase mounts a new screen, focus moves here so
 * keyboard and screen-reader users land on what changed (not on the very first page load).
 */
export function ScreenHeading({
  children,
  className = '',
  level = 1,
}: {
  children: ReactNode;
  className?: string;
  level?: 1 | 2;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!firstScreenShown) {
      firstScreenShown = true;
      return;
    }
    ref.current?.focus({ preventScroll: false });
  }, []);
  const Tag = level === 1 ? 'h1' : 'h2';
  return (
    <Tag ref={ref} tabIndex={-1} className={`screen-heading ${className}`}>
      {children}
    </Tag>
  );
}
