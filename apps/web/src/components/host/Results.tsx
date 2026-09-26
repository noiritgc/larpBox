import type { HostView } from '@larpbox/shared';
import { Scoreboard } from '../game/Scoreboard';
import { ScreenHeading } from '../ui/ScreenHeading';
import { HostTopBar } from './HostShell';

export function HostScoreboard({ view }: { view: HostView }) {
  if (view.screen.kind !== 'ROUND_SCOREBOARD') return null;
  const screen = view.screen;
  return (
    <div className="host" data-testid="host-scoreboard">
      <HostTopBar
        view={view}
        center={
          <span>
            After round <strong>{screen.roundNumber}</strong> · Room <strong>{view.roomCode}</strong>
          </span>
        }
      />
      <main className="host-main mx-auto w-full max-w-[1200px]">
        <ScreenHeading className="host-heading">Your network is growing.</ScreenHeading>
        <Scoreboard rows={screen.rows} players={view.players} size="host" />
        <p className="pill-yellow self-start text-[var(--host-label)]">Next: double Clout.</p>
      </main>
    </div>
  );
}
