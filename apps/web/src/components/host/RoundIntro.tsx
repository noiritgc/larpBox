import type { HostView } from '@larpbox/shared';
import { ScreenHeading } from '../ui/ScreenHeading';
import { HostTopBar } from './HostShell';

export function HostRoundIntro({ view }: { view: HostView }) {
  if (view.screen.kind !== 'ROUND_INTRO') return null;
  const screen = view.screen;
  const sitOutNames = screen.sitOutIds.map((id) => view.players.find((player) => player.id === id)?.name ?? 'Someone');
  return (
    <div className="host" data-testid="host-round-intro">
      <HostTopBar view={view} center={<span>Room <strong>{view.roomCode}</strong></span>} />
      <main className="host-main items-center justify-center text-center">
        <p className="eyebrow text-[var(--host-label)]">
          Round {screen.roundNumber} of {screen.roundCount}
        </p>
        <p className="host-big-number enter" aria-hidden="true">
          {screen.roundNumber}
        </p>
        <ScreenHeading className="host-heading enter">
          Round {screen.roundNumber}: {screen.title}.
        </ScreenHeading>
        {screen.multiplier === 2 ? (
          <span className="pill-yellow stamp-in text-[clamp(22px,calc(6px+1.25vw),34px)]" style={{ transform: 'rotate(-3deg)' }}>
            DOUBLE CLOUT
          </span>
        ) : null}
        <p className="host-subheading">
          {view.settings.postsPerPlayer === 1 ? 'One post each. One timer.' : 'Two posts each. One timer.'}
        </p>
        {sitOutNames.length > 0 ? (
          <p className="host-subheading" data-testid="sit-out-note">
            {sitOutNames.join(' and ')} {sitOutNames.length === 1 ? 'sits' : 'sit'} this round out and judges every post-off.
          </p>
        ) : null}
      </main>
    </div>
  );
}
