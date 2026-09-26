import type { PlayerView } from '@larpbox/shared';
import { ScreenHeading } from '../ui/ScreenHeading';

export function ControllerRoundIntro({ view }: { view: PlayerView }) {
  if (view.screen.kind !== 'ROUND_INTRO') return null;
  const screen = view.screen;
  return (
    <div className="grid place-items-center gap-4 py-10 text-center enter">
      <p className="eyebrow">Round {screen.roundNumber} of {screen.roundCount}</p>
      <ScreenHeading className="font-display text-[44px] leading-[1.02]">
        Round {screen.roundNumber}: {screen.title}.
      </ScreenHeading>
      {screen.multiplier === 2 ? <span className="pill-yellow text-[18px]">DOUBLE CLOUT</span> : null}
      {screen.sitOutIds.includes(view.selfId) ? (
        <p className="text-[20px] font-semibold" data-testid="sitting-out">
          You're sitting this round out. You'll judge every post-off.
        </p>
      ) : (
        <p className="text-[20px] font-semibold">{view.settings.postsPerPlayer === 1 ? 'One post. One timer.' : 'Two posts. One timer.'}</p>
      )}
    </div>
  );
}

export function WaitingCard({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="grid gap-3 py-6 text-center enter">
      <ScreenHeading className="phone-heading">{title}</ScreenHeading>
      {children}
    </div>
  );
}
