import type { ReactNode } from 'react';

/**
 * The yellow emphasis sticker: truths, punchlines, double-Clout calls and special captions only.
 * `placement` hangs it past its card's left edge (hero -54px, card -42px, line -20px; less on
 * phones) while it stays in normal flow. Noninteractive; reduced motion removes the tilt.
 */
export function Sticker({
  children,
  placement = 'inline',
  compact = false,
  className = '',
}: {
  children: ReactNode;
  placement?: 'inline' | 'hero' | 'card' | 'line';
  compact?: boolean;
  className?: string;
}) {
  const classes = ['sticker', placement === 'inline' ? '' : `sticker-${placement}`, compact ? 'sticker-compact' : '', className]
    .filter(Boolean)
    .join(' ');
  return <span className={classes}>{children}</span>;
}
