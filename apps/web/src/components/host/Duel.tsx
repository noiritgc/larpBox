import type { HostView, PublicPlayer, Side } from '@larpbox/shared';
import { CircleCheck } from 'lucide-react';
import { formatClout, plural, signedClout } from '../../lib/format';
import { Avatar } from '../game/Avatar';
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
    <div className="host" data-testid="host-duel-read">
      <HostTopBar view={view} center={<DuelContext view={view} />} />
      <main className="host-main">
        <ScreenHeading className="host-heading">Two announcements. One very ordinary event.</ScreenHeading>
        <ScrollArea>
          <AnonymousPosts posts={screen.posts} />
        </ScrollArea>
      </main>
    </div>
  );
}

function GuessScreen({ view, screen }: { view: HostView; screen: Screen<'DUEL_GUESS'> }) {
  return (
    <div className="host" data-testid="host-duel-guess">
      <HostTopBar view={view} center={<DuelContext view={view} />} />
      <main className="host-main">
        <ScrollArea>
          <div className="grid gap-[var(--host-gap)]">
            <AnonymousPosts posts={screen.posts} />
            <div className="flex flex-wrap items-end justify-between gap-4">
              <ScreenHeading className="host-heading">What actually happened?</ScreenHeading>
              <p className="font-display text-[clamp(24px,calc(6px+1.25vw),36px)] font-bold" data-testid="guess-count">
                {screen.lockedCount} of {plural(screen.eligibleCount, 'guess', 'guesses')} locked
              </p>
            </div>
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
    <div className="host" data-testid="host-duel-endorse">
      <HostTopBar view={view} center={<DuelContext view={view} />} />
      <main className="host-main">
        <ScrollArea>
          <div className="grid gap-[var(--host-gap)]">
            <TruthBanner truth={screen.truth} size="host" />
            <FactsList facts={screen.facts} boundaries={screen.boundaries} className="host-facts md:grid-cols-2" />
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="grid gap-1">
                <ScreenHeading className="host-heading">Who made the most out of the least?</ScreenHeading>
                <p className="host-subheading">Endorse the funniest post that stayed true.</p>
              </div>
              <p className="font-display text-[clamp(24px,calc(6px+1.25vw),36px)] font-bold" data-testid="endorse-count">
                {screen.lockedCount} of {plural(screen.eligibleCount, 'endorsement')} locked
              </p>
            </div>
            <AnonymousPosts posts={screen.posts} />
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
    <div className="host" data-testid="host-duel-result">
      <HostTopBar view={view} center={<DuelContext view={view} />} />
      <main className="host-main">
        <ScrollArea>
          <div className="grid gap-[var(--host-gap)]">
            <TruthBanner truth={result.truth} size="host" />
            {unfilled ? (
              <div className="grid place-items-center gap-6 py-8 text-center">
                <ScreenHeading className="host-heading">Both positions remain unfilled.</ScreenHeading>
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
                        <p className="flex flex-wrap items-baseline gap-x-4 font-display font-bold" data-testid={`result-${side}`}>
                          <span className="text-[var(--host-score)]">{plural(outcome.votes, 'endorsement')}</span>
                          <span className="text-[var(--host-score)] text-blue">{signedClout(outcome.points)} Clout</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-[var(--host-label)] font-semibold">
                  <span>{plural(result.votesNeither, 'reader')} chose neither</span>
                  <span className="inline-flex items-center gap-3">
                    <CircleCheck size={28} aria-hidden="true" className="text-green" />
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
