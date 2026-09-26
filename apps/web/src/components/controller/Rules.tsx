import type { PlayerView } from '@larpbox/shared';
import { MonitorPlay } from 'lucide-react';
import { TUTORIAL_RULE, TUTORIAL_STEPS } from '../../content/tutorial';
import { ScreenHeading } from '../ui/ScreenHeading';
import { Timer } from '../ui/Timer';

export function ControllerRules({ view }: { view: PlayerView }) {
  return (
    <div className="grid gap-4 enter">
      <div className="flex items-center justify-between gap-3">
        <ScreenHeading className="phone-heading">How this works</ScreenHeading>
        <Timer phase={view.phase} variant="phone" />
      </div>
      <ol className="grid gap-3">
        {TUTORIAL_STEPS.map((step, index) => (
          <li key={step.title} className="card grid gap-1 p-4">
            <span className="font-display text-[22px] font-bold">
              {index + 1}. {step.title}
            </span>
            <span className="text-[16px]">{step.body}</span>
          </li>
        ))}
      </ol>
      <p className="banner banner-blue">Writers sit out guessing and voting on their own posts.</p>
      <p className="text-center font-display text-[20px] font-bold">{TUTORIAL_RULE}</p>
      <p className="flex items-center justify-center gap-2 text-center font-semibold">
        <MonitorPlay size={22} aria-hidden="true" /> Look at the big screen
      </p>
    </div>
  );
}
