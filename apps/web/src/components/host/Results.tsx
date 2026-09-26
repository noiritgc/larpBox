import type { HostView } from '@larpbox/shared';
import { Scoreboard } from '../game/Scoreboard';
import { Sticker } from '../game/Sticker';
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
        <div className="grid gap-1">
          <ScreenHeading className="host-heading">
            Your network is <span className="accent">growing.</span>
          </ScreenHeading>
          <p className="host-annotation">Promoted to thought leader.</p>
        </div>
        <Scoreboard rows={screen.rows} players={view.players} size="host" />
        <div>
          <Sticker className="text-[var(--host-label)]">Next: double Clout.</Sticker>
        </div>
      </main>
    </div>
  );
}
