import type { PlayerView, PublicPlayer, Side } from '@larpbox/shared';
import { formatClout, ordinal, plural, signedClout } from '../../lib/format';
import { Avatar } from '../game/Avatar';
import { Scoreboard } from '../game/Scoreboard';
import { sideStamp } from '../game/Stamp';
import { ScreenHeading } from '../ui/ScreenHeading';
import { StatusBanner } from '../ui/StatusBanner';
import { Timer } from '../ui/Timer';

function verdictHeading(stamp: string): string {
  switch (stamp) {
    case 'ENDORSED_A':
      return 'Post A takes the endorsement.';
    case 'ENDORSED_B':
      return 'Post B takes the endorsement.';
    case 'CO_ENDORSED':
      return 'Co-endorsed. Nobody backs down.';
    case 'NO_ENDORSEMENTS':
      return 'No endorsements. Tough room.';
    default:
      return 'Both positions remain unfilled.';
  }
}

export function ControllerDuelResult({ view }: { view: PlayerView }) {
  if (view.screen.kind !== 'DUEL_RESULT') return null;
  const { result, me } = view.screen;
  const byId = new Map<string, PublicPlayer>(view.players.map((p) => [p.id, p]));
  const unfilled = result.stamp === 'UNFILLED';
  return (
    <div className="grid gap-4 enter" data-testid="duel-result">
      <div className="phone-sticky-bar">
        <span className="font-mono text-[15px] font-medium">
          Round {view.roundNumber} · Post-off {view.duelNumber} of {view.duelsInRound}
        </span>
        <Timer phase={view.phase} variant="phone" />
      </div>
      <ScreenHeading className="phone-heading">{verdictHeading(result.stamp)}</ScreenHeading>
      <div className="breakdown" aria-label="Your Clout this round">
        {me.writingPoints !== null ? (
          <div className="breakdown-row">
            <span>Writing</span>
            <strong>{signedClout(me.writingPoints)}</strong>
          </div>
        ) : null}
        {me.guessPoints !== null ? (
          <div className="breakdown-row">
            <span>{me.guessCorrect ? 'Decoded the truth' : me.guessCorrect === false ? 'Missed the truth' : 'No guess locked'}</span>
            <strong>{signedClout(me.guessPoints)}</strong>
          </div>
        ) : null}
        <div className="breakdown-row breakdown-total">
          <span>Total</span>
          <strong data-testid="my-total">{formatClout(me.total)} Clout</strong>
        </div>
      </div>
      {me.autoSubmitted ? (
        <StatusBanner tone="blue" icon="info">
          Your saved draft was submitted.
        </StatusBanner>
      ) : null}
      <p className="truth-box text-[18px]">
        <span className="eyebrow block">What actually happened</span>
        {result.truth}
      </p>
      <ul className="grid gap-2" aria-label="Authors and endorsements">
        {(['A', 'B'] as Side[]).map((side) => {
          const outcome = result.sides[side];
          const author = byId.get(outcome.playerId);
          const stamp = sideStamp(result.stamp, side);
          return (
            <li key={side} className="flex items-center gap-3 rounded-[12px] border-2 border-ink bg-surface p-3">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-[8px] border-2 border-ink bg-yellow font-display font-bold">{side}</span>
              {author ? <Avatar id={author.avatarId} size={36} decorative /> : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">
                  {author?.name ?? 'Former player'}
                  {outcome.playerId === view.selfId ? ' (you)' : ''}
                </span>
                <span className="block text-[14px] muted">
                  {outcome.forfeit ? 'Nothing submitted' : `${plural(outcome.votes, 'endorsement')} · ${signedClout(outcome.points)}`}
                </span>
              </span>
              {stamp ? <span className="stamp stamp-blue text-[12px]">{stamp.label}</span> : null}
            </li>
          );
        })}
      </ul>
      {!unfilled ? (
        <p className="phone-support">
          {plural(result.votesNeither, 'reader')} chose neither · {plural(result.correctGuesserIds.length, 'reader')} decoded the truth
        </p>
      ) : null}
    </div>
  );
}

export function ControllerScoreboard({ view }: { view: PlayerView }) {
  if (view.screen.kind !== 'ROUND_SCOREBOARD') return null;
  const screen = view.screen;
  const mine = screen.rows.find((row) => row.playerId === view.selfId);
  return (
    <div className="grid gap-4 enter">
      <div className="flex items-center justify-between gap-3">
        <ScreenHeading className="phone-heading">Your network is growing.</ScreenHeading>
        <Timer phase={view.phase} variant="phone" />
      </div>
      {mine ? (
        <div className="card grid gap-1 p-4 text-center">
          <span className="eyebrow">You're {ordinal(mine.rank)}</span>
          <span className="font-display text-[40px] font-bold leading-none">{formatClout(mine.total)}</span>
          <span className="muted">Clout · {signedClout(mine.roundGain)} this round</span>
        </div>
      ) : null}
      <Scoreboard rows={screen.rows} players={view.players} size="phone" selfId={view.selfId} />
      <p className="text-center font-semibold">Next: double Clout.</p>
    </div>
  );
}

export function ControllerFinal({ view }: { view: PlayerView }) {
  if (view.screen.kind !== 'FINAL') return null;
  const screen = view.screen;
  const mine = screen.rows.find((row) => row.playerId === view.selfId);
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const winners = screen.winnerIds.map((id) => byId.get(id)?.name).filter(Boolean);
  const iWon = screen.winnerIds.includes(view.selfId);
  return (
    <div className="grid gap-4 enter" data-testid="final">
      <ScreenHeading className="phone-heading">
        {iWon
          ? screen.award === 'CO_CEOS_OF_DOING_NOTHING'
            ? 'You are a Co-CEO of Doing Nothing.'
            : 'You are the Chief Exaggeration Officer.'
          : screen.award === 'CO_CEOS_OF_DOING_NOTHING'
            ? 'Co-CEOs of Doing Nothing.'
            : `${winners[0] ?? 'Someone'} is the Chief Exaggeration Officer.`}
      </ScreenHeading>
      {mine ? (
        <div className="card grid gap-1 p-4 text-center">
          <span className="eyebrow">You finished {ordinal(mine.rank)}</span>
          <span className="font-display text-[44px] font-bold leading-none" data-testid="final-total">
            {formatClout(mine.total)}
          </span>
          <span className="muted">Clout</span>
        </div>
      ) : null}
      {screen.bestPost ? (
        <div className="grid gap-2">
          <p className="eyebrow">Highest-Clout Announcement</p>
          <article className="mini-post text-[16px]">{screen.bestPost.text}</article>
          <p className="phone-support">
            by {byId.get(screen.bestPost.playerId)?.name ?? 'a former player'} · What actually happened: {screen.bestPost.truth}
          </p>
        </div>
      ) : (
        <p className="font-semibold">A room full of professionals. No endorsements.</p>
      )}
      <Scoreboard rows={screen.rows} players={view.players} size="phone" selfId={view.selfId} showGain={false} />
      <p className="text-center font-semibold">Waiting for the host</p>
      <p className="phone-support text-center">Want a souvenir? Take a screenshot.</p>
    </div>
  );
}
