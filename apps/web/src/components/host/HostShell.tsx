import type { HostView } from '@larpbox/shared';
import { ChevronDown, Maximize, Minimize, Pause, Play, Plus, Power, Settings, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useConnection } from '../../hooks/useRoomConnection';
import { hostAudio } from '../../lib/audio';
import type { ConnectionStatus } from '../../lib/socket';
import { BrandLogo } from '../brand/BrandLogo';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { StatusBanner } from '../ui/StatusBanner';
import { Timer } from '../ui/Timer';

export function useFullscreen() {
  const [active, setActive] = useState(() => typeof document !== 'undefined' && document.fullscreenElement !== null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggle = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setFailed(true);
    } catch {
      setFailed(true);
    }
  };
  return { active, failed, toggle };
}

export function SoundToggle() {
  const [enabled, setEnabled] = useState(hostAudio.enabled);
  return (
    <Button
      small
      aria-pressed={enabled}
      onClick={() => {
        hostAudio.setEnabled(!enabled);
        setEnabled(!enabled);
      }}
      icon={enabled ? <Volume2 size={22} aria-hidden="true" /> : <VolumeX size={22} aria-hidden="true" />}
      data-testid="sound-toggle"
    >
      {enabled ? 'Sound on' : 'Sound off'}
    </Button>
  );
}

export function FullscreenButton() {
  const fullscreen = useFullscreen();
  return (
    <div className="relative">
      <Button
        small
        onClick={() => void fullscreen.toggle()}
        icon={fullscreen.active ? <Minimize size={22} aria-hidden="true" /> : <Maximize size={22} aria-hidden="true" />}
      >
        {fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'}
      </Button>
      {fullscreen.failed ? (
        <p className="absolute right-0 top-full mt-2 w-64 rounded-[10px] border-2 border-ink bg-surface p-2 text-[14px]" role="status">
          Use your browser's fullscreen controls.
        </p>
      ) : null}
    </div>
  );
}

/** Compact labelled host menu, anchored top right. Destructive actions confirm first. */
export function HostMenu({ view }: { view: HostView }) {
  const connection = useConnection();
  const [open, setOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const timed = view.phase.durationMs !== null;
  const paused = view.phase.paused;
  const canExtend = view.screen.kind === 'WRITING' && !view.screen.extensionUsed && !paused;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = async (label: string, action: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(label);
    setError(null);
    const result = await action();
    setBusy(null);
    if (!result.ok) setError(result.message ?? 'That did not work. Try again.');
    else setOpen(false);
    return result.ok;
  };

  const endRoom = async () => {
    if (!connection) return;
    // A stale phase is refused; refresh and retry the confirmed intent with a new envelope.
    let result = await connection.command('host.closeRoom', {});
    if (!result.ok && (result.code === 'PHASE_CHANGED' || result.code === 'DEADLINE_PASSED')) {
      result = await connection.command('host.closeRoom', {});
    }
    if (!result.ok) setError(result.message);
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button
        small
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        icon={<Settings size={22} aria-hidden="true" />}
        data-testid="host-menu"
      >
        Host controls <ChevronDown size={18} aria-hidden="true" />
      </Button>
      {open ? (
        <div className="host-menu" role="menu" aria-label="Host controls">
          {timed ? (
            paused ? (
              <button
                type="button"
                role="menuitem"
                className="host-menu-item"
                disabled={busy !== null}
                onClick={() => void run('resume', () => connection?.command('host.resume', {}) ?? Promise.resolve({ ok: false }))}
              >
                <Play size={20} aria-hidden="true" /> Resume
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="host-menu-item"
                disabled={busy !== null}
                onClick={() => void run('pause', () => connection?.command('host.pause', {}) ?? Promise.resolve({ ok: false }))}
                data-testid="menu-pause"
              >
                <Pause size={20} aria-hidden="true" /> Pause
              </button>
            )
          ) : null}
          {view.screen.kind === 'WRITING' ? (
            <button
              type="button"
              role="menuitem"
              className="host-menu-item"
              disabled={!canExtend || busy !== null}
              onClick={() =>
                void run('extend', () => connection?.command('host.extendWriting', { seconds: 30 }) ?? Promise.resolve({ ok: false }))
              }
            >
              <Plus size={20} aria-hidden="true" />
              {view.screen.extensionUsed ? 'Added 30 seconds' : 'Add 30 seconds'}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="host-menu-item host-menu-item-danger"
            onClick={() => {
              setOpen(false);
              setConfirmEnd(true);
            }}
            data-testid="menu-end"
          >
            <Power size={20} aria-hidden="true" /> {view.phase.name === 'LOBBY' || view.phase.name === 'FINAL' ? 'Close room' : 'End game'}
          </button>
          {error ? (
            <p className="field-error px-2" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
      <EndRoomDialog open={confirmEnd} onCancel={() => setConfirmEnd(false)} onConfirm={endRoom} error={error} />
    </div>
  );
}

export function EndRoomDialog({
  open,
  onCancel,
  onConfirm,
  error,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  error?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} title="End this room?" onClose={onCancel}>
      <p>Everyone will be disconnected and this game's results will be lost.</p>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={onCancel}>Keep playing</Button>
        <Button
          variant="danger"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await onConfirm();
            setBusy(false);
          }}
          data-testid="confirm-end-room"
        >
          End room
        </Button>
      </div>
    </Modal>
  );
}

/** The paused overlay keeps whatever the phase already shows; it just covers it with the status. */
export function PauseOverlay({ view }: { view: HostView }) {
  const connection = useConnection();
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  if (!view.phase.paused) return null;
  const endRoom = async () => {
    if (!connection) return;
    await connection.command('host.closeRoom', {});
  };
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title" data-testid="pause-overlay">
      <div className="card tape grid w-full max-w-[680px] gap-5 p-8 text-center">
        <p className="eyebrow">Paused · {Math.ceil((view.phase.remainingMs ?? 0) / 1000)} seconds left on the clock</p>
        <h2 id="pause-title" className="host-heading">
          Meeting on <span className="accent">hold.</span>
        </h2>
        <p className="text-[22px]">
          {view.phase.pauseReason === 'HOST_DISCONNECTED'
            ? 'The big screen lost its connection. Everyone’s time is frozen.'
            : 'The host paused the game. Everyone’s time is frozen.'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await connection?.command('host.resume', {});
              setBusy(false);
            }}
            icon={<Play size={22} aria-hidden="true" />}
            data-testid="resume"
          >
            Resume
          </Button>
          <Button variant="secondary" onClick={() => setConfirmEnd(true)} icon={<Power size={22} aria-hidden="true" />}>
            End game
          </Button>
        </div>
      </div>
      <EndRoomDialog open={confirmEnd} onCancel={() => setConfirmEnd(false)} onConfirm={endRoom} />
    </div>
  );
}

export function HostTopBar({ view, center, showTimer = true }: { view: HostView; center?: ReactNode; showTimer?: boolean }) {
  return (
    <header className="host-topbar">
      <BrandLogo />
      <div className="host-topbar-center">{center}</div>
      {showTimer ? <Timer phase={view.phase} variant="host" /> : null}
      <SoundToggle />
      <FullscreenButton />
      <HostMenu view={view} />
    </header>
  );
}

export function HostConnectionBanner({ status }: { status: ConnectionStatus }) {
  if (status === 'connected' || status === 'connecting') return null;
  return (
    <StatusBanner tone="amber" icon="offline">
      The big screen is reconnecting. Play is paused for everyone until it's back.
    </StatusBanner>
  );
}

export function DuelContext({ view }: { view: HostView }) {
  return (
    <>
      <span>
        Round <strong>{view.roundNumber}</strong> · Post-off <strong>{view.duelNumber}</strong> of {view.duelsInRound}
      </span>
      <span>
        <span className="sr-only">Room code {view.roomCode.split('').join(' ')}</span>
        <span aria-hidden="true">
          Room <strong>{view.roomCode}</strong>
        </span>
      </span>
    </>
  );
}
