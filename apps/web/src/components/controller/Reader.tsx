import type { DuelPosts, Endorsement, PlayerView, Side } from '@larpbox/shared';
import { ChevronDown, CircleCheck, CircleX, Lock } from 'lucide-react';
import { useState } from 'react';
import type { RoomConnection } from '../../lib/socket';
import { PostCard } from '../game/PostCard';
import { FactsList, TruthBanner } from '../game/TruthBanner';
import { useAnnounce } from '../ui/Announcer';
import { Button } from '../ui/Button';
import { ChoiceGroup } from '../ui/ChoiceGroup';
import { ScreenHeading } from '../ui/ScreenHeading';
import { StatusBanner } from '../ui/StatusBanner';
import { Timer } from '../ui/Timer';

type DuelView = PlayerView & { screen: Extract<PlayerView['screen'], { kind: 'DUEL_READ' | 'DUEL_GUESS' | 'DUEL_ENDORSE' }> };

function DuelHeader({ view }: { view: PlayerView }) {
  return (
    <div className="phone-sticky-bar">
      <span className="min-w-0 flex-1 font-mono text-[14px] font-medium leading-tight">
        Round {view.roundNumber} · Post-off {view.duelNumber} of {view.duelsInRound}
      </span>
      <Timer phase={view.phase} variant="phone" />
    </div>
  );
}

function Posts({ posts, mySide }: { posts: DuelPosts; mySide: Side | null }) {
  return (
    <div className="grid gap-4">
      {(['A', 'B'] as const).map((side) => (
        <PostCard key={side} side={side} post={posts[side]} mine={mySide === side} headingLevel={3} />
      ))}
    </div>
  );
}

function CollapsiblePosts({ posts, mySide }: { posts: DuelPosts; mySide: Side | null }) {
  return (
    <details className="details-panel" open>
      <summary>
        The two posts <ChevronDown size={20} aria-hidden="true" />
      </summary>
      <div className="details-content">
        <Posts posts={posts} mySide={mySide} />
      </div>
    </details>
  );
}

function WriterNote({ view, children }: { view: DuelView; children: React.ReactNode }) {
  return (
    <>
      {children}
      {view.screen.me.autoSubmitted ? (
        <StatusBanner tone="blue" icon="info">
          Your saved draft was submitted.
        </StatusBanner>
      ) : null}
    </>
  );
}

function ReadScreen({ view }: { view: DuelView }) {
  const me = view.screen.me;
  return (
    <div className="grid gap-4 enter">
      <DuelHeader view={view} />
      {me.role === 'WRITER' ? (
        <WriterNote view={view}>
          <ScreenHeading className="phone-heading">Your announcement is up.</ScreenHeading>
          <p className="text-[18px] font-semibold">You sit this one out.</p>
        </WriterNote>
      ) : (
        <>
          <ScreenHeading className="phone-heading">Two announcements. One very ordinary event.</ScreenHeading>
          <p className="phone-support">Read the posts. Guessing opens in a moment.</p>
        </>
      )}
      <Posts posts={view.screen.posts} mySide={me.side} />
    </div>
  );
}

function GuessScreen({ view, connection, connected }: { view: DuelView; connection: RoomConnection | null; connected: boolean }) {
  const announce = useAnnounce();
  const screen = view.screen.kind === 'DUEL_GUESS' ? view.screen : null;
  const [selected, setSelected] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!screen) return null;
  const me = screen.me;
  const lockedId = me.guessOptionId;

  if (me.role === 'WRITER') {
    return (
      <div className="grid gap-4 enter">
        <DuelHeader view={view} />
        <WriterNote view={view}>
          <ScreenHeading className="phone-heading">You already know.</ScreenHeading>
          <p className="text-[18px] font-semibold">Let the others figure it out.</p>
        </WriterNote>
        <p className="phone-support">
          {screen.lockedCount} of {screen.eligibleCount} guesses locked
        </p>
        <Posts posts={screen.posts} mySide={me.side} />
      </div>
    );
  }

  const lock = async () => {
    if (!connection || !selected) return;
    setSending(true);
    setError(null);
    const result = await connection.command('duel.lockGuess', { duelId: screen.duelId, optionId: selected });
    setSending(false);
    if (result.ok) announce('Guess locked.');
    else if (result.code !== 'ALREADY_LOCKED' && result.code !== 'PHASE_CHANGED' && result.code !== 'DEADLINE_PASSED') {
      setError(result.message);
    }
  };

  return (
    <div className="grid gap-4 enter">
      <DuelHeader view={view} />
      <ScreenHeading className="phone-heading">What actually happened?</ScreenHeading>
      <CollapsiblePosts posts={screen.posts} mySide={null} />
      {lockedId ? (
        <div className="grid gap-3" data-testid="guess-locked">
          <StatusBanner tone="green" icon="none">
            <span className="inline-flex items-center gap-2">
              <Lock size={18} aria-hidden="true" /> Guess locked. We'll reveal the truth next.
            </span>
          </StatusBanner>
          <p className="mini-post">
            <span className="eyebrow block">Your guess</span>
            {screen.options.find((option) => option.id === lockedId)?.label}
          </p>
        </div>
      ) : (
        <>
          <ChoiceGroup
            label="What actually happened?"
            value={selected}
            onChange={setSelected}
            disabled={!connected || view.phase.paused}
            choices={screen.options.map((option, index) => ({
              value: option.id,
              label: option.label,
              index: String(index + 1),
            }))}
          />
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            variant="primary"
            block
            disabled={!selected || !connected || view.phase.paused}
            loading={sending}
            loadingLabel="Locking…"
            onClick={lock}
            data-testid="lock-guess"
          >
            Lock guess
          </Button>
          {!selected ? <p className="phone-support text-center">Pick one, then lock it in. You can change your pick until you lock.</p> : null}
        </>
      )}
      <p className="phone-support text-center">
        {screen.lockedCount} of {screen.eligibleCount} guesses locked
      </p>
    </div>
  );
}

const ENDORSE_LABELS: Record<Endorsement, string> = {
  A: 'Endorse A',
  B: 'Endorse B',
  NEITHER: 'Endorse neither',
};

function EndorseScreen({ view, connection, connected }: { view: DuelView; connection: RoomConnection | null; connected: boolean }) {
  const announce = useAnnounce();
  const screen = view.screen.kind === 'DUEL_ENDORSE' ? view.screen : null;
  const [selected, setSelected] = useState<Endorsement | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!screen) return null;
  const me = screen.me;

  const truthBlock = (
    <div className="grid gap-3">
      <TruthBanner truth={screen.truth} />
      <details className="details-panel" open>
        <summary>
          The facts <ChevronDown size={20} aria-hidden="true" />
        </summary>
        <div className="details-content">
          <FactsList facts={screen.facts} boundaries={screen.boundaries} />
        </div>
      </details>
    </div>
  );

  if (me.role === 'WRITER') {
    return (
      <div className="grid gap-4 enter">
        <DuelHeader view={view} />
        <WriterNote view={view}>
          <ScreenHeading className="phone-heading">The truth is out.</ScreenHeading>
          <p className="text-[18px] font-semibold">The room is judging your post. You can't vote on this one.</p>
        </WriterNote>
        {truthBlock}
        <Posts posts={screen.posts} mySide={me.side} />
      </div>
    );
  }

  const lock = async () => {
    if (!connection || !selected) return;
    setSending(true);
    setError(null);
    const result = await connection.command('duel.lockEndorsement', { duelId: screen.duelId, choice: selected });
    setSending(false);
    if (result.ok) announce('Endorsement recorded.');
    else if (result.code !== 'ALREADY_LOCKED' && result.code !== 'PHASE_CHANGED' && result.code !== 'DEADLINE_PASSED') {
      setError(result.message);
    }
  };

  return (
    <div className="grid gap-4 enter">
      <DuelHeader view={view} />
      <ScreenHeading className="phone-heading">Who made the most out of the least?</ScreenHeading>
      {truthBlock}
      {me.guessCorrect !== null ? (
        <p className={`inline-flex items-center gap-2 font-semibold ${me.guessCorrect ? 'text-green' : 'muted'}`} data-testid="guess-verdict">
          {me.guessCorrect ? <CircleCheck size={20} aria-hidden="true" /> : <CircleX size={20} aria-hidden="true" />}
          {me.guessCorrect ? 'You guessed right.' : 'Your guess missed this time.'}
        </p>
      ) : (
        <p className="font-semibold muted">You didn't lock a guess for this one.</p>
      )}
      <Posts posts={screen.posts} mySide={null} />
      <p className="text-[19px] font-bold leading-snug">Which post made this sound most impressive—and stayed technically true?</p>
      <p className="phone-support">If a post invented facts, don't endorse it. Neither is a valid choice.</p>
      {me.endorsement ? (
        <StatusBanner tone="green" icon="none">
          <span className="inline-flex items-center gap-2" data-testid="endorsement-locked">
            <Lock size={18} aria-hidden="true" /> Endorsement recorded. ({ENDORSE_LABELS[me.endorsement]})
          </span>
        </StatusBanner>
      ) : (
        <>
          <ChoiceGroup
            label="Your endorsement"
            value={selected}
            onChange={setSelected}
            disabled={!connected || view.phase.paused}
            choices={(['A', 'B', 'NEITHER'] as const).map((choice) => ({
              value: choice,
              label: ENDORSE_LABELS[choice],
              disabled: !screen.availableChoices.includes(choice),
              ...(screen.availableChoices.includes(choice) ? {} : { description: 'Nothing was submitted, so it cannot be endorsed.' }),
            }))}
          />
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            variant="primary"
            block
            disabled={!selected || !connected || view.phase.paused}
            loading={sending}
            loadingLabel="Locking…"
            onClick={lock}
            data-testid="lock-endorsement"
          >
            Lock endorsement
          </Button>
        </>
      )}
      <p className="phone-support text-center">
        {screen.lockedCount} of {screen.eligibleCount} endorsements locked
      </p>
    </div>
  );
}

export function ControllerDuel({ view, connection, connected }: { view: PlayerView; connection: RoomConnection | null; connected: boolean }) {
  const kind = view.screen.kind;
  if (kind !== 'DUEL_READ' && kind !== 'DUEL_GUESS' && kind !== 'DUEL_ENDORSE') return null;
  const duelView = view as DuelView;
  // Keyed by phase so unlocked selections never leak from one phase or duel into the next.
  if (kind === 'DUEL_READ') return <ReadScreen key={view.phase.id} view={duelView} />;
  if (kind === 'DUEL_GUESS') return <GuessScreen key={view.phase.id} view={duelView} connection={connection} connected={connected} />;
  return <EndorseScreen key={view.phase.id} view={duelView} connection={connection} connected={connected} />;
}
