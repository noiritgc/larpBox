import type { PlayerView } from '@larpbox/shared';
import { Check, CircleDashed } from 'lucide-react';
import { useState } from 'react';
import { useConnection } from '../../hooks/useRoomConnection';
import { Avatar } from '../game/Avatar';
import { useAnnounce } from '../ui/Announcer';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ScreenHeading } from '../ui/ScreenHeading';
import { StatusBanner } from '../ui/StatusBanner';

export function ControllerLobby({ view, onLeft }: { view: PlayerView; onLeft: () => void }) {
  const connection = useConnection();
  const announce = useAnnounce();
  const me = view.players.find((player) => player.id === view.selfId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  if (!me || view.screen.kind !== 'LOBBY') return null;
  const screen = view.screen;

  const toggleReady = async () => {
    if (!connection) return;
    setBusy(true);
    setError(null);
    const result = await connection.command('player.setReady', { ready: !me.ready });
    setBusy(false);
    if (result.ok) announce(me.ready ? 'Not ready.' : 'Ready.');
    else if (result.code !== 'PHASE_CHANGED') setError(result.message);
  };

  const leave = async () => {
    if (!connection) return;
    setLeaving(true);
    const result = await connection.command('player.leave', {});
    setLeaving(false);
    if (result.ok || result.code === 'UNAUTHORIZED') {
      setConfirmLeave(false);
      onLeft();
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="grid gap-5 enter">
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <Avatar id={me.avatarId} size={112} />
        <ScreenHeading className="phone-heading">You're in, {me.name}.</ScreenHeading>
        <p className="font-mono text-[15px] muted">{me.headline}</p>
      </div>
      {screen.settingsChanged && !me.ready ? (
        <StatusBanner tone="yellow" icon="info">
          Settings changed. Ready up again.
        </StatusBanner>
      ) : null}
      <Button
        variant={me.ready ? 'secondary' : 'primary'}
        block
        loading={busy}
        onClick={toggleReady}
        aria-pressed={me.ready}
        data-testid="ready-button"
        icon={me.ready ? <Check size={20} aria-hidden="true" /> : undefined}
      >
        {me.ready ? 'Ready: tap to undo' : "I'm ready"}
      </Button>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <section aria-labelledby="lobby-roster" className="grid gap-2">
        <h2 id="lobby-roster" className="eyebrow">
          In the room · {screen.readyCount} of {view.players.length} ready
        </h2>
        <ul className="grid gap-2">
          {view.players.map((player) => (
            <li key={player.id} className="flex items-center gap-3 rounded-[12px] border-2 border-ink bg-surface px-3 py-2">
              <Avatar id={player.avatarId} size={36} decorative />
              <span className="min-w-0 flex-1 truncate font-semibold">
                {player.name}
                {player.id === me.id ? <span className="muted"> (you)</span> : null}
              </span>
              {!player.connected ? (
                <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-amber">
                  <span className="status-dot status-dot-off" aria-hidden="true" />
                  {player.joining ? 'Joining…' : 'Offline'}
                </span>
              ) : player.ready ? (
                <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-green">
                  <Check size={16} aria-hidden="true" /> Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[14px] font-semibold muted">
                  <CircleDashed size={16} aria-hidden="true" /> Not ready
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <p className="phone-support text-center">Keep this page open. Your first assignment will appear here.</p>
      <div className="flex justify-center">
        <Button variant="ghost" onClick={() => setConfirmLeave(true)}>
          Leave room
        </Button>
      </div>
      <Modal open={confirmLeave} title="Leave this room?" onClose={() => setConfirmLeave(false)}>
        <p>You can join again with the room code while the game is still in the lobby.</p>
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => setConfirmLeave(false)}>Stay</Button>
          <Button variant="danger" loading={leaving} onClick={leave}>
            Leave
          </Button>
        </div>
      </Modal>
    </div>
  );
}
