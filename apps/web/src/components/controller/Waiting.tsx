import type { PlayerView } from '@larpbox/shared';
import { Sticker } from '../game/Sticker';
import { ScreenHeading } from '../ui/ScreenHeading';

export function ControllerRoundIntro({ view }: { view: PlayerView }) {
  if (view.screen.kind !== 'ROUND_INTRO') return null;
  const screen = view.screen;
  return (
    <div className="grid place-items-center gap-4 py-10 text-center enter">
      <p className="eyebrow">Round {screen.roundNumber} of {screen.roundCount}</p>
      <ScreenHeading className="display text-[42px]">
        Round {screen.roundNumber}: <span className="accent">{screen.title}.</span>
      </ScreenHeading>
      {screen.multiplier === 2 ? <Sticker className="text-[18px]">Double Clout</Sticker> : null}
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
