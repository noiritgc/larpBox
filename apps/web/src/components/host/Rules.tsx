import type { HostView } from '@larpbox/shared';
import { FastForward } from 'lucide-react';
import { useState } from 'react';
import { TUTORIAL_EXAMPLE, TUTORIAL_RULE, TUTORIAL_STEPS } from '../../content/tutorial';
import { usePhaseTimer } from '../../hooks/usePhaseTimer';
import { useConnection } from '../../hooks/useRoomConnection';
import { Avatar } from '../game/Avatar';
import { Button } from '../ui/Button';
import { ScreenHeading } from '../ui/ScreenHeading';
import { HostTopBar } from './HostShell';

export function HostRules({ view }: { view: HostView }) {
  const connection = useConnection();
  const timer = usePhaseTimer(view.phase);
  const [busy, setBusy] = useState(false);
  if (view.screen.kind !== 'RULES') return null;
  const elapsed = (view.phase.durationMs ?? 0) - (timer.remainingMs ?? 0);
  const canSkip = !view.phase.paused && elapsed >= view.screen.skipAfterMs;

  return (
    <div className="host" data-testid="host-rules">
      <HostTopBar view={view} center={<span>Room <strong>{view.roomCode}</strong></span>} />
      <main className="host-main">
        <ScreenHeading className="host-heading">Here's how you network.</ScreenHeading>
        <ol className="grid gap-[var(--host-gap)] md:grid-cols-3">
          {TUTORIAL_STEPS.map((step, index) => (
            <li key={step.title} className="card grid content-start gap-3 p-[clamp(18px,1.6vw,32px)] enter" style={{ animationDelay: `${index * 60}ms` }}>
              <span className="font-display text-[clamp(30px,calc(6px+2vw),48px)] font-bold leading-none">
                {index + 1}. {step.title}
              </span>
              <span className="text-[var(--host-label)]">{step.body}</span>
            </li>
          ))}
        </ol>
        <div className="grid items-center gap-[var(--host-gap)] md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="grid gap-2">
            <p className="eyebrow">Example: what actually happened</p>
            <p className="truth-box text-[var(--host-facts)]">{TUTORIAL_EXAMPLE.fact}</p>
          </div>
          <article className="post-card">
            <header className="post-head">
              <Avatar id="anonymous" size={56} decorative />
              <div>
                <p className="post-author">Anonymous professional</p>
                <p className="post-subtitle">Proud to share an update</p>
              </div>
            </header>
            <p className="post-body">{TUTORIAL_EXAMPLE.post}</p>
          </article>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="font-display text-[clamp(26px,calc(6px+1.6vw),40px)] font-bold">{TUTORIAL_RULE}</p>
          <div className="flex items-center gap-3">
            {!canSkip ? <span className="muted">Skip unlocks in a moment</span> : null}
            <Button
              variant="primary"
              disabled={!canSkip}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await connection?.command('host.skipRules', {});
                setBusy(false);
              }}
              icon={<FastForward size={22} aria-hidden="true" />}
              data-testid="skip-rules"
            >
              Everyone gets it
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
