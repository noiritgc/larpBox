import type { PlayerView } from '@larpbox/shared';
import { MonitorPlay } from 'lucide-react';
import { TUTORIAL_RULE, TUTORIAL_STEPS } from '../../content/tutorial';
import { ScreenHeading } from '../ui/ScreenHeading';
import { Timer } from '../ui/Timer';

export function ControllerRules({ view }: { view: PlayerView }) {
  return (
    <div className="grid gap-4 enter">
      <div className="flex items-center justify-between gap-3">
        <ScreenHeading className="phone-heading">
          How this <span className="accent">works.</span>
        </ScreenHeading>
        <Timer phase={view.phase} variant="phone" />
      </div>
      <ol className="grid gap-3">
        {TUTORIAL_STEPS.map((step, index) => (
          <li key={step.title} className="card grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 p-4">
            <span className="step-number row-span-2" aria-hidden="true">
              {index + 1}
            </span>
            <span className="display accent text-[24px]">{step.title}</span>
            <span className="text-[16px]">{step.body}</span>
          </li>
        ))}
      </ol>
      <p className="banner banner-blue">Writers sit out guessing and voting on their own posts.</p>
      <p className="phone-annotation text-center accent">{TUTORIAL_RULE}</p>
      <p className="flex items-center justify-center gap-2 text-center font-semibold">
        <MonitorPlay size={22} aria-hidden="true" /> Look at the big screen
      </p>
    </div>
  );
}
