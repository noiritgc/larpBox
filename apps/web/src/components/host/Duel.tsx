import type { HostView, PublicPlayer, Side } from '@larpbox/shared';
import { CircleCheck } from 'lucide-react';
import { formatClout, plural } from '../../lib/format';
import { Avatar } from '../game/Avatar';
import { CountUp } from '../game/CountUp';
import { PostCard } from '../game/PostCard';
import { sideStamp, Stamp } from '../game/Stamp';
import { FactsList, TruthBanner } from '../game/TruthBanner';
import { ScreenHeading } from '../ui/ScreenHeading';
import { DuelContext, HostTopBar } from './HostShell';
import { ScrollArea } from './ScrollArea';

type Screen<K extends string> = Extract<HostView['screen'], { kind: K }>;

function AnonymousPosts({ posts }: { posts: Screen<'DUEL_READ'>['posts'] }) {
  return (
    <div className="host-posts">
      {(['A', 'B'] as const).map((side) => (
        <PostCard key={side} side={side} post={posts[side]} size="host" headingLevel={2} />
      ))}
    </div>
  );
}

function ReadScreen({ view, screen }: { view: HostView; screen: Screen<'DUEL_READ'> }) {
  return (
    <div className="host host-fixed" data-testid="host-duel-read">
      <HostTopBar view={view} center={<DuelContext view={view} />} />
      <main className="host-main">
        <ScreenHeading className="host-heading">
          Two announcements. <span className="accent">One very ordinary event.</span>
        </ScreenHeading>
        <ScrollArea>
          <AnonymousPosts posts={screen.posts} />
        </ScrollArea>
      </main>
    </div>
  );
}

function GuessScreen({ view, screen }: { view: HostView; screen: Screen<'DUEL_GUESS'> }) {
  return (
    <div className="host host-fixed" data-testid="host-duel-guess">
      <HostTopBar view={view} center={<DuelContext view={view} />} />
      <main className="host-main">
        <ScrollArea>
          <div className="grid gap-[var(--host-gap)]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <ScreenHeading className="host-heading">
                Guess <span className="accent">the LARP.</span>
              </ScreenHeading>
              <p className="badge text-[clamp(14px,calc(6px+0.6vw),18px)]" data-testid="guess-count">
                {screen.lockedCount} of {plural(screen.eligibleCount, 'guess', 'guesses')} locked
              </p>
            </div>
            <AnonymousPosts posts={screen.posts} />
            <p className="eyebrow">What actually happened? Guess on your phone.</p>
            <ol className="host-options" aria-label="Possible events">
              {screen.options.map((option, index) => (
                <li key={option.id} className="host-option">
                  <span className="host-option-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>{option.label}</span>
                </li>
              ))}
            </ol>
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}

function EndorseScreen({ view, screen }: { view: HostView; screen: Screen<'DUEL_ENDORSE'> }) {
  return (
    <div className="host host-fixed" data-testid="host-duel-endorse">
      <HostTopBar view={view} center={<DuelContext view={view} />} />
      <main className="host-main">
        <ScrollArea>
          <div className="grid gap-[var(--host-gap)]">
            <ScreenHeading className="host-heading">
              Who <span className="accent">LARPed harder?</span>
            </ScreenHeading>
            <div className="host-endorse-top">
              <TruthBanner truth={screen.truth} size="host" />
              <FactsList facts={screen.facts} boundaries={screen.boundaries} className="host-facts sm:grid-cols-2" />
            </div>
            <AnonymousPosts posts={screen.posts} />
            <div className="card host-callout">
              <p className="display text-[clamp(26px,calc(6px+1.4vw),38px)]">Endorse on your phone.</p>
              <p className="text-[var(--host-label)]">Choose A, B, or Neither. Keep it technically true.</p>
              <p className="badge text-[clamp(14px,calc(6px+0.6vw),18px)]" data-testid="endorse-count">
                {screen.lockedCount} of {plural(screen.eligibleCount, 'endorsement')} locked
              </p>
            </div>
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}

function ResultScreen({ view, screen }: { view: HostView; screen: Screen<'DUEL_RESULT'> }) {
  const byId = new Map<string, PublicPlayer>(view.players.map((player) => [player.id, player]));
  const { result } = screen;
  const unfilled = result.stamp === 'UNFILLED';
  const guessers = result.correctGuesserIds.map((id) => byId.get(id)).filter((p): p is PublicPlayer => Boolean(p));
  return (
    <div className="host host-fixed" data-testid="host-duel-result">
      <HostTopBar view={view} center={<DuelContext view={view} />} />
      <main className="host-main">
        <ScrollArea>
          <div className="grid gap-[var(--host-gap)]">
            <TruthBanner truth={result.truth} size="host" />
            {unfilled ? (
              <div className="grid place-items-center gap-6 py-8 text-center">
                <ScreenHeading className="host-heading">
                  Both positions remain <span className="accent">unfilled.</span>
                </ScreenHeading>
                <Stamp tone="muted" size={40}>
                  Position vacant
                </Stamp>
                <p className="host-subheading">Nobody submitted a post, so nobody scores this one.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <ScreenHeading className="host-heading">
                    {result.stamp === 'NO_ENDORSEMENTS' ? 'No endorsements. Tough room.' : 'The room has spoken.'}
                  </ScreenHeading>
                  {result.stamp === 'NO_ENDORSEMENTS' ? (
                    <Stamp tone="muted" size={34}>
                      No endorsements
                    </Stamp>
                  ) : null}
                </div>
                <div className="host-posts">
                  {(['A', 'B'] as Side[]).map((side) => {
                    const outcome = result.sides[side];
                    const author = byId.get(outcome.playerId);
                    const stamp = sideStamp(result.stamp, side);
                    const post = outcome.forfeit || outcome.text === null ? ({ status: 'FORFEIT' } as const) : ({ status: 'POSTED', text: outcome.text } as const);
                    return (
                      <div key={side} className="grid grid-rows-[1fr_auto] gap-3">
                        <PostCard
                          side={side}
                          post={post}
                          size="host"
                          headingLevel={2}
                          author={author ? { name: author.name, avatarId: author.avatarId, headline: author.headline } : null}
                          stamp={stamp ? <Stamp tone={stamp.tone} size={34}>{stamp.label}</Stamp> : null}
                        />
                        <p className="flex flex-wrap items-baseline gap-x-4 font-display" data-testid={`result-${side}`}>
                          <span className="text-[var(--host-score)]">{plural(outcome.votes, 'endorsement')}</span>
                          <span className="text-[var(--host-score)] text-blue">
                            <CountUp value={outcome.points} prefix="+" suffix=" Clout" />
                          </span>
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-[var(--host-label)] font-semibold">
                  <span>{plural(result.votesNeither, 'reader')} chose neither</span>
                  <span className="inline-flex items-center gap-3">
                    <CircleCheck size={28} aria-hidden="true" className="text-blue" />
                    {plural(guessers.length, 'reader')} decoded the truth
                    {guessers.length > 0 ? ` (+${formatClout(result.guessPoints)} each)` : ''}
                    <span className="inline-flex gap-2">
                      {guessers.map((player) => (
                        <Avatar key={player.id} id={player.avatarId} size={40} label={player.name} />
                      ))}
                    </span>
                  </span>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}

export function HostDuel({ view }: { view: HostView }) {
  const screen = view.screen;
  switch (screen.kind) {
    case 'DUEL_READ':
      return <ReadScreen view={view} screen={screen} />;
    case 'DUEL_GUESS':
      return <GuessScreen view={view} screen={screen} />;
    case 'DUEL_ENDORSE':
      return <EndorseScreen view={view} screen={screen} />;
    case 'DUEL_RESULT':
      return <ResultScreen view={view} screen={screen} />;
    default:
      return null;
  }
}
