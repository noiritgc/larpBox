import type { HostView } from '@larpbox/shared';
import { ScreenHeading } from '../ui/ScreenHeading';
import { HostTopBar } from './HostShell';

export function HostRoundIntro({ view }: { view: HostView }) {
  if (view.screen.kind !== 'ROUND_INTRO') return null;
  const screen = view.screen;
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
      </main>
    </div>
  );
}
