import type { PublicPlayer, ScoreRow } from '@larpbox/shared';
import { useLayoutEffect, useRef } from 'react';
import { formatClout, signedClout } from '../../lib/format';
import { prefersReducedMotion } from '../../lib/prefs';
import { Avatar } from './Avatar';

const REORDER_MS = 400;

/**
 * Ranked rows (competition ranks: 1, 1, 3). When round gains are known, rows start in their
 * pre-round order and glide to the new order over 400ms, once. Reduced motion removes the travel.
 */
export function Scoreboard({
  rows,
  players,
  size,
  selfId = null,
  showGain = true,
}: {
  rows: ScoreRow[];
  players: PublicPlayer[];
  size: 'host' | 'phone';
  selfId?: string | null;
  showGain?: boolean;
}) {
  const byId = new Map(players.map((player) => [player.id, player]));
  const host = size === 'host';
  const listRef = useRef<HTMLOListElement>(null);
  const animated = useRef(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || animated.current || !showGain || prefersReducedMotion()) return;
    animated.current = true;
    const items = Array.from(list.children) as HTMLElement[];
    if (items.length < 2) return;
    // Previous order: by total before this round, seat order (current order) breaking ties.
    const previous = rows
      .map((row, index) => ({ index, before: row.total - row.roundGain }))
      .sort((a, b) => b.before - a.before || a.index - b.index)
      .map((entry) => entry.index);
    const tops = items.map((item) => item.offsetTop);
    previous.forEach((currentIndex, previousPosition) => {
      const item = items[currentIndex];
      const from = tops[previousPosition];
      const to = tops[currentIndex];
      if (!item || from === undefined || to === undefined || from === to) return;
      item.animate([{ transform: `translateY(${from - to}px)` }, { transform: 'translateY(0)' }], {
        duration: REORDER_MS,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        fill: 'backwards',
      });
    });
  }, [rows, showGain]);

  return (
    <ol ref={listRef} className="grid gap-2" aria-label="Scoreboard">
      {rows.map((row) => {
        const player = byId.get(row.playerId);
        if (!player) return null;
        const me = row.playerId === selfId;
        return (
          <li
            key={row.playerId}
            className={`score-row ${me ? 'score-row-me' : ''}`}
            style={{ fontSize: host ? 'var(--host-name)' : '17px' }}
            data-testid="score-row"
          >
            <span className="score-rank">
              <span className="sr-only">Rank </span>
              <span aria-hidden="true">#</span>
              {row.rank}
            </span>
            <Avatar id={player.avatarId} size={host ? 52 : 36} decorative />
            <span className="min-w-0">
              <span className={`block truncate font-display font-bold ${host ? '' : 'text-[17px]'}`}>
                {player.name}
                {me ? <span className="sr-only"> (you)</span> : null}
              </span>
              {showGain && row.roundGain !== 0 ? (
                <span className="block font-mono text-[0.6em] muted">{signedClout(row.roundGain)} this round</span>
              ) : null}
            </span>
            <span className="score-total" style={{ fontSize: host ? 'var(--host-score)' : '20px' }}>
              {formatClout(row.total)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
