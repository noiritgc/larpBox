import { checkPost, POST_ISSUE_MESSAGES, POST_MAX_GRAPHEMES, type AssignmentView, type PlayerView } from '@larpbox/shared';
import { ChevronDown, Lock, PenLine, RotateCw } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useDraft, type SaveStatus } from '../../hooks/useDraft';
import { usePhaseTimer } from '../../hooks/usePhaseTimer';
import type { RoomConnection } from '../../lib/socket';
import { FactsList } from '../game/TruthBanner';
import { useAnnounce } from '../ui/Announcer';
import { Button } from '../ui/Button';
import { ScreenHeading } from '../ui/ScreenHeading';
import { StatusBanner } from '../ui/StatusBanner';
import { Timer } from '../ui/Timer';

function saveStatusText(status: SaveStatus, connected: boolean): string {
  switch (status) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'local':
      return connected ? 'Saved on this phone' : 'Saved on this phone; reconnecting…';
    case 'paused':
      return 'Saved on this phone while paused';
    case 'error':
      return "Couldn't save. Will retry as you type.";
    default:
      return '';
  }
}

function Composer({
  view,
  assignment,
  connection,
  connected,
  closing,
  factsOpen,
  onFactsToggle,
  otherOpen,
  onGoToOther,
}: {
  view: PlayerView;
  assignment: AssignmentView;
  connection: RoomConnection | null;
  connected: boolean;
  closing: boolean;
  factsOpen: boolean;
  onFactsToggle: (open: boolean) => void;
  otherOpen: boolean;
  onGoToOther: () => void;
}) {
  const announce = useAnnounce();
  const paused = view.phase.paused;
  const draft = useDraft({
    gameId: view.gameId ?? '',
    roomId: view.roomId,
    assignment,
    connection,
    connected,
    paused,
  });
  const [touched, setTouched] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const baseId = useId();

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 4, 220)}px`;
  }, [draft.text]);

  const locked = assignment.status === 'LOCKED';
  if (locked) {
    return (
      <div className="grid gap-4 enter">
        <div>
          <p className="eyebrow mb-2">What actually happened</p>
          <p className="truth-box">{assignment.truth}</p>
        </div>
        <article className="mini-post" aria-label="Your locked post" data-testid="locked-post">
          {assignment.finalText}
        </article>
        <StatusBanner tone="green" icon="none">
          <span className="inline-flex items-center gap-2">
            <Lock size={18} aria-hidden="true" /> Post locked.
          </span>
        </StatusBanner>
        {otherOpen ? (
          <Button variant="primary" block onClick={onGoToOther} icon={<PenLine size={20} aria-hidden="true" />}>
            Write your other post
          </Button>
        ) : null}
      </div>
    );
  }

  const check = checkPost(draft.text);
  const overLimit = check.issues.includes('TOO_LONG') || check.issues.includes('TOO_MANY_BYTES');
  const tooShort = touched && check.graphemes < 20;
  const otherIssue = check.issues.find((issue) => issue === 'TOO_MANY_LINES' || issue === 'BIDI_CONTROL' || issue === 'TOO_MANY_BYTES');
  let disabledReason: string | null = null;
  if (!connected) disabledReason = 'Reconnecting… your text is saved on this phone.';
  else if (paused) disabledReason = 'The game is paused. Your time is safe.';
  else if (closing) disabledReason = 'Time is up. Your saved draft will be submitted.';
  else if (!check.okForLock) disabledReason = check.graphemes < 20 ? 'Write at least 20 characters to lock.' : 'Fix the post above to lock it.';
  const status = saveStatusText(draft.saveStatus, connected);

  const lock = async () => {
    setTouched(true);
    const ok = await draft.lock();
    if (ok) announce('Post locked.');
  };

  return (
    <div className="grid gap-4">
      <div>
        <p className="eyebrow mb-2" id={`${baseId}-truth-label`}>
          What actually happened
        </p>
        <p className="truth-box" data-testid="assignment-truth">
          {assignment.truth}
        </p>
      </div>
      <details
        className="details-panel"
        open={factsOpen}
        onToggle={(event) => onFactsToggle((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          The facts <ChevronDown size={20} aria-hidden="true" />
        </summary>
        <div className="details-content">
          <FactsList facts={assignment.facts} boundaries={assignment.boundaries} />
        </div>
      </details>
      <div className="grid gap-2">
        <label htmlFor={`${baseId}-post`} className="font-display text-[21px] font-bold leading-tight">
          Make this sound like a career milestone.
        </label>
        <p className="phone-support">Exaggerate the language, not the facts.</p>
        <textarea
          ref={textareaRef}
          id={`${baseId}-post`}
          className="composer"
          rows={6}
          maxLength={4096}
          placeholder="I'm humbled to announce…"
          value={draft.text}
          onChange={(event) => draft.setText(event.target.value)}
          onBlur={() => {
            if (draft.text.length > 0) setTouched(true);
            draft.flush();
          }}
          aria-invalid={overLimit || tooShort || otherIssue ? true : undefined}
          aria-describedby={`${baseId}-count ${baseId}-status`}
          autoComplete="off"
          spellCheck
          data-testid="composer"
        />
        <div className="composer-meta">
          <span id={`${baseId}-count`} className={`composer-count ${overLimit ? 'composer-count-over' : ''}`} data-testid="grapheme-count">
            {check.graphemes} / {POST_MAX_GRAPHEMES}
            <span className="sr-only"> characters</span>
          </span>
          <span id={`${baseId}-status`} className="inline-flex items-center gap-2 text-[15px] muted" data-testid="save-status">
            {status}
            {draft.saveStatus === 'error' ? (
              <button type="button" className="inline-flex items-center gap-1 font-semibold text-blue underline" onClick={draft.flush}>
                <RotateCw size={14} aria-hidden="true" /> Retry
              </button>
            ) : null}
          </span>
        </div>
        <div className="min-h-[24px]">
          {tooShort ? <p className="field-error">20 characters minimum</p> : null}
          {!tooShort && otherIssue ? <p className="field-error">{POST_ISSUE_MESSAGES[otherIssue]}</p> : null}
          {!tooShort && !otherIssue && overLimit ? <p className="field-error">{POST_ISSUE_MESSAGES.TOO_LONG}</p> : null}
        </div>
      </div>
      {draft.restored ? (
        <StatusBanner tone="blue" icon="info">
          We restored your draft from this phone.
        </StatusBanner>
      ) : null}
      {draft.message ? (
        <p className="field-error" role="alert">
          {draft.message}
        </p>
      ) : null}
      <div className="grid gap-2">
        <Button
          variant="primary"
          block
          disabled={disabledReason !== null}
          loading={draft.locking}
          loadingLabel="Locking…"
          onClick={lock}
          icon={<Lock size={20} aria-hidden="true" />}
          data-testid="lock-post"
        >
          Lock post
        </Button>
        {disabledReason && !draft.locking ? <p className="phone-support text-center">{disabledReason}</p> : null}
      </div>
    </div>
  );
}

function AllLocked({ assignments }: { assignments: AssignmentView[] }) {
  return (
    <div className="grid gap-4 enter" data-testid="writing-done">
      <ScreenHeading className="phone-heading">Your personal brand is ready.</ScreenHeading>
      <p className="text-[18px] font-semibold">Look at the big screen.</p>
      {assignments.map((assignment, index) => (
        <div key={assignment.id} className="grid gap-1">
          <p className="eyebrow">Post {index + 1}</p>
          <article className="mini-post">{assignment.finalText}</article>
        </div>
      ))}
    </div>
  );
}

export function ControllerWriter({
  view,
  connection,
  connected,
}: {
  view: PlayerView;
  connection: RoomConnection | null;
  connected: boolean;
}) {
  const assignments = view.screen.kind === 'WRITING' ? view.screen.assignments : [];
  const [active, setActive] = useState(() => {
    const firstOpen = assignments.findIndex((a) => a.status === 'DRAFT');
    return firstOpen === -1 ? 0 : firstOpen;
  });
  const [factsOpen, setFactsOpen] = useState<Record<string, boolean>>({});
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const timer = usePhaseTimer(view.phase);

  if (assignments.length === 0) return null;
  const allDone = assignments.every((assignment) => assignment.status !== 'DRAFT');
  if (allDone) return <AllLocked assignments={assignments} />;

  const index = Math.min(active, assignments.length - 1);
  const current = assignments[index] as AssignmentView;
  const otherIndex = assignments.findIndex((a, i) => i !== index && a.status === 'DRAFT');
  const warn = !view.phase.paused && timer.seconds !== null && timer.seconds <= 15;

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (i + (event.key === 'ArrowRight' ? 1 : -1) + assignments.length) % assignments.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="grid gap-4">
      <div className="phone-sticky-bar">
        <ScreenHeading className="font-display text-[22px] leading-none">Round {view.roundNumber}</ScreenHeading>
        <Timer phase={view.phase} variant="phone" urgentBelow={15} />
      </div>
      {warn ? (
        <StatusBanner tone="yellow" icon="warning" role="alert">
          Time's almost up. Your saved drafts will be submitted.
        </StatusBanner>
      ) : null}
      <div role="tablist" aria-label="Your two posts" className="tabs">
        {assignments.map((assignment, i) => {
          const isLocked = assignment.status === 'LOCKED';
          return (
            <button
              key={assignment.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${i}`}
              aria-selected={i === index}
              aria-controls={`${baseId}-panel`}
              tabIndex={i === index ? 0 : -1}
              className="tab"
              onClick={() => setActive(i)}
              onKeyDown={(event) => onTabKey(event, i)}
              data-testid={`post-tab-${i + 1}`}
            >
              Post {i + 1}
              {isLocked ? <Lock size={18} aria-hidden="true" /> : <PenLine size={18} aria-hidden="true" />}
              <span className="sr-only">{isLocked ? ', locked' : ', draft'}</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${index}`}>
        <Composer
          key={current.id}
          view={view}
          assignment={current}
          connection={connection}
          connected={connected}
          closing={timer.expired}
          factsOpen={factsOpen[current.id] ?? true}
          onFactsToggle={(open) => setFactsOpen((prev) => ({ ...prev, [current.id]: open }))}
          otherOpen={otherIndex !== -1}
          onGoToOther={() => {
            if (otherIndex !== -1) {
              setActive(otherIndex);
              tabRefs.current[otherIndex]?.focus();
            }
          }}
        />
      </div>
    </div>
  );
}
