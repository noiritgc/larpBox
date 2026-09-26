import type { PublicPlayer, ScoreRow } from '@larpbox/shared';
import { formatClout, signedClout } from '../../lib/format';
import { Avatar } from './Avatar';

/**
 * Ranked rows (competition ranks: 1, 1, 3). Rows glide to their new order once on entry;
 * reduced motion removes the travel.
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
  return (
    <ol className="grid gap-2" aria-label="Scoreboard">
      {rows.map((row, index) => {
        const player = byId.get(row.playerId);
        if (!player) return null;
        const me = row.playerId === selfId;
        return (
          <li
            key={row.playerId}
            className={`score-row enter ${me ? 'score-row-me' : ''}`}
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms`, fontSize: host ? 'var(--host-name)' : '17px' }}
          >
            <span className="score-rank" aria-label={`Rank ${row.rank}`}>
              #{row.rank}
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
