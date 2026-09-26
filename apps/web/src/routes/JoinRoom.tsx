import {
  AVATAR_IDS,
  AVATAR_LABELS,
  checkName,
  isRoomCode,
  NAME_ISSUE_MESSAGES,
  NAME_MAX_GRAPHEMES,
  normalizeRoomCode,
  type AvatarId,
  type RoomPreview,
} from '@larpbox/shared';
import { ArrowRight, LogIn } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../components/game/Avatar';
import { RoomCodeChip } from '../components/game/RoomCode';
import { Wordmark } from '../components/game/Wordmark';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { StatusBanner } from '../components/ui/StatusBanner';
import { HttpFailure, joinRoom, previewRoom } from '../lib/http';
import { uuid } from '../lib/ids';
import {
  clearPendingRequest,
  pendingRequestId,
  playerCredentialFor,
  rememberPendingRequest,
  savePlayerCredential,
} from '../lib/session';

function previewProblem(preview: RoomPreview): string | null {
  if (preview.state !== 'LOBBY') return 'This game has already started. Join the next one.';
  if (!preview.canJoin) return 'This room is full. Games have up to eight players.';
  return null;
}

function CodeStep() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!isRoomCode(normalized)) {
      setError('Room codes are four letters, like KPRT.');
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const preview = await previewRoom(normalized);
      const problem = previewProblem(preview);
      if (problem && !playerCredentialFor(normalized)) {
        setError(problem);
        setChecking(false);
        return;
      }
      navigate(`/join/${normalized}`);
    } catch (failure) {
      setChecking(false);
      if (failure instanceof HttpFailure && (failure.code === 'ROOM_NOT_FOUND' || failure.code === 'ROOM_ENDED')) {
        setError("We couldn't find that room. Check the code on the big screen.");
      } else {
        setError(failure instanceof HttpFailure ? failure.message : 'Something went wrong. Try again.');
      }
    }
  };

  return (
    <form className="grid gap-5" onSubmit={submit} noValidate>
      <h1 className="font-display text-[36px] leading-[1.05]">Join your network.</h1>
      <Input
        label="Room code"
        value={code}
        onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Za-z]/g, '').slice(0, 4))}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
        maxLength={4}
        placeholder="ABCD"
        className="font-mono text-[28px] tracking-[0.3em] uppercase"
        error={error}
        data-testid="room-code-input"
        aria-describedby={undefined}
      />
      <Button type="submit" variant="primary" block loading={checking} loadingLabel="Checking…" icon={<ArrowRight size={20} aria-hidden="true" />} data-testid="continue">
        Continue
      </Button>
    </form>
  );
}

function NameStep({ code }: { code: string }) {
  const navigate = useNavigate();
  const saved = playerCredentialFor(code);
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [joinAsNew, setJoinAsNew] = useState(!saved);
  const [name, setName] = useState('');
  const [avatarId, setAvatarId] = useState<AvatarId>(AVATAR_IDS[0]);
  const [touched, setTouched] = useState(false);
  const [joining, setJoining] = useState(false);
  const [nameServerError, setNameServerError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    previewRoom(code)
      .then((result) => {
        if (cancelled) return;
        setPreview(result);
        // Suggest the first avatar nobody else has picked; repeats are still allowed.
        setAvatarId(AVATAR_IDS[Math.min(result.playerCount, AVATAR_IDS.length - 1)] ?? AVATAR_IDS[0]);
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setPreviewError(
          failure instanceof HttpFailure && (failure.code === 'ROOM_NOT_FOUND' || failure.code === 'ROOM_ENDED')
            ? "We couldn't find that room. It may have ended."
            : failure instanceof HttpFailure && failure.code === 'NOT_FOUND'
              ? failure.message
              : 'Could not check this room. You can still try to join.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const check = checkName(name);
  const nameError = touched && !check.ok ? NAME_ISSUE_MESSAGES[check.issues[0] ?? 'TOO_SHORT'] : null;
  const blocked = preview ? previewProblem(preview) : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!check.ok) {
      nameRef.current?.focus();
      return;
    }
    setJoining(true);
    setNameServerError(null);
    setFormError(null);
    const bodyKey = JSON.stringify({ name, avatarId });
    const requestId = pendingRequestId(`join:${code}`, bodyKey) ?? uuid();
    rememberPendingRequest(`join:${code}`, requestId, bodyKey);
    try {
      const joined = await joinRoom(code, requestId, name, avatarId);
      // Persist the credential before navigating so a refresh never creates a second player.
      savePlayerCredential({
        roomId: joined.roomId,
        roomCode: joined.roomCode,
        playerId: joined.playerId,
        token: joined.playerToken,
        name: check.name,
        createdAt: Date.now(),
      });
      clearPendingRequest(`join:${code}`);
      navigate(`/play/${joined.roomCode}`, { replace: true });
    } catch (failure) {
      setJoining(false);
      if (!(failure instanceof HttpFailure) || failure.kind === 'api') clearPendingRequest(`join:${code}`);
      if (failure instanceof HttpFailure) {
        if (failure.code === 'NAME_TAKEN') setNameServerError("That name's taken in this room. Try another.");
        else if (failure.code === 'BAD_INPUT' && failure.details.fieldErrors?.name) setNameServerError(failure.details.fieldErrors.name);
        else if (failure.code === 'GAME_STARTED') setFormError('This game has already started. Join the next one.');
        else if (failure.code === 'ROOM_FULL') setFormError('This room is full. Games have up to eight players.');
        else if (failure.code === 'ROOM_NOT_FOUND' || failure.code === 'ROOM_ENDED') setFormError('This room has ended. Ask the host for a new code.');
        else setFormError(failure.message);
      } else {
        setFormError('Something went wrong. Try again.');
      }
    }
  };

  if (saved && !joinAsNew) {
    return (
      <div className="grid gap-5">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-[32px] leading-[1.05]">Welcome back.</h1>
          <RoomCodeChip code={code} />
        </div>
        <p className="text-[18px]">This phone already has a seat in this room.</p>
        <Button variant="primary" block onClick={() => navigate(`/play/${code}`)} icon={<LogIn size={20} aria-hidden="true" />} data-testid="rejoin">
          Rejoin as {saved.name}
        </Button>
        <Button block onClick={() => setJoinAsNew(true)}>
          Join as someone else
        </Button>
      </div>
    );
  }

  return (
    <form className="grid gap-5" onSubmit={submit} noValidate>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[32px] leading-[1.05]">Join your network.</h1>
        <RoomCodeChip code={code} />
      </div>
      {previewError ? (
        <StatusBanner tone="red" icon="warning">
          {previewError}
        </StatusBanner>
      ) : null}
      {blocked ? (
        <StatusBanner tone="yellow" icon="warning">
          {blocked}
        </StatusBanner>
      ) : null}
      {preview && !blocked ? (
        <p className="phone-support">
          {preview.playerCount} of {preview.maxPlayers} seats taken.
        </p>
      ) : null}
      <Input
        ref={nameRef}
        label="What should we call you?"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setNameServerError(null);
        }}
        onBlur={() => setTouched(name.length > 0)}
        autoComplete="nickname"
        autoCapitalize="words"
        enterKeyHint="go"
        placeholder="Your name"
        hint={`2–${NAME_MAX_GRAPHEMES} characters. Emoji welcome.`}
        error={nameError ?? nameServerError}
        data-testid="name-input"
      />
      <fieldset className="grid gap-3">
        <legend className="field-label">Pick an avatar</legend>
        <div className="avatar-grid" role="radiogroup" aria-label="Avatar">
          {AVATAR_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={avatarId === id}
              className="avatar-option"
              onClick={() => setAvatarId(id)}
              data-testid={`avatar-${id}`}
            >
              <Avatar id={id} size={44} decorative />
              <span>{AVATAR_LABELS[id]}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {formError ? (
        <StatusBanner tone="red" icon="warning" role="alert">
          {formError}
        </StatusBanner>
      ) : null}
      <Button type="submit" variant="primary" block loading={joining} loadingLabel="Joining…" disabled={blocked !== null} data-testid="join-room">
        Join room
      </Button>
      {saved ? (
        <Button variant="ghost" onClick={() => setJoinAsNew(false)}>
          Rejoin as {saved.name} instead
        </Button>
      ) : null}
    </form>
  );
}

export default function JoinRoom() {
  const params = useParams();
  const code = params.code ? normalizeRoomCode(params.code) : null;
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col gap-6 px-4 pb-10 pt-5">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Link to="/help" className="font-semibold">
          Help
        </Link>
      </header>
      <main className="card p-5">{code && isRoomCode(code) ? <NameStep key={code} code={code} /> : <CodeStep />}</main>
    </div>
  );
}
