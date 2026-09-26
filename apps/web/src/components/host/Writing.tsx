import type { HostView } from '@larpbox/shared';
import { CircleCheck, CircleDashed, CircleDot, Gavel } from 'lucide-react';
import { Avatar } from '../game/Avatar';
import { ScreenHeading } from '../ui/ScreenHeading';
import { HostTopBar } from './HostShell';

const JOB_TITLES = [
  'Vice President of Vibes',
  'Chief Nap Strategist',
  'Senior Inbox Archaeologist',
  'Head of Snack Logistics',
  'Principal Meeting Survivor',
  'Director of Tab Management',
  'Global Lead, Mild Inconveniences',
  'Associate Visionary (Unpaid)',
];

/** No prompts, drafts or truths here: only who has locked how many posts. */
export function HostWriting({ view }: { view: HostView }) {
  if (view.screen.kind !== 'WRITING') return null;
  const screen = view.screen;
  const byId = new Map(view.players.map((player) => [player.id, player]));
  return (
    <div className="host" data-testid="host-writing">
      <HostTopBar
        view={view}
        center={
          <>
            <span>
              Round <strong>{view.roundNumber}</strong>
            </span>
            <span>
              Room <strong>{view.roomCode}</strong>
            </span>
          </>
        }
      />
      <main className="host-main">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-2">
            <ScreenHeading className="host-heading">
              Make it <span className="accent">sound insane.</span>
            </ScreenHeading>
            <p className="host-subheading">
              {view.settings.postsPerPlayer === 1 ? 'One post each.' : 'Two posts each.'} Keep the facts. Inflate everything else.
            </p>
          </div>
          <p className="display text-[clamp(28px,calc(6px+1.6vw),44px)]" data-testid="locked-total">
            {screen.lockedTotal} of {screen.assignmentTotal} posts locked
          </p>
        </div>
        <ul className="grid gap-[clamp(10px,1vw,20px)] sm:grid-cols-2 xl:grid-cols-4" aria-label="Writing progress">
          {screen.progress.map((entry) => {
            const player = byId.get(entry.playerId);
            if (!player) return null;
            const sittingOut = entry.total === 0;
            const done = !sittingOut && entry.locked === entry.total;
            const Icon = sittingOut ? Gavel : done ? CircleCheck : entry.locked > 0 ? CircleDot : CircleDashed;
            return (
              <li key={entry.playerId} className={`host-writer-tile ${done ? 'host-writer-tile-done' : ''}`} data-testid="writer-tile">
                <Avatar id={player.avatarId} size={52} decorative />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[var(--host-name)] font-bold leading-tight">{player.name}</p>
                  <p className="inline-flex items-center gap-2 text-[clamp(16px,calc(6px+0.8vw),22px)] font-semibold">
                    <Icon size={22} aria-hidden="true" className={done ? 'text-blue' : 'muted'} />
                    {sittingOut ? 'Judging this round' : `${entry.locked}/${entry.total} locked`}
                  </p>
                </div>
                {!player.connected ? <span className="status-dot status-dot-off" role="img" title="Offline" aria-label="Offline" /> : null}
              </li>
            );
          })}
        </ul>
        <div className="host-marquee mt-auto" aria-hidden="true">
          <div className="host-marquee-track">
            {[...JOB_TITLES, ...JOB_TITLES].map((title, index) => (
              <span key={`${title}-${index}`} className="mx-8">
                {title}
              </span>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
