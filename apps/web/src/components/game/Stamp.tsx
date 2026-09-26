import type { ResultStamp, Side } from '@larpbox/shared';

export function Stamp({ tone, children, size = 20 }: { tone: 'blue' | 'muted' | 'red' | 'yellow'; children: string; size?: number }) {
  return (
    <span className={`stamp stamp-${tone} stamp-in`} style={{ fontSize: size }}>
      {children}
    </span>
  );
}

/** The decorative stamp for one side of a settled duel (no extra points). */
export function sideStamp(stamp: ResultStamp, side: Side): { label: string; tone: 'blue' | 'muted' } | null {
  if (stamp === 'CO_ENDORSED') return { label: 'Co-endorsed', tone: 'blue' };
  if ((stamp === 'ENDORSED_A' && side === 'A') || (stamp === 'ENDORSED_B' && side === 'B')) {
    return { label: 'Endorsed', tone: 'blue' };
  }
  return null;
}
